-- Hardening after the 2026-11-16 code security review (findings F1-F11).
--
-- Every function here is server only: `security invoker` with an empty
-- search_path, execute revoked from public/anon/authenticated and granted to
-- service_role (security rules 7-9). New tables have RLS on, no policies, and
-- no grants to the API roles.

-- ---------------------------------------------------------------------------
-- F1. Holding accounts are recorded by id, never found by email.
--
-- Public sign-up could register `holding-N@no-reply.invalid` before the desk
-- did and so own the events staff build for customers. Holding accounts are now
-- created only by the server (auth.admin.createUser, app_metadata.holding,
-- banned) and their ids are kept here. Production also has email confirmation
-- on, and the sign-up action refuses `.invalid` addresses.
-- ---------------------------------------------------------------------------
create table public.holding_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.holding_accounts enable row level security;
revoke all on public.holding_accounts from public, anon, authenticated;

-- Existing holding accounts: app_metadata is writable only with the service
-- key, so `holding = true` plus a ban marks an account the server made.
insert into public.holding_accounts (user_id, created_at)
select u.id, u.created_at
  from auth.users u
 where u.raw_app_meta_data ->> 'holding' = 'true'
   and u.banned_until is not null and u.banned_until > now()
on conflict do nothing;

-- Claims move an event only away from a recorded holding account.
create or replace function public.claim_event(p_token_hash bytea, p_user_id uuid, p_email_lower text)
returns table (event_id uuid, claim_id uuid, previous_owner uuid)
language sql volatile security invoker set search_path = '' as $$
  with c as (
    update public.event_claims k
       set claimed_at = now(), claimed_by = p_user_id
     where k.token_hash = p_token_hash
       and k.claimed_at is null
       and k.expires_at > now()
       and k.email_lower = p_email_lower
       and exists (
         select 1 from public.events e
           join public.holding_accounts h on h.user_id = e.owner_id
          where e.id = k.event_id
       )
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

-- ---------------------------------------------------------------------------
-- Rate limiter: give back a slot that was reserved before a slow check and
-- turned out not to be a failure (F3 passcodes, F11 host sign-in).
-- ---------------------------------------------------------------------------
create function public.rate_limit_refund(p_key text, p_window_seconds integer)
returns void language sql volatile security invoker set search_path = '' as $$
  update public.rate_limits r
     set count = greatest(r.count - 1, 0)
   where r.key = p_key
     and r.window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
$$;

-- ---------------------------------------------------------------------------
-- F2. Rejoin codes: an attempt is reserved atomically before the code is
-- checked, so a burst of parallel guesses cannot all read "0 failures".
--
-- Returns 'ok' (go ahead), 'last' (go ahead; this attempt has locked the
-- player unless it succeeds), 'locked' or 'not_found'. A lock that has expired,
-- or one a host or operator cleared, starts a fresh count.
-- ---------------------------------------------------------------------------
create function public.rejoin_reserve(p_player_id uuid, p_max integer, p_lock_seconds integer)
returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  n integer;
begin
  update public.player_secrets s
     set failed_attempts = (case
           when (s.locked_until is not null and s.locked_until <= now())
             or (s.locked_until is null and s.failed_attempts >= p_max) then 0
           else s.failed_attempts end) + 1,
         locked_until = case
           when (case
                   when (s.locked_until is not null and s.locked_until <= now())
                     or (s.locked_until is null and s.failed_attempts >= p_max) then 0
                   else s.failed_attempts end) + 1 >= p_max
             then now() + make_interval(secs => p_lock_seconds)
           else null end
   where s.player_id = p_player_id
     and (s.locked_until is null or s.locked_until <= now())
  returning s.failed_attempts into n;
  if found then
    return case when n >= p_max then 'last' else 'ok' end;
  end if;
  if exists (select 1 from public.player_secrets s where s.player_id = p_player_id) then
    return 'locked';
  end if;
  return 'not_found';
end $$;

create function public.rejoin_success(p_player_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  update public.player_secrets s set failed_attempts = 0, locked_until = null where s.player_id = p_player_id;
$$;

-- ---------------------------------------------------------------------------
-- F9. Guest caps: the invitation row is locked while its players are counted,
-- so parallel joins cannot all see room for one more. Returns no row when the
-- invitation is full or gone.
-- ---------------------------------------------------------------------------
create function public.join_player(p_event_id uuid, p_invitation_id uuid, p_name text, p_team_id uuid, p_approved boolean)
returns table (id uuid, name text, team_id uuid, approved boolean, team_switched_at timestamptz)
language plpgsql volatile security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  inv public.invitations;
  n integer;
begin
  select * into inv from public.invitations i
   where i.event_id = p_event_id and i.id = p_invitation_id and i.revoked_at is null
   for update;
  if not found then
    return;
  end if;
  select count(*) into n from public.players p
   where p.event_id = p_event_id and p.invitation_id = p_invitation_id and p.removed_at is null;
  if n >= (case when inv.kind = 'personal' then inv.pax_cap else inv.max_players end) then
    return;
  end if;
  return query
    insert into public.players as p (event_id, invitation_id, name, team_id, approved)
    values (p_event_id, p_invitation_id, p_name, p_team_id, p_approved)
    returning p.id, p.name, p.team_id, p.approved, p.team_switched_at;
end $$;

-- Host invitations: the event row is locked while the promised seats are
-- summed, so two requests cannot both fit under the plan's guest cap.
-- p_rows: [{kind, label, pax_cap, max_players, phone, side_team_id, locale, code_hash (hex)}].
-- Returns {"ok": true, "ids": [...]} in input order, or {"ok": false, "used": n}.
create function public.invitations_add(p_event_id uuid, p_max_guests integer, p_rows jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  used integer;
  asked integer;
  ids uuid[] := '{}';
  r jsonb;
  new_id uuid;
begin
  perform 1 from public.events e where e.id = p_event_id for update;
  if not found then
    raise exception 'event not found';
  end if;
  if p_max_guests is not null then
    select coalesce(sum(case when i.kind = 'personal' then i.pax_cap else i.max_players end), 0) into used
      from public.invitations i
     where i.event_id = p_event_id and i.revoked_at is null and i.kind in ('personal', 'group');
    select coalesce(sum(case when x ->> 'kind' = 'personal' then (x ->> 'pax_cap')::integer else (x ->> 'max_players')::integer end), 0)
      into asked
      from jsonb_array_elements(p_rows) x;
    if used + asked > p_max_guests then
      return jsonb_build_object('ok', false, 'used', used);
    end if;
  end if;
  for r in select x from jsonb_array_elements(p_rows) with ordinality as t(x, n) order by n loop
    insert into public.invitations (event_id, kind, label, pax_cap, max_players, phone, side_team_id, locale, code_hash)
    values (
      p_event_id,
      r ->> 'kind',
      r ->> 'label',
      (r ->> 'pax_cap')::integer,
      (r ->> 'max_players')::integer,
      r ->> 'phone',
      (r ->> 'side_team_id')::uuid,
      r ->> 'locale',
      decode(r ->> 'code_hash', 'hex')
    )
    returning id into new_id;
    ids := ids || new_id;
  end loop;
  return jsonb_build_object('ok', true, 'ids', to_jsonb(ids));
end $$;

-- ---------------------------------------------------------------------------
-- F4. Upload slots. Serialised per event; only uploaded and processed files
-- count toward the caps, and a player may hold only a few unfinished slots.
-- Returns 'ok', 'quota' or 'pending'.
-- ---------------------------------------------------------------------------
create function public.media_reserve(
  p_id uuid, p_event_id uuid, p_player_id uuid, p_purpose text, p_path text,
  p_player_cap integer, p_event_cap integer, p_pending_cap integer
) returns text language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('media:' || p_event_id::text));
  if (select count(*) from public.media m
       where m.event_id = p_event_id and m.player_id = p_player_id and m.state = 'pending_upload') >= p_pending_cap then
    return 'pending';
  end if;
  if (select count(*) from public.media m
       where m.event_id = p_event_id and m.player_id = p_player_id and m.purpose = p_purpose
         and m.state in ('uploaded', 'processed')) >= p_player_cap then
    return 'quota';
  end if;
  if (select count(*) from public.media m
       where m.event_id = p_event_id and m.state in ('uploaded', 'processed')) >= p_event_cap then
    return 'quota';
  end if;
  insert into public.media (id, event_id, player_id, purpose, quarantine_path)
  values (p_id, p_event_id, p_player_id, p_purpose, p_path);
  return 'ok';
end $$;

-- Completing an upload re-checks the caps under the same lock, so unfinished
-- slots cannot be cashed in past them. Returns the purpose, 'quota' (the slot
-- is rejected) or null when there is no such pending slot.
create function public.media_complete(
  p_media_id uuid, p_event_id uuid, p_player_id uuid, p_photo_cap integer, p_voice_cap integer, p_event_cap integer
) returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  m public.media;
begin
  perform pg_advisory_xact_lock(hashtext('media:' || p_event_id::text));
  select * into m from public.media x
   where x.id = p_media_id and x.event_id = p_event_id and x.player_id = p_player_id and x.state = 'pending_upload';
  if not found then
    return null;
  end if;
  if (select count(*) from public.media x
       where x.event_id = p_event_id and x.player_id = p_player_id and x.purpose = m.purpose
         and x.state in ('uploaded', 'processed')) >= (case when m.purpose = 'wall_voice' then p_voice_cap else p_photo_cap end)
     or (select count(*) from public.media x
          where x.event_id = p_event_id and x.state in ('uploaded', 'processed')) >= p_event_cap then
    update public.media x set state = 'rejected' where x.id = m.id;
    return 'quota';
  end if;
  update public.media x set state = 'uploaded' where x.id = m.id;
  return m.purpose;
end $$;

-- ---------------------------------------------------------------------------
-- F7. Keeper seal: binding the device, storing the ciphertext and counting the
-- seal happen in one guarded statement. Of two devices racing on a fresh link
-- exactly one wins; the other is told 'other_device'.
-- ---------------------------------------------------------------------------
create function public.reveal_seal(
  p_reveal_id uuid, p_device_hash bytea, p_ciphertext bytea, p_nonce bytea, p_key_version integer
) returns table (out_state text, out_seal_count integer)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  n integer;
  r public.reveals;
begin
  update public.reveals x
     set ciphertext = p_ciphertext,
         nonce = p_nonce,
         key_version = p_key_version,
         keeper_device_hash = p_device_hash,
         sealed_at = now(),
         seal_count = x.seal_count + 1
   where x.id = p_reveal_id
     and x.reveal_at is null
     and x.revealed_at is null
     and (x.keeper_device_hash is null or x.keeper_device_hash = p_device_hash)
  returning x.seal_count into n;
  if found then
    return query select 'sealed'::text, n;
    return;
  end if;
  select * into r from public.reveals x where x.id = p_reveal_id;
  if not found then
    return query select 'not_found'::text, null::integer;
  elsif r.reveal_at is not null or r.revealed_at is not null then
    return query select 'locked'::text, null::integer;
  else
    return query select 'other_device'::text, null::integer;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- F8. Wall reports count only from approved, present players who came through
-- a personal or group link, and are added in one statement.
-- ---------------------------------------------------------------------------
create function public.wall_report(p_event_id uuid, p_post_id uuid, p_player_id uuid, p_threshold integer)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
begin
  if not exists (
    select 1
      from public.players p
      join public.invitations i on i.event_id = p.event_id and i.id = p.invitation_id
     where p.event_id = p_event_id and p.id = p_player_id
       and p.approved and p.removed_at is null
       and i.kind <> 'open' and i.revoked_at is null
  ) then
    return false;
  end if;
  update public.wall_posts w
     set reported_count = w.reported_count + 1,
         status = case when w.reported_count + 1 >= p_threshold and w.status = 'visible' then 'pending' else w.status end
   where w.event_id = p_event_id and w.id = p_post_id;
  return found;
end $$;

revoke execute on function
  public.rate_limit_refund(text, integer),
  public.rejoin_reserve(uuid, integer, integer),
  public.rejoin_success(uuid),
  public.join_player(uuid, uuid, text, uuid, boolean),
  public.invitations_add(uuid, integer, jsonb),
  public.media_reserve(uuid, uuid, uuid, text, text, integer, integer, integer),
  public.media_complete(uuid, uuid, uuid, integer, integer, integer),
  public.reveal_seal(uuid, bytea, bytea, bytea, integer),
  public.wall_report(uuid, uuid, uuid, integer),
  public.claim_event(bytea, uuid, text)
from public, anon, authenticated;
grant execute on function
  public.rate_limit_refund(text, integer),
  public.rejoin_reserve(uuid, integer, integer),
  public.rejoin_success(uuid),
  public.join_player(uuid, uuid, text, uuid, boolean),
  public.invitations_add(uuid, integer, jsonb),
  public.media_reserve(uuid, uuid, uuid, text, text, integer, integer, integer),
  public.media_complete(uuid, uuid, uuid, integer, integer, integer),
  public.reveal_seal(uuid, bytea, bytea, bytea, integer),
  public.wall_report(uuid, uuid, uuid, integer),
  public.claim_event(bytea, uuid, text)
to service_role;

-- ---------------------------------------------------------------------------
-- F11. Hosts cannot read the passcode hash of their own events. Select is
-- granted column by column; every column except passcode_hash.
-- ---------------------------------------------------------------------------
revoke select on public.events from authenticated;
grant select (
  id, owner_id, kind, slug, status, template_id, template_version, content, published_content,
  published_version, theme, settings, default_locale, starts_at, ends_at, timezone, plan_id,
  created_at, updated_at
) on public.events to authenticated;
