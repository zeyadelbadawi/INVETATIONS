-- Reveal control on database time (security rules 27-28). Server-only.

-- Starts the countdown. Requires a sealed answer; the lead is at least 60 seconds
-- so every polling client learns the time before zero.
create function public.reveal_start(p_event_id uuid, p_lead_seconds integer)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare
  t timestamptz;
begin
  update public.reveals r
     set reveal_at = now() + make_interval(secs => greatest(60, least(p_lead_seconds, 86400 * 60)))
   where r.event_id = p_event_id
     and r.ciphertext is not null
     and r.revealed_at is null
     and r.reveal_at is null
  returning r.reveal_at into t;
  if t is null then
    return null;
  end if;
  insert into public.live_state as l (event_id, phase, public_payload, version, updated_at)
    values (p_event_id, 'countdown', jsonb_build_object('revealAt', t), 1, now())
  on conflict (event_id) do update
    set phase = 'countdown', public_payload = jsonb_build_object('revealAt', t),
        version = l.version + 1, updated_at = now();
  return t;
end $$;

-- Cancels a countdown that has not reached zero. A released reveal cannot be undone.
create function public.reveal_cancel(p_event_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  n integer;
begin
  update public.reveals r
     set reveal_at = null
   where r.event_id = p_event_id and r.revealed_at is null
     and r.reveal_at is not null and r.reveal_at > now();
  get diagnostics n = row_count;
  if n = 0 then
    return false;
  end if;
  update public.live_state l
     set phase = 'idle', public_payload = '{}'::jsonb, version = l.version + 1, updated_at = now()
   where l.event_id = p_event_id;
  return true;
end $$;

create function public.server_now() returns timestamptz
language sql security invoker set search_path = '' as $$ select now(); $$;

revoke execute on function public.reveal_start(uuid, integer), public.reveal_cancel(uuid), public.server_now()
  from public, anon, authenticated;
grant execute on function public.reveal_start(uuid, integer), public.reveal_cancel(uuid), public.server_now()
  to service_role;
