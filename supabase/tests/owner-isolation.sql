-- Disposable database fixtures; the transaction always rolls back on success.
begin;
insert into auth.users(id) values
 ('09ca4000-0000-4000-8000-000000000001'),
 ('09ca4000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','09ca4000-0000-4000-8000-000000000001',true);
select * from public.save_closet('{"fixture":"owner one"}',0);
insert into public.style_documents(user_id,id,title,content)
 values(auth.uid(),'09ca4000-0000-4000-8000-000000000003','Isolation fixture','Private fixture.');
insert into storage.objects(bucket_id,name) values('closet-photos',auth.uid()::text||'/isolation-fixture.jpg');
do $$ begin
 if (select count(*) from public.closets)<>1 then raise exception 'Owner cannot read wardrobe'; end if;
 if (select count(*) from public.save_closet('{"fixture":"updated"}',1))<>1 then raise exception 'Owner update failed'; end if;
 if (select count(*) from public.save_closet('{"fixture":"stale"}',1))<>0 then raise exception 'Stale write was accepted'; end if;
end $$;
select set_config('request.jwt.claim.sub','09ca4000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.closets)<>0 then raise exception 'Foreign wardrobe visible'; end if;
 if (select count(*) from public.style_documents)<>0 then raise exception 'Foreign note visible'; end if;
 if (select count(*) from storage.objects where bucket_id='closet-photos')<>0 then raise exception 'Foreign photo visible'; end if;
 begin
  insert into public.closets(user_id,state) values('09ca4000-0000-4000-8000-000000000001','{}');
  raise exception 'Foreign wardrobe write accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into storage.objects(bucket_id,name) values('closet-photos','09ca4000-0000-4000-8000-000000000001/foreign.jpg');
  raise exception 'Foreign photo write accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform * from public.closets;
  raise exception 'Anonymous wardrobe read accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'PASS: owner read/write, stale-write rejection, cross-owner wardrobe/note/photo isolation, foreign write rejection, anonymous denial' as result;
rollback;
