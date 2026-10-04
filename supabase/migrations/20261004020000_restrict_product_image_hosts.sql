do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_image_url_cloudinary_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_image_url_cloudinary_check
      check (
        image_url is null
        or image_url ~ '^https://res[.]cloudinary[.]com/w7kqjyeq/image/upload/'
      ) not valid;
  end if;
end;
$$;

alter table public.products
  validate constraint products_image_url_cloudinary_check;
