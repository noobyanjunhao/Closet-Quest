-- Release terminal drafts from queue capacity; avoid reversed row-lock waits.
begin;
create or replace function private.enqueue_purchase_import() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.payload->>'provider'<>'worker' then return new; end if;
 if new.payload->>'status'='queued' and (tg_op='INSERT' or coalesce(old.payload->>'generation','')<>new.payload->>'generation') then
  perform pg_catalog.pg_advisory_xact_lock(770031);
  if (select count(*) from public.purchase_import_jobs where user_id=new.user_id and state in ('queued','leased') and import_id<>new.id)>=8
   or (select count(*) from public.purchase_import_jobs where state in ('queued','leased') and import_id<>new.id)>=200 then
   raise exception 'Import queue is full' using errcode='54000';
  end if;
  insert into public.purchase_import_jobs(import_id,user_id,generation,state) values(new.id,new.user_id,(new.payload->>'generation')::integer,'queued')
  on conflict(import_id) do update set generation=excluded.generation,state='queued',attempts=0,lease_token=null,lease_until=null,worker_hash=null,created_at=now(),updated_at=now();
 elsif new.payload->>'status'='cancelled' or (old.payload->>'status'='queued' and new.payload->>'status' in ('review_required','failed')) then
  update public.purchase_import_jobs set state=case when new.payload->>'status'='cancelled' then 'cancelled' when new.payload->>'status'='failed' then 'failed' else 'done' end,lease_until=null,updated_at=now() where import_id=new.id;
 end if;
 return new;
end $$;

create or replace function public.claim_purchase_job(worker_key text, model_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare worker text; j public.purchase_import_jobs; d public.purchase_imports; token uuid; next_payload jsonb;
begin
 worker=encode(sha256(convert_to(worker_key,'UTF8')),'hex');
 perform 1 from private.purchase_workers where key_hash=worker and enabled and expires_at>now() for update;
 if not found then raise exception 'Worker credential rejected' using errcode='42501'; end if;
 update private.purchase_workers set last_seen=now(),model=left(model_name,120) where key_hash=worker;
 update public.purchase_import_jobs queue_row set state='cancelled',lease_token=null,lease_until=null where state in ('queued','leased') and exists(select 1 from public.purchase_imports import_row where import_row.id=queue_row.import_id and import_row.payload->>'status'='cancelled');
 -- A credential can hold only one live lease, even if two processes poll it.
 if exists(select 1 from public.purchase_import_jobs where worker_hash=worker and state='leased' and lease_until>now()) then return null; end if;
 -- Exhausted or abandoned work becomes a visible failure, never silent deletion.
 for j in select * from public.purchase_import_jobs where (state='leased' and lease_until<=now() and attempts>=3) or (state='queued' and created_at<now()-interval '30 minutes') for update skip locked loop
  select * into d from public.purchase_imports where id=j.import_id for update skip locked;
  if not found then continue; end if;
  if d.payload->>'status' in ('queued','extracting') then
   next_payload=d.payload||jsonb_build_object('status','failed','revision',d.revision+1,'updatedAt',now(),'error',jsonb_build_object('code','IMPORT_WORKER_EXPIRED','message','The worker could not finish this import. Retry when it is online.'));
   update public.purchase_imports set payload=next_payload,revision=revision+1 where id=d.id;
  end if;
  update public.purchase_import_jobs set state='failed',lease_token=null,updated_at=now() where import_id=j.import_id;
 end loop;
 select * into j from public.purchase_import_jobs where state='queued' or (state='leased' and lease_until<=now() and attempts<3) order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 select * into d from public.purchase_imports where id=j.import_id for update skip locked;
 if not found then return null; end if;
 if d.payload->>'status' not in ('queued','extracting') or (d.payload->>'generation')::integer<>j.generation then
  update public.purchase_import_jobs set state='cancelled',lease_token=null where import_id=j.import_id;return null;
 end if;
 token=gen_random_uuid();
 next_payload=d.payload||jsonb_build_object('status','extracting','revision',d.revision+1,'updatedAt',now());
 update public.purchase_imports set payload=next_payload,revision=revision+1 where id=d.id;
 update public.purchase_import_jobs set state='leased',attempts=attempts+1,lease_token=token,lease_until=now()+interval '180 seconds',worker_hash=worker,draft_revision=d.revision+1,updated_at=now() where import_id=j.import_id;
 return jsonb_build_object('id',d.id,'source',d.payload->'source','generation',j.generation,'revision',d.revision+1,'leaseToken',token,'deadlineMs',120000);
end $$;

create or replace function public.finish_purchase_job(worker_key text, job_id uuid, lease uuid, prediction jsonb, model_metadata jsonb, failure_code text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare worker text; j public.purchase_import_jobs; d public.purchase_imports; next_payload jsonb; draft_items jsonb; event jsonb;
begin
 worker=encode(sha256(convert_to(worker_key,'UTF8')),'hex');
 if not exists(select 1 from private.purchase_workers where key_hash=worker and enabled and expires_at>now()) then raise exception 'Worker credential rejected' using errcode='42501'; end if;
 if exists(select 1 from public.purchase_import_jobs where import_id=job_id and worker_hash=worker and lease_token=lease and state in ('done','failed')) then return true; end if;
 select * into j from public.purchase_import_jobs where import_id=job_id and state='leased' and worker_hash=worker and lease_token=lease and lease_until>now() for update;
 if not found then return false; end if;
 select * into d from public.purchase_imports where id=job_id for update skip locked;
 if not found then return false; end if;
 if d.payload->>'status'<>'extracting' or d.revision<>j.draft_revision or (d.payload->>'generation')::integer<>j.generation then return false; end if;
 if failure_code is null then
  if prediction is null or model_metadata is null or prediction->>'schema_version' is distinct from '1' or jsonb_typeof(prediction->'items') is distinct from 'array' or jsonb_array_length(prediction->'items')>30 or octet_length(prediction::text)>50000 or octet_length(model_metadata::text)>4000 then raise exception 'Invalid worker result' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'prediction',i,'reviewed',jsonb_build_object('description',i->'description','category',i->'category','color',i->'color','size',i->'size','brand',i->'brand','quantity',i->'quantity'),'selected',true,'reviewedAt',null,'changes','[]'::jsonb)),'[]'::jsonb) into draft_items from jsonb_array_elements(prediction->'items') i;
  next_payload=d.payload||jsonb_build_object('status','review_required','extraction',prediction,'items',draft_items,'model',model_metadata,'error',null);
 else
  next_payload=d.payload||jsonb_build_object('status','failed','error',jsonb_build_object('code',left(failure_code,80),'message','Extraction could not produce a valid result. Retry or add the piece manually.'));
 end if;
 event=jsonb_build_object('revision',d.revision+1,'event',case when failure_code is null then 'worker-extracted' else 'worker-failed' end,'at',now());
 next_payload=next_payload||jsonb_build_object('revision',d.revision+1,'updatedAt',now(),'audit',(d.payload->'audit')||jsonb_build_array(event));
 update public.purchase_imports set payload=next_payload,revision=revision+1 where id=job_id;
 insert into public.purchase_import_audit values(d.user_id,job_id,d.revision+1,event);
 update public.purchase_import_jobs set state=case when failure_code is null then 'done' else 'failed' end,lease_until=null,updated_at=now() where import_id=job_id;
 return true;
end $$;
commit;
