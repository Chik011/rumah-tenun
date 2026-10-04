-- Create the first account through register.html, then replace the email below
-- and run this once in the Supabase SQL Editor as the project owner.
update public.profiles
set role = 'admin'
where id = (
  select id
  from auth.users
  where lower(email) = lower('REPLACE_WITH_ADMIN_EMAIL')
);

-- Confirm exactly one account has the admin role.
select u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';
