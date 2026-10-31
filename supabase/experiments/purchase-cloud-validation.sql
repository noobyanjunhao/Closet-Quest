-- Run in the existing project's SQL editor. All wardrobe/draft writes below
-- occur in a subtransaction which deliberately rolls back. Only result JSON
-- survives in a temporary table for this connection. No personal rows printed.
create temporary table cq_validation_result(result jsonb);
do $$
declare owner_a uuid; owner_b uuid; v_import uuid:=gen_random_uuid(); v_item uuid:=gen_random_uuid(); g1 uuid:=gen_random_uuid(); g2 uuid:=gen_random_uuid();
 d jsonb; next_d jsonb; garments jsonb; broken jsonb; commit_payload jsonb;
 before_count integer; outcomes jsonb:='[]'; n integer;
begin
 select id into owner_a from auth.users order by created_at limit 1;
 select id into owner_b from auth.users where id<>owner_a order by created_at limit 1;
 if owner_a is null or owner_b is null then raise exception 'Two existing accounts required'; end if;
 begin
  perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',owner_a::text,true);
  select coalesce(jsonb_array_length(state->'items'),0) into before_count from public.closets where user_id=owner_a;
  d=jsonb_build_object('id',v_import,'owner',owner_a,'createKey','rollback-cloud-experiment','provider','worker','revision',3,'generation',1,'status','review_required','source',jsonb_build_object('hash','synthetic','text','Cotton tee, quantity 2','lines','[]'::jsonb),'audit','[]'::jsonb,'items',jsonb_build_array(jsonb_build_object('id',v_item,'reviewed',jsonb_build_object('description','Cotton tee','category','Top','quantity',2,'color',null,'brand',null,'size',null),'selected',true,'reviewedAt',now())));
  insert into public.purchase_imports values(v_import,owner_a,'rollback-cloud-experiment',3,d);
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  select count(*) into n from public.purchase_imports where id=v_import;
  if n<>0 then raise exception 'Owner isolation failed'; end if;
  outcomes=outcomes||jsonb_build_array(jsonb_build_object('check','foreign-owner read','passed',true));
  begin
   insert into public.purchase_import_commits values(owner_b,'foreign-child',v_import,'bad','{}');
   raise exception 'Foreign child row accepted';
  exception when foreign_key_violation then outcomes=outcomes||jsonb_build_array(jsonb_build_object('check','foreign-owner child insert','passed',true));end;
  perform set_config('role','anon',true);
  begin
   perform 1 from public.purchase_imports;raise exception 'Anonymous read accepted';
  exception when insufficient_privilege then outcomes=outcomes||jsonb_build_array(jsonb_build_object('check','anonymous read denied','passed',true));end;
  perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',owner_a::text,true);
  garments=jsonb_build_array(jsonb_build_object('id',g1,'name','Cotton tee','category','Top','purchaseImport',jsonb_build_object('id',v_import,'itemId',v_item,'unit',0)),jsonb_build_object('id',g2,'name','Cotton tee','category','Top','purchaseImport',jsonb_build_object('id',v_import,'itemId',v_item,'unit',1)));
  next_d=d||jsonb_build_object('revision',4,'status','committed','audit',jsonb_build_array(jsonb_build_object('event','committed','revision',4)));
  commit_payload=jsonb_build_object('key','rollback-commit','hash','synthetic','garments',garments,'result',jsonb_build_object('garments',garments));
  broken=jsonb_set(commit_payload,'{garments,1,id}',to_jsonb(g1));
  begin
   perform public.save_purchase_import(v_import,3,next_d,broken);raise exception 'Broken transaction accepted';
  exception when unique_violation then null;end;
  select count(*) into n from public.purchase_import_garments where import_id=v_import;if n<>0 then raise exception 'Partial insert survived';end if;
  select jsonb_array_length(state->'items') into n from public.closets where user_id=owner_a;if n<>before_count then raise exception 'Closet changed on rollback';end if;
  outcomes=outcomes||jsonb_build_array(jsonb_build_object('check','second-unit failure atomic rollback','passed',true));
  perform public.save_purchase_import(v_import,3,next_d,commit_payload);
  select jsonb_array_length(state->'items') into n from public.closets where user_id=owner_a;if n<>before_count+2 then raise exception 'Commit unit count wrong';end if;
  outcomes=outcomes||jsonb_build_array(jsonb_build_object('check','two-unit transactional commit','passed',true));
  begin
   perform public.save_purchase_import(v_import,3,next_d,commit_payload);raise exception 'Stale commit accepted';
  exception when serialization_failure then outcomes=outcomes||jsonb_build_array(jsonb_build_object('check','stale revision rejected','passed',true));end;
  select count(*) into n from public.purchase_import_garments where import_id=v_import;if n<>2 then raise exception 'Duplicate units';end if;
  outcomes=outcomes||jsonb_build_array(jsonb_build_object('check','unique unit mappings','passed',true));
  raise exception 'Rollback all synthetic mutations' using errcode='Z0001';
 exception when sqlstate 'Z0001' then null;
 end;
 perform set_config('role','none',true);
 if exists(select 1 from public.purchase_imports where id=v_import) then raise exception 'Experiment cleanup failed';end if;
 outcomes=outcomes||jsonb_build_array(jsonb_build_object('check','experiment rollback preserved live data','passed',true));
 insert into cq_validation_result values(jsonb_build_object('environment','live Supabase PostgreSQL','checks',outcomes,'passed',jsonb_array_length(outcomes),'synthetic',true));
end $$;
select result from cq_validation_result;
