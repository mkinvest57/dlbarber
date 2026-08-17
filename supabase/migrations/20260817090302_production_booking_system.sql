-- Daryl Barber production booking schema.
-- All mutations are performed through Vercel API routes using the server-only
-- Supabase secret key. RLS remains enabled as defense in depth for direct API use.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.services (
  id text primary key,
  name text not null,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  price_cents integer not null check (price_cents >= 0),
  note text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.services (id, name, duration_minutes, price_cents, note, sort_order)
values
  ('cut', 'Coupe', 30, 1500, 'Structure & Finitions', 10),
  ('full', 'Coupe + Barbe', 45, 2000, 'Expérience Complète', 20)
on conflict (id) do update set
  name = excluded.name,
  duration_minutes = excluded.duration_minutes,
  price_cents = excluded.price_cents,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.business_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  open_time time,
  close_time time,
  is_closed boolean not null default false,
  check ((is_closed and open_time is null and close_time is null)
      or (not is_closed and open_time is not null and close_time is not null and close_time > open_time))
);

insert into public.business_hours (weekday, open_time, close_time, is_closed)
values
  (0, '09:00', '22:00', false),
  (1, '09:00', '22:00', false),
  (2, '09:00', '22:00', false),
  (3, '09:00', '22:00', false),
  (4, '09:00', '22:00', false),
  (5, '09:00', '22:00', false),
  (6, '09:00', '22:00', false)
on conflict (weekday) do nothing;

create table if not exists public.closures (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.blocked_periods (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  phone_e164 text not null unique check (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{4}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_id text not null references public.services(id) on delete restrict,
  service_name text not null,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'rejected', 'no_show', 'walk-in')),
  source text not null default 'online' check (source in ('online', 'walk-in', 'admin')),
  base_price_cents integer not null check (base_price_cents >= 0),
  current_price_cents integer not null check (current_price_cents >= 0),
  referral_code_id uuid references public.referral_codes(id) on delete set null,
  referral_discount_cents integer not null default 0 check (referral_discount_cents >= 0),
  loyalty_discount_cents integer not null default 0 check (loyalty_discount_cents >= 0),
  loyalty_visit_number integer check (loyalty_visit_number is null or loyalty_visit_number > 0),
  manage_token_hash text unique,
  idempotency_key text not null unique,
  notes text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (end_at - start_at = make_interval(mins => duration_minutes)),
  check (current_price_cents <= base_price_cents),
  check (referral_discount_cents + loyalty_discount_cents = base_price_cents - current_price_cents)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap') then
    alter table public.appointments
      add constraint appointments_no_overlap
      exclude using gist (
        tstzrange(start_at, end_at, '[)') with &&
      ) where (status in ('pending', 'confirmed', 'walk-in'));
  end if;
end $$;

create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  old_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_credits (
  id uuid primary key default gen_random_uuid(),
  referrer_customer_id uuid not null references public.customers(id) on delete cascade,
  source_appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  redeemed_on_appointment_id uuid references public.appointments(id) on delete set null,
  amount_cents integer not null default 300 check (amount_cents > 0),
  remaining_cents integer not null default 300 check (remaining_cents >= 0 and remaining_cents <= amount_cents),
  status text not null default 'earned' check (status in ('earned', 'redeemed', 'revoked')),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  qualifying_visit_number integer not null check (qualifying_visit_number > 0),
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique (customer_id, qualifying_visit_number)
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists closures_range_idx on public.closures using gist (tstzrange(starts_at, ends_at, '[)'));
create index if not exists blocked_periods_range_idx on public.blocked_periods using gist (tstzrange(starts_at, ends_at, '[)'));
create index if not exists appointments_customer_idx on public.appointments (customer_id, start_at desc);
create index if not exists appointments_customer_created_idx on public.appointments (customer_id, created_at desc);
create index if not exists appointments_customer_status_idx on public.appointments (customer_id, status, start_at);
create index if not exists appointments_calendar_idx on public.appointments (start_at, end_at)
  where status in ('pending', 'confirmed', 'walk-in');
create index if not exists appointments_status_idx on public.appointments (status, start_at);
create index if not exists appointment_events_appointment_idx on public.appointment_events (appointment_id, created_at desc);
create index if not exists referral_credits_available_idx on public.referral_credits (referrer_customer_id, created_at)
  where status = 'earned';
create unique index if not exists blocked_periods_exact_idx on public.blocked_periods (starts_at, ends_at);

-- Public SQL functions are callable only by the server role. They provide a
-- single transaction for booking and reward mutations.
create or replace function public.create_public_appointment(
  p_first_name text,
  p_last_name text,
  p_phone_e164 text,
  p_service_id text,
  p_start_at timestamptz,
  p_referral_code text,
  p_idempotency_key text,
  p_manage_token_hash text,
  p_source text default 'online',
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing public.appointments;
  v_service public.services;
  v_customer_id uuid;
  v_referral_code_id uuid;
  v_end_at timestamptz;
  v_business_hours public.business_hours;
  v_local_start time;
  v_dow integer;
  v_appointment public.appointments;
begin
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 16 then
    raise exception using errcode = '22023', message = 'Invalid idempotency key';
  end if;
  if p_source not in ('online', 'walk-in', 'admin') then
    raise exception using errcode = '22023', message = 'Invalid appointment source';
  end if;

  -- Pending requests are temporary holds. Release abandoned holds before
  -- evaluating the exclusion constraint for a new booking.
  update public.appointments
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
  where status = 'pending' and created_at < now() - interval '2 hours';

  select * into v_existing from public.appointments where idempotency_key = trim(p_idempotency_key);
  if found then
    return jsonb_build_object(
      'id', v_existing.id,
      'start_at', v_existing.start_at,
      'end_at', v_existing.end_at,
      'service_name', v_existing.service_name,
      'price_cents', v_existing.current_price_cents,
      'status', v_existing.status,
      'replayed', true
    );
  end if;

  -- Serialize attempts for the same customer and cap successful booking spam.
  perform pg_advisory_xact_lock(hashtextextended(p_phone_e164, 0));
  select id into v_customer_id from public.customers where phone_e164 = p_phone_e164;
  if found and (
    select count(*) from public.appointments
    where customer_id = v_customer_id and created_at > now() - interval '15 minutes'
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'Booking rate limit exceeded';
  end if;

  select * into v_service from public.services where id = p_service_id and active = true;
  if not found then
    raise exception using errcode = 'P0002', message = 'Service is unavailable';
  end if;

  if p_start_at <= now() then
    raise exception using errcode = '22023', message = 'Appointment must be in the future';
  end if;
  v_end_at := p_start_at + make_interval(mins => v_service.duration_minutes);
  v_local_start := (p_start_at at time zone 'Europe/Paris')::time;
  v_dow := extract(dow from (p_start_at at time zone 'Europe/Paris'))::integer;

  select * into v_business_hours from public.business_hours where weekday = v_dow;
  if not found or v_business_hours.is_closed
     or v_local_start < v_business_hours.open_time
     or (v_end_at at time zone 'Europe/Paris')::time > v_business_hours.close_time then
    raise exception using errcode = '22023', message = 'Appointment is outside business hours';
  end if;

  if exists (select 1 from public.closures c where tstzrange(c.starts_at, c.ends_at, '[)') && tstzrange(p_start_at, v_end_at, '[)'))
     or exists (select 1 from public.blocked_periods b where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_start_at, v_end_at, '[)')) then
    raise exception using errcode = '23514', message = 'Appointment is unavailable';
  end if;

  insert into public.customers (first_name, last_name, phone_e164)
  values (trim(p_first_name), trim(p_last_name), p_phone_e164)
  on conflict (phone_e164) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    updated_at = now()
  returning id into v_customer_id;

  if p_referral_code is not null and char_length(trim(p_referral_code)) > 0 then
    select id into v_referral_code_id
    from public.referral_codes
    where code = upper(trim(p_referral_code)) and active = true and customer_id <> v_customer_id;
    if not found then
      raise exception using errcode = '22023', message = 'Invalid referral code';
    end if;
  end if;

  insert into public.appointments (
    customer_id, service_id, service_name, duration_minutes, start_at, end_at,
    status, source, base_price_cents, current_price_cents, referral_code_id,
    manage_token_hash, idempotency_key, notes, created_by
  ) values (
    v_customer_id, v_service.id, v_service.name, v_service.duration_minutes,
    p_start_at, v_end_at, case when p_source = 'walk-in' then 'walk-in' else 'pending' end,
    p_source, v_service.price_cents, v_service.price_cents, v_referral_code_id,
    p_manage_token_hash, trim(p_idempotency_key), nullif(trim(p_notes), ''),
    case when auth.uid() is not null then auth.uid() else null end
  ) returning * into v_appointment;

  insert into public.appointment_events (appointment_id, actor_user_id, event_type, new_status)
  values (v_appointment.id, auth.uid(), 'created', v_appointment.status);

  return jsonb_build_object(
    'id', v_appointment.id,
    'start_at', v_appointment.start_at,
    'end_at', v_appointment.end_at,
    'service_name', v_appointment.service_name,
    'price_cents', v_appointment.current_price_cents,
    'status', v_appointment.status,
    'replayed', false
  );
exception
  when exclusion_violation then
    raise exception using errcode = '23P01', message = 'Appointment slot is already booked';
  when unique_violation then
    select * into v_existing from public.appointments where idempotency_key = trim(p_idempotency_key);
    if found then
      return jsonb_build_object(
        'id', v_existing.id,
        'start_at', v_existing.start_at,
        'end_at', v_existing.end_at,
        'service_name', v_existing.service_name,
        'price_cents', v_existing.current_price_cents,
        'status', v_existing.status,
        'replayed', true
      );
    end if;
    raise;
end;
$$;

create or replace function public.admin_set_appointment_status(
  p_appointment_id uuid,
  p_status text,
  p_actor_user_id uuid
)
returns public.appointments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appointment public.appointments;
  v_old_status text;
  v_referrer uuid;
begin
  if p_status not in ('pending', 'confirmed', 'completed', 'cancelled', 'rejected', 'no_show', 'walk-in') then
    raise exception using errcode = '22023', message = 'Invalid appointment status';
  end if;
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Appointment not found'; end if;
  v_old_status := v_appointment.status;

  if v_old_status = p_status then
    return v_appointment;
  end if;
  if not (
    (v_old_status = 'pending' and p_status in ('confirmed', 'cancelled', 'rejected', 'no_show'))
    or (v_old_status = 'confirmed' and p_status in ('completed', 'cancelled', 'no_show'))
    or (v_old_status = 'walk-in' and p_status in ('completed', 'cancelled', 'no_show'))
  ) then
    raise exception using errcode = '22023', message = 'Invalid appointment status transition';
  end if;

  update public.appointments
  set status = p_status,
      completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
      cancelled_at = case when p_status in ('cancelled', 'rejected') then coalesce(cancelled_at, now()) else cancelled_at end,
      updated_at = now()
  where id = p_appointment_id
  returning * into v_appointment;

  if p_status = 'completed' and v_old_status <> 'completed' and v_appointment.referral_code_id is not null then
    select customer_id into v_referrer from public.referral_codes where id = v_appointment.referral_code_id;
    if v_referrer is not null then
      insert into public.referral_credits (referrer_customer_id, source_appointment_id)
      values (v_referrer, v_appointment.id)
      on conflict (source_appointment_id) do nothing;
    end if;
  end if;

  insert into public.appointment_events (appointment_id, actor_user_id, event_type, old_status, new_status)
  values (v_appointment.id, p_actor_user_id, 'status_changed', v_old_status, p_status);
  insert into public.admin_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor_user_id, 'status_changed', 'appointment', v_appointment.id, jsonb_build_object('from', v_old_status, 'to', p_status));
  return v_appointment;
end;
$$;

create or replace function public.admin_redeem_referral_credits(
  p_customer_id uuid,
  p_appointment_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appointment public.appointments;
  v_credit public.referral_credits;
  v_discount integer := 0;
  v_remaining integer;
  v_apply integer;
begin
  select * into v_appointment from public.appointments where id = p_appointment_id and customer_id = p_customer_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Appointment not found'; end if;
  if v_appointment.referral_discount_cents > 0 then
    return jsonb_build_object('discount_cents', v_appointment.referral_discount_cents, 'already_redeemed', true);
  end if;
  if v_appointment.status not in ('confirmed', 'walk-in')
     or v_appointment.loyalty_discount_cents > 0 then
    raise exception using errcode = '22023', message = 'Appointment is not eligible for referral credit';
  end if;

  v_remaining := v_appointment.current_price_cents;
  for v_credit in
    select * from public.referral_credits
    where referrer_customer_id = p_customer_id and status = 'earned'
    order by created_at, id
    for update skip locked
  loop
    exit when v_remaining <= 0;
    v_apply := least(v_credit.remaining_cents, v_remaining);
    update public.referral_credits
    set remaining_cents = remaining_cents - v_apply,
        status = case when remaining_cents - v_apply = 0 then 'redeemed' else 'earned' end,
        redeemed_on_appointment_id = p_appointment_id,
        redeemed_at = now()
    where id = v_credit.id;
    v_discount := v_discount + v_apply;
    v_remaining := v_remaining - v_apply;
  end loop;

  if v_discount = 0 then return jsonb_build_object('discount_cents', 0, 'already_redeemed', false); end if;
  update public.appointments
  set current_price_cents = current_price_cents - v_discount,
      referral_discount_cents = referral_discount_cents + v_discount,
      updated_at = now()
  where id = p_appointment_id
  returning * into v_appointment;

  insert into public.admin_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor_user_id, 'referral_redeemed', 'appointment', p_appointment_id, jsonb_build_object('discount_cents', v_discount));
  return jsonb_build_object('discount_cents', v_discount, 'already_redeemed', false);
end;
$$;

create or replace function public.admin_apply_loyalty_reward(
  p_appointment_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appointment public.appointments;
  v_completed_visits integer;
  v_qualifying_visit integer;
  v_reward_amount integer;
begin
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Appointment not found'; end if;
  if v_appointment.status not in ('confirmed', 'walk-in')
     or v_appointment.referral_discount_cents > 0 then
    raise exception using errcode = '22023', message = 'Appointment is not eligible for a loyalty reward';
  end if;
  select count(*) into v_completed_visits
  from public.appointments
  where customer_id = v_appointment.customer_id
    and status = 'completed'
    and start_at < v_appointment.start_at;
  v_qualifying_visit := v_completed_visits + 1;
  if v_qualifying_visit % 8 <> 0 then
    return jsonb_build_object('discount_cents', 0, 'eligible', false, 'completed_visits', v_completed_visits);
  end if;
  if exists (select 1 from public.loyalty_rewards where customer_id = v_appointment.customer_id and qualifying_visit_number = v_qualifying_visit) then
    return jsonb_build_object('discount_cents', 0, 'eligible', false, 'already_redeemed', true, 'completed_visits', v_completed_visits);
  end if;
  v_reward_amount := v_appointment.current_price_cents;
  insert into public.loyalty_rewards (customer_id, qualifying_visit_number, appointment_id, amount_cents)
  values (v_appointment.customer_id, v_qualifying_visit, p_appointment_id, v_reward_amount);
  update public.appointments
  set current_price_cents = 0,
      loyalty_discount_cents = loyalty_discount_cents + v_reward_amount,
      loyalty_visit_number = v_qualifying_visit,
      updated_at = now()
  where id = p_appointment_id;
  insert into public.admin_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor_user_id, 'loyalty_redeemed', 'appointment', p_appointment_id, jsonb_build_object('visit_number', v_qualifying_visit, 'discount_cents', v_reward_amount));
  return jsonb_build_object('discount_cents', v_reward_amount, 'eligible', true, 'completed_visits', v_completed_visits);
end;
$$;

create or replace function public.manage_public_appointment(
  p_manage_token_hash text,
  p_action text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appointment public.appointments;
  v_old_status text;
begin
  if p_action not in ('lookup', 'cancel') then
    raise exception using errcode = '22023', message = 'Invalid management action';
  end if;
  select * into v_appointment
  from public.appointments
  where manage_token_hash = p_manage_token_hash
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Appointment not found';
  end if;
  if v_appointment.created_at < now() - interval '90 days' then
    raise exception using errcode = 'P0002', message = 'Appointment not found';
  end if;

  if p_action = 'cancel' then
    if v_appointment.status not in ('pending', 'confirmed') then
      raise exception using errcode = '22023', message = 'Appointment cannot be cancelled';
    end if;
    v_old_status := v_appointment.status;
    update public.appointments
    set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
    where id = v_appointment.id
    returning * into v_appointment;
    insert into public.appointment_events (appointment_id, event_type, old_status, new_status)
    values (v_appointment.id, 'customer_cancelled', v_old_status, 'cancelled');
  end if;

  return jsonb_build_object(
    'id', v_appointment.id,
    'start_at', v_appointment.start_at,
    'end_at', v_appointment.end_at,
    'service_name', v_appointment.service_name,
    'price_cents', v_appointment.current_price_cents,
    'status', v_appointment.status
  );
end;
$$;

create or replace function public.record_public_appointment_event(
  p_manage_token_hash text,
  p_event_type text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appointment public.appointments;
begin
  if p_event_type not in ('sms_draft_opened') then
    raise exception using errcode = '22023', message = 'Invalid appointment event';
  end if;
  select * into v_appointment
  from public.appointments
  where manage_token_hash = p_manage_token_hash;
  if not found or v_appointment.created_at < now() - interval '90 days' then
    raise exception using errcode = 'P0002', message = 'Appointment not found';
  end if;
  insert into public.appointment_events (appointment_id, event_type, metadata)
  values (v_appointment.id, p_event_type, jsonb_build_object('channel', 'sms', 'direction', 'customer_to_barber'));
  return jsonb_build_object('recorded', true, 'appointment_id', v_appointment.id);
end;
$$;

-- Direct Data API access is intentionally closed. The Vercel API is the only
-- application boundary and uses the server-only secret key.
do $$
declare
  t text;
begin
  foreach t in array array['services','business_hours','closures','blocked_periods','customers','referral_codes','appointments','appointment_events','referral_credits','loyalty_rewards','admin_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

revoke execute on function public.create_public_appointment(text, text, text, text, timestamptz, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_appointment_status(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.admin_redeem_referral_credits(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_apply_loyalty_reward(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.manage_public_appointment(text, text) from public, anon, authenticated;
revoke execute on function public.record_public_appointment_event(text, text) from public, anon, authenticated;
grant execute on function public.create_public_appointment(text, text, text, text, timestamptz, text, text, text, text, text) to service_role;
grant execute on function public.admin_set_appointment_status(uuid, text, uuid) to service_role;
grant execute on function public.admin_redeem_referral_credits(uuid, uuid, uuid) to service_role;
grant execute on function public.admin_apply_loyalty_reward(uuid, uuid) to service_role;
grant execute on function public.manage_public_appointment(text, text) to service_role;
grant execute on function public.record_public_appointment_event(text, text) to service_role;
