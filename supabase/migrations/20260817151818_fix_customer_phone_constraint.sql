alter table public.customers
  drop constraint customers_phone_e164_check,
  add constraint customers_phone_e164_check
    check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
