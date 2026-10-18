begin;
create table public.buyer_profile_details (
 buyer_id uuid primary key references public.profiles(id) on delete cascade,
 phone text not null default '' check(length(phone)<=30),
 address text not null default '' check(length(address)<=1000),
 contact_email text not null default '' check(length(contact_email)<=254),
 updated_at timestamptz not null default now()
);
alter table public.buyer_profile_details enable row level security;
grant select,insert,update on public.buyer_profile_details to authenticated;
create policy "Buyer reads own private details" on public.buyer_profile_details for select to authenticated using(buyer_id=auth.uid());
create policy "Buyer inserts own private details" on public.buyer_profile_details for insert to authenticated with check(buyer_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='buyer'));
create policy "Buyer updates own private details" on public.buyer_profile_details for update to authenticated using(buyer_id=auth.uid()) with check(buyer_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='buyer'));
-- Public registration uses a server-only, bounded throttle; no password is stored here.
create table public.buyer_signup_limits(bucket text primary key,attempts integer not null,expires_at timestamptz not null);
alter table public.buyer_signup_limits enable row level security;
revoke all on public.buyer_signup_limits from anon,authenticated;
create function public.claim_buyer_signup(p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; b text;
begin
 if length(p_key)<>64 then return false; end if;
 b:=p_key||':'||floor(extract(epoch from now())/600)::text;
 insert into public.buyer_signup_limits values(b,1,now()+interval '20 minutes')
 on conflict(bucket) do update set attempts=public.buyer_signup_limits.attempts+1 returning attempts into n;
 delete from public.buyer_signup_limits where expires_at<now();
 return n<=20;
end; $$;
revoke all on function public.claim_buyer_signup(text) from public,anon,authenticated;
grant execute on function public.claim_buyer_signup(text) to service_role;
create function public.update_buyer_profile(p_name text,p_phone text,p_address text,p_email text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='buyer') then raise exception 'Masuk sebagai pembeli untuk memperbarui profil.'; end if;
 if length(trim(p_name)) not between 2 and 80 or length(p_phone)>30 or length(p_address)>1000 or length(p_email)>254
   or (p_phone<>'' and p_phone !~ '^[+0-9 ()-]{6,30}$')
   or (p_email<>'' and p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then raise exception 'Periksa kembali nama, nomor HP, alamat, dan email.'; end if;
 update public.profiles set display_name=trim(p_name) where id=auth.uid();
 insert into public.buyer_profile_details(buyer_id,phone,address,contact_email) values(auth.uid(),trim(p_phone),trim(p_address),lower(trim(p_email)))
 on conflict(buyer_id) do update set phone=excluded.phone,address=excluded.address,contact_email=excluded.contact_email,updated_at=now();
end; $$;
revoke all on function public.update_buyer_profile(text,text,text,text) from public,anon;
grant execute on function public.update_buyer_profile(text,text,text,text) to authenticated;
commit;
