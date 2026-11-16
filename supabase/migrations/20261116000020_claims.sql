-- Done-for-you desk (security A3 / A4, P1, rule 34).
--
-- 1. event_claims: single-use links that hand an event made by staff (owned by a
--    holding account) to the customer. Only the SHA-256 of the 128-bit token is
--    stored; the link is bound to the customer's verified email.
-- 2. Server-only functions used by the back office and the payment webhook.
--
-- Everything here is server only: RLS on, no policies, execute revoked from the
-- API roles and granted to service_role (security rules 7-9).

create table public.event_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  email_lower text not null check (email_lower = lower(email_lower) and char_length(email_lower) between 3 and 320),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id),
  check ((claimed_at is null) = (claimed_by is null))
);
create index event_claims_event_idx on public.event_claims (event_id);

alter table public.event_claims enable row level security;
revoke all on public.event_claims from public, anon, authenticated;

-- Database clock for the app server: grant expiry and queue ages are judged on
-- database time, never the app server's.
create function public.db_now() returns timestamptz
language sql stable security invoker set search_path = '' as $$
  select now();
$$;

-- Back-office event search by slug fragment or exact owner email. Reads
-- auth.users, so it runs as the owner; callers authorise staff first.
create function public.staff_find_events(p_query text, p_limit integer)
returns table (id uuid, slug text, kind text, status text, plan_id text, created_at timestamptz, owner_id uuid, owner_email text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.slug, e.kind, e.status, e.plan_id, e.created_at, e.owner_id, u.email::text
    from public.events e
    join auth.users u on u.id = e.owner_id
   where char_length(btrim(p_query)) >= 3
     and (
       e.slug like '%' || replace(replace(replace(lower(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or lower(u.email) = lower(btrim(p_query))
       or e.id::text = btrim(p_query)
     )
   order by e.created_at desc
   limit least(greatest(p_limit, 1), 100);
$$;

-- Emails for a set of user ids (owners, staff). Same caller rule as above.
create function public.staff_user_emails(p_ids uuid[])
returns table (id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text from auth.users u where u.id = any (p_ids);
$$;

-- Exact lookup of an account by email (holding accounts, grant targets).
create function public.staff_user_id_by_email(p_email text)
returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;

-- Claim: one statement, guarded by "not yet claimed", "not expired" (database
-- time) and the verified email the caller passes from the auth server. Two
-- concurrent claims cannot both succeed: the second update finds claimed_at set.
create function public.claim_event(p_token_hash bytea, p_user_id uuid, p_email_lower text)
returns table (event_id uuid, claim_id uuid, previous_owner uuid)
language sql volatile security invoker set search_path = '' as $$
  with c as (
    update public.event_claims k
       set claimed_at = now(), claimed_by = p_user_id
     where k.token_hash = p_token_hash
       and k.claimed_at is null
       and k.expires_at > now()
       and k.email_lower = p_email_lower
    returning k.id, k.event_id
  ), prev as (
    select e.id, e.owner_id from public.events e join c on c.event_id = e.id
  ), moved as (
    update public.events e
       set owner_id = p_user_id, updated_at = now()
      from c
     where e.id = c.event_id
    returning e.id
  )
  select m.id, c.id, prev.owner_id from moved m join c on c.event_id = m.id join prev on prev.id = m.id;
$$;

-- Refund / dispute: the order leaves "paid" and the event loses the plan that
-- order granted, in one transaction (security P1, rule 34).
create function public.unsettle_order(p_order_id uuid, p_status text)
returns table (event_id uuid, slug text, plan_id text)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  o public.orders;
begin
  if p_status not in ('refunded', 'disputed') then
    raise exception 'invalid status';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status <> 'paid' then
    return;
  end if;
  update public.orders set status = p_status where id = p_order_id;
  update public.events e set plan_id = null, updated_at = now() where e.id = o.event_id and e.plan_id = o.plan_id;
  return query select e.id, e.slug, o.plan_id from public.events e where e.id = o.event_id;
end $$;

revoke execute on function
  public.db_now(),
  public.staff_find_events(text, integer),
  public.staff_user_emails(uuid[]),
  public.staff_user_id_by_email(text),
  public.claim_event(bytea, uuid, text),
  public.unsettle_order(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.db_now(),
  public.staff_find_events(text, integer),
  public.staff_user_emails(uuid[]),
  public.staff_user_id_by_email(text),
  public.claim_event(bytea, uuid, text),
  public.unsettle_order(uuid, text)
to service_role;
