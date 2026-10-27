-- Saved public product results; query preferences remain private to the owner.
create table if not exists public.shopping_library (
 user_id uuid not null references auth.users(id) on delete cascade,
 query_key text not null check(query_key ~ '^[a-f0-9]{64}$'),
 result jsonb not null check(jsonb_typeof(result) = 'object' and octet_length(result::text) <= 40000),
 updated_at timestamptz not null default now(),
 primary key(user_id,query_key)
);
alter table public.shopping_library enable row level security;
create policy shopping_library_owner on public.shopping_library for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.shopping_library from anon;
grant select,insert,update,delete on public.shopping_library to authenticated;
