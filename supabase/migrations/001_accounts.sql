-- Apply once in the dedicated Closet Quest project. All client data is owner-scoped.
create table if not exists public.closets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 constraint bounded_closet check (octet_length(state::text) <= 2000000)
);
alter table public.closets enable row level security;
create policy closet_owner on public.closets for all to authenticated
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.closets to authenticated;
revoke all on public.closets from anon;

-- Compare-and-swap prevents an older device from silently replacing a newer closet.
create or replace function public.save_closet(next_state jsonb, expected_revision bigint)
returns setof public.closets language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if expected_revision = 0 then
  return query insert into public.closets(user_id,state) values(auth.uid(),next_state)
   on conflict do nothing returning *;
 else
  return query update public.closets set state=next_state, revision=revision+1, updated_at=now()
   where user_id=auth.uid() and revision=expected_revision returning *;
 end if;
end $$;
revoke all on function public.save_closet(jsonb,bigint) from public, anon;
grant execute on function public.save_closet(jsonb,bigint) to authenticated;

create table if not exists public.style_documents (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 title text not null check(length(title) between 1 and 160),
 content text not null check(length(content) between 1 and 20000),
 source text not null default 'Personal style note' check(length(source)<=300),
 updated_at timestamptz not null default now(),
 primary key(user_id,id)
);
alter table public.style_documents enable row level security;
create policy document_owner on public.style_documents for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.style_documents to authenticated;
revoke all on public.style_documents from anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('closet-photos','closet-photos',false,2097152,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy photo_owner_read on storage.objects for select to authenticated
 using (bucket_id='closet-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy photo_owner_insert on storage.objects for insert to authenticated
 with check (bucket_id='closet-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy photo_owner_update on storage.objects for update to authenticated
 using (bucket_id='closet-photos' and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check (bucket_id='closet-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy photo_owner_delete on storage.objects for delete to authenticated
 using (bucket_id='closet-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
