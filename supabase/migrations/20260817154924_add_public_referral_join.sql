create or replace function public.join_referral_program(
  p_first_name text,
  p_last_name text,
  p_phone_e164 text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_phone_e164, 1));

  insert into public.customers (first_name, last_name, phone_e164)
  values (trim(p_first_name), trim(p_last_name), p_phone_e164)
  on conflict (phone_e164) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      updated_at = now()
  returning id into v_customer_id;

  select code into v_code from public.referral_codes where customer_id = v_customer_id;
  if found then
    return jsonb_build_object('code', v_code, 'created', false);
  end if;

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception using errcode = 'P0001', message = 'Unable to generate referral code';
    end if;
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * char_length(v_alphabet))::integer, 1);
    end loop;
    begin
      insert into public.referral_codes (customer_id, code, active) values (v_customer_id, v_code, true);
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  return jsonb_build_object('code', v_code, 'created', true);
end;
$$;

revoke execute on function public.join_referral_program(text, text, text) from public, anon, authenticated;
grant execute on function public.join_referral_program(text, text, text) to service_role;
