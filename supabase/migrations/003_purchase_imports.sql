-- Review in staging first. Existing wardrobes remain JSON snapshots in closets.
-- This migration adds an atomic append RPC rather than a second wardrobe schema.
create table public.purchase_imports (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 create_key text not null check(length(create_key) between 8 and 100),
 revision integer not null default 0 check(revision>=0),
 payload jsonb not null check(octet_length(payload::text)<=200000),
 unique(user_id,create_key), unique(user_id,id)
);
create table public.purchase_import_commits (
 user_id uuid not null references auth.users(id) on delete cascade,
 commit_key text not null, import_id uuid not null unique,
 request_hash text not null, result jsonb not null,
 primary key(user_id,commit_key), foreign key(user_id,import_id) references public.purchase_imports(user_id,id) on delete cascade
);
create table public.purchase_import_garments (
 user_id uuid not null references auth.users(id) on delete cascade,
 import_id uuid not null,
 item_id uuid not null, unit integer not null check(unit between 0 and 9), garment_id uuid not null unique,
 primary key(import_id,item_id,unit), foreign key(user_id,import_id) references public.purchase_imports(user_id,id) on delete cascade
);
create table public.purchase_import_audit (
 user_id uuid not null references auth.users(id) on delete cascade,
 import_id uuid not null,
 revision integer not null, event jsonb not null,
 primary key(import_id,revision), foreign key(user_id,import_id) references public.purchase_imports(user_id,id) on delete cascade
);
-- Reviewed items are a bounded array inside the draft payload, allowing CAS of
-- the entire review. This replaces a separate draft-item table in this schema.
alter table public.purchase_imports enable row level security;
alter table public.purchase_import_commits enable row level security;
alter table public.purchase_import_garments enable row level security;
alter table public.purchase_import_audit enable row level security;
create policy purchase_owner on public.purchase_imports for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy purchase_commit_owner on public.purchase_import_commits for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy purchase_garment_owner on public.purchase_import_garments for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy purchase_audit_owner on public.purchase_import_audit for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.purchase_imports,public.purchase_import_commits,public.purchase_import_garments,public.purchase_import_audit from public,anon;
grant select,insert,update,delete on public.purchase_imports,public.purchase_import_commits,public.purchase_import_garments,public.purchase_import_audit to authenticated;

create function public.save_purchase_import(draft_id uuid, expected_revision integer, next_draft jsonb, commit_data jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_draft jsonb; garment jsonb; closet_state jsonb; closet_revision bigint; n integer; selected_units integer;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select payload into old_draft from public.purchase_imports where id=draft_id and user_id=auth.uid() and revision=expected_revision for update;
 if old_draft is null then raise exception 'Import revision conflict' using errcode='40001'; end if;
 if (next_draft->>'revision')::integer<>expected_revision+1 or next_draft->>'owner'<>auth.uid()::text or next_draft->>'id'<>draft_id::text
 or next_draft->'source'<>old_draft->'source' or next_draft->'createKey'<>old_draft->'createKey' or old_draft->>'status'='committed'
 then raise exception 'Invalid draft transition' using errcode='22023'; end if;
 if commit_data is not null then
  if old_draft->>'status'<>'review_required' or next_draft->>'status'<>'committed' then raise exception 'Review required' using errcode='22023'; end if;
  n=jsonb_array_length(commit_data->'garments');
  select sum((i->'reviewed'->>'quantity')::integer) into selected_units from jsonb_array_elements(old_draft->'items') i where (i->>'selected')::boolean;
  if n<1 or n>50 or selected_units is null or n<>selected_units then raise exception 'Invalid garment quantity' using errcode='22023'; end if;
  -- Create the account snapshot if this is its first wardrobe write, then lock it.
  insert into public.closets(user_id,state) values(auth.uid(),jsonb_build_object('wardrobeId',auth.uid(),'profile','','xp',0,'items','[]'::jsonb,'completed','[]'::jsonb,'submissions','[]'::jsonb,'savedOutfits','[]'::jsonb,'wearRecords','[]'::jsonb)) on conflict do nothing;
  select state,revision into closet_state,closet_revision from public.closets where user_id=auth.uid() for update;
  if jsonb_array_length(closet_state->'items')+n>300 then raise exception 'Closet item limit' using errcode='22023'; end if;
  for garment in select value from jsonb_array_elements(commit_data->'garments') loop
   if not exists(select 1 from jsonb_array_elements(old_draft->'items') i where i->>'id'=garment->'purchaseImport'->>'itemId' and (i->>'selected')::boolean and i->>'reviewedAt' is not null
    and (i->'reviewed'->>'quantity')::integer between 1 and 10
    and (garment->'purchaseImport'->>'unit')::integer between 0 and (i->'reviewed'->>'quantity')::integer-1
    and i->'reviewed'->>'description'=garment->>'name' and i->'reviewed'->>'category'=garment->>'category')
   then raise exception 'Unapproved garment' using errcode='22023'; end if;
   if exists(select 1 from jsonb_array_elements(closet_state->'items') i where i->>'id'=garment->>'id') then raise exception 'Duplicate garment' using errcode='23505'; end if;
   insert into public.purchase_import_garments values(auth.uid(),draft_id,(garment->'purchaseImport'->>'itemId')::uuid,(garment->'purchaseImport'->>'unit')::integer,(garment->>'id')::uuid);
  end loop;
  insert into public.purchase_import_commits values(auth.uid(),commit_data->>'key',draft_id,commit_data->>'hash',commit_data->'result');
  update public.closets set state=jsonb_set(closet_state,'{items}',(closet_state->'items')||(commit_data->'garments')),revision=closet_revision+1,updated_at=now() where user_id=auth.uid();
 elsif next_draft->>'status'='committed' then raise exception 'Commit requires garment transaction' using errcode='22023';
 end if;
 update public.purchase_imports set revision=expected_revision+1,payload=next_draft where id=draft_id and user_id=auth.uid();
 insert into public.purchase_import_audit values(auth.uid(),draft_id,expected_revision+1,(next_draft->'audit')->-1);
 return next_draft;
end $$;
revoke all on function public.save_purchase_import(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.save_purchase_import(uuid,integer,jsonb,jsonb) to authenticated;

-- Remove receipt text and prediction/review history, retain commit tombstones so
-- replay remains duplicate-safe. This does not delete the user's wardrobe items.
create function public.purge_purchase_source(draft_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.purchase_imports set payload=(payload-'extraction')||jsonb_build_object('source',jsonb_build_object('hash',payload->'source'->'hash','text','','lines','[]'::jsonb),'items','[]'::jsonb,'audit','[]'::jsonb,'sourceRemoved',true)
 where id=draft_id and user_id=auth.uid() and payload->>'status'='committed';
 delete from public.purchase_import_audit where import_id=draft_id and user_id=auth.uid() and exists(select 1 from public.purchase_imports where id=draft_id and payload->>'status'='committed');
end $$;
revoke all on function public.purge_purchase_source(uuid) from public,anon;
grant execute on function public.purge_purchase_source(uuid) to authenticated;
