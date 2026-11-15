-- Core schema. See docs/product/2026-11-15-technical-design.md and
-- docs/product/2026-11-15-security-requirements.md (binding).
--
-- Access model:
--   anon           no access to anything
--   authenticated  (hosts) read-only on their own events' rows, plus UPDATE (content, theme) on events
--   service_role   used only by server code; every other write goes through it

-- ---------------------------------------------------------------------------
-- Lock down defaults before creating anything (security rule 8)
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  created_at timestamptz not null default now()
);

create table public.staff_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('support', 'designer', 'admin')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.plans (
  id text primary key,
  name_ar text not null,
  name_en text not null,
  price_egp integer not null check (price_egp >= 0),
  entitlements jsonb not null,
  active boolean not null default true,
  position integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id),
  kind text not null check (kind in ('wedding', 'gender_reveal', 'corporate')),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 8 and 64),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'postponed', 'cancelled', 'ended', 'archived')),
  template_id text not null,
  template_version integer not null,
  content jsonb not null default '{}'::jsonb,           -- draft, edited by the host
  published_content jsonb,                               -- { public: {...}, guest: {...} }, written by the server only
  published_version integer not null default 0,
  theme jsonb not null default '{}'::jsonb,              -- palette / font-pair ids only
  settings jsonb not null default '{}'::jsonb,
  default_locale text not null default 'ar' check (default_locale in ('ar', 'en')),
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Africa/Cairo',
  plan_id text references public.plans (id),             -- set only by payment settlement
  passcode_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (octet_length(content::text) <= 200000),
  check (octet_length(theme::text) <= 4000)
);
create index events_owner_idx on public.events (owner_id);

-- Slugs are never reused, even after an event is deleted (security V1).
create table public.slug_tombstones (
  slug text primary key,
  retired_at timestamptz not null default now()
);

create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('moderator')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.staff_grants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  staff_id uuid not null references auth.users (id),
  capabilities text[] not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index staff_grants_lookup_idx on public.staff_grants (staff_id, event_id);

-- ---------------------------------------------------------------------------
-- Guests. Every event-scoped table carries event_id and a unique (event_id, id),
-- and children reference (event_id, parent_id), so a cross-event reference
-- cannot be stored even by server code (security A2).
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,32}$'),
  name_ar text not null check (char_length(name_ar) <= 60),
  name_en text not null check (char_length(name_en) <= 60),
  color text not null check (color ~ '^[a-z0-9_-]{1,24}$'),   -- palette token name, never a raw colour
  position integer not null default 0,
  unique (event_id, id),
  unique (event_id, key)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('personal', 'group', 'open')),
  label text not null check (char_length(label) between 1 and 120),
  side_team_id uuid,
  pax_cap integer not null default 1 check (pax_cap between 1 and 50),
  max_players integer not null default 10 check (max_players between 1 and 2000),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  locale text check (locale in ('ar', 'en')),
  code_hash bytea not null unique,
  opened_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, id),
  foreign key (event_id, side_team_id) references public.teams (event_id, id)
);
create index invitations_event_idx on public.invitations (event_id);
-- One open link per event.
create unique index invitations_one_open_idx on public.invitations (event_id) where kind = 'open';

create table public.players (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  invitation_id uuid not null,
  name text not null check (char_length(name) between 1 and 40),
  team_id uuid,
  approved boolean not null default true,
  removed_at timestamptz,
  team_switched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, id),
  foreign key (event_id, invitation_id) references public.invitations (event_id, id) on delete cascade,
  foreign key (event_id, team_id) references public.teams (event_id, id)
);
create index players_event_idx on public.players (event_id);
create index players_invitation_idx on public.players (invitation_id);

-- Rejoin codes: HMAC with a server pepper, never readable by hosts (security S2).
create table public.player_secrets (
  player_id uuid primary key references public.players (id) on delete cascade,
  rejoin_hmac bytea not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz
);

create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  event_id uuid not null references public.events (id) on delete cascade,
  invitation_id uuid not null,
  player_id uuid,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  foreign key (event_id, invitation_id) references public.invitations (event_id, id) on delete cascade,
  foreign key (event_id, player_id) references public.players (event_id, id) on delete set null (player_id)
);
create index guest_sessions_invitation_idx on public.guest_sessions (invitation_id);

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  invitation_id uuid not null,
  player_id uuid,                                        -- null on personal links (the party answers once)
  status text not null check (status in ('yes', 'no', 'maybe')),
  adults integer not null default 1 check (adults between 0 and 50),
  children integer not null default 0 check (children between 0 and 50),
  answers jsonb not null default '{}'::jsonb check (octet_length(answers::text) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, id),
  foreign key (event_id, invitation_id) references public.invitations (event_id, id) on delete cascade,
  foreign key (event_id, player_id) references public.players (event_id, id) on delete cascade
);
create unique index rsvps_party_idx on public.rsvps (invitation_id) where player_id is null;
create unique index rsvps_player_idx on public.rsvps (player_id) where player_id is not null;

-- ---------------------------------------------------------------------------
-- Play engine
-- ---------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('quiz', 'vote', 'prediction', 'clues')),
  config jsonb not null check (octet_length(config::text) <= 60000),   -- never contains truth (security rule 22)
  state text not null default 'hidden' check (state in ('hidden', 'open', 'closed', 'settled')),
  opens_at timestamptz,
  closes_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, id)
);
create index games_event_idx on public.games (event_id);

create table public.game_secrets (
  game_id uuid primary key references public.games (id) on delete cascade,
  truth jsonb not null
);

create table public.game_answers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  game_id uuid not null,
  player_id uuid not null,
  question_id text not null check (question_id ~ '^[a-z0-9_-]{1,40}$'),
  payload jsonb not null check (octet_length(payload::text) <= 2000),
  score integer not null default 0,
  served_at timestamptz,
  answered_at timestamptz not null default now(),
  unique (game_id, player_id, question_id),
  foreign key (event_id, game_id) references public.games (event_id, id) on delete cascade,
  foreign key (event_id, player_id) references public.players (event_id, id) on delete cascade
);
create index game_answers_game_idx on public.game_answers (game_id);

-- Marks "question served at" for timed quizzes, stamped by the server.
create table public.game_serves (
  game_id uuid not null,
  player_id uuid not null,
  question_id text not null,
  event_id uuid not null,
  served_at timestamptz not null default now(),
  primary key (game_id, player_id, question_id),
  foreign key (event_id, game_id) references public.games (event_id, id) on delete cascade,
  foreign key (event_id, player_id) references public.players (event_id, id) on delete cascade
);

-- Append-only points ledger. Team totals are only ever recomputed from it.
create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null,
  team_id uuid,
  points integer not null check (points between -1000 and 1000),
  reason text not null check (reason ~ '^[a-z_]{1,32}$'),
  ref text not null check (char_length(ref) <= 120),
  created_at timestamptz not null default now(),
  unique (player_id, reason, ref),
  foreign key (event_id, player_id) references public.players (event_id, id) on delete cascade,
  foreign key (event_id, team_id) references public.teams (event_id, id)
);
create index score_events_event_idx on public.score_events (event_id);

create table public.team_scores (
  team_id uuid primary key references public.teams (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  score numeric(10, 2) not null default 0,
  active_players integer not null default 0,
  updated_at timestamptz not null default now()
);
create index team_scores_event_idx on public.team_scores (event_id);

-- ---------------------------------------------------------------------------
-- Wall and media
-- ---------------------------------------------------------------------------
create table public.media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid,
  purpose text not null check (purpose in ('wall_photo', 'wall_voice', 'content_image', 'receipt')),
  quarantine_path text not null,
  clean_path text,
  mime text,
  bytes integer,
  width integer,
  height integer,
  duration_ms integer,
  state text not null default 'pending_upload'
    check (state in ('pending_upload', 'uploaded', 'processed', 'rejected')),
  created_at timestamptz not null default now(),
  unique (event_id, id),
  foreign key (event_id, player_id) references public.players (event_id, id) on delete set null (player_id)
);
create index media_event_idx on public.media (event_id);

create table public.wall_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null,
  kind text not null check (kind in ('text', 'voice', 'photo')),
  body text check (body is null or char_length(body) <= 600),
  media_id uuid,
  status text not null default 'pending' check (status in ('visible', 'pending', 'hidden')),
  reported_count integer not null default 0,
  removed_by_staff_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, id),
  foreign key (event_id, player_id) references public.players (event_id, id) on delete cascade,
  foreign key (event_id, media_id) references public.media (event_id, id)
);
create index wall_posts_event_idx on public.wall_posts (event_id, status);

-- ---------------------------------------------------------------------------
-- Live state and the reveal
-- ---------------------------------------------------------------------------
create table public.live_state (
  event_id uuid primary key references public.events (id) on delete cascade,
  phase text not null default 'idle' check (phase in ('idle', 'countdown', 'revealed')),
  public_payload jsonb not null default '{}'::jsonb,     -- numbers and team ids only, never names
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.reveals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events (id) on delete cascade,
  keeper_code_hash bytea unique,
  keeper_device_hash bytea,
  seal_count integer not null default 0,
  sealed_at timestamptz,
  ciphertext bytea,
  nonce bytea,
  key_version integer,
  style text not null default 'balloon' check (style in ('balloon', 'scratch')),
  reveal_at timestamptz,
  revealed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  user_id uuid not null references auth.users (id),
  plan_id text not null references public.plans (id),
  amount_egp integer not null check (amount_egp >= 0),   -- snapshot taken on the server at creation
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'refunded', 'disputed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create unique index orders_one_paid_idx on public.orders (event_id) where status = 'paid';
create index orders_event_idx on public.orders (event_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  provider text not null check (provider in ('manual', 'paymob')),
  provider_ref text not null,
  amount_egp integer not null,
  receipt_media_id uuid references public.media (id),
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  ref text not null,
  payload jsonb not null default '{}'::jsonb,            -- ids only; handlers reload state
  state text not null default 'queued' check (state in ('queued', 'running', 'done', 'dead')),
  run_at timestamptz not null default now(),
  locked_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  unique (kind, ref)
);
create index jobs_due_idx on public.jobs (run_at) where state in ('queued', 'running');

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('host', 'staff', 'keeper', 'system')),
  action text not null,
  event_id uuid,
  target text,
  grant_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_log_event_idx on public.audit_log (event_id, created_at);

create function private.audit_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger events_touch before update on public.events
  for each row execute function private.touch_updated_at();
create trigger rsvps_touch before update on public.rsvps
  for each row execute function private.touch_updated_at();

create function private.retire_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.slug_tombstones (slug) values (old.slug) on conflict do nothing;
  return old;
end $$;
create trigger events_retire_slug after delete on public.events
  for each row execute function private.retire_slug();

create function private.block_retired_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.slug_tombstones t where t.slug = new.slug) then
    raise exception 'slug has been used before';
  end if;
  return new;
end $$;
create trigger events_block_retired_slug before insert or update of slug on public.events
  for each row execute function private.block_retired_slug();

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
create function private.is_event_owner(eid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e where e.id = eid and e.owner_id = (select auth.uid())
  );
$$;

create function private.is_event_member(eid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_event_owner(eid)) or exists (
    select 1 from public.event_members m where m.event_id = eid and m.user_id = (select auth.uid())
  );
$$;
revoke execute on function private.is_event_owner(uuid), private.is_event_member(uuid) from public, anon;
grant execute on function private.is_event_owner(uuid), private.is_event_member(uuid) to authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Own profile.
grant select on public.profiles to authenticated;
grant update (display_name, locale) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Catalogue.
grant select on public.plans to authenticated;
create policy plans_select_active on public.plans for select to authenticated using (active);

-- Events: owners read everything of theirs; they may edit only the draft content and theme.
grant select on public.events to authenticated;
grant update (content, theme) on public.events to authenticated;
create policy events_select_member on public.events for select to authenticated
  using ((select private.is_event_member(id)));
create policy events_update_owner on public.events for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Owner-only reads.
grant select (id, event_id, kind, label, side_team_id, pax_cap, max_players, phone, locale, opened_at, revoked_at, created_at)
  on public.invitations to authenticated;
create policy invitations_select_owner on public.invitations for select to authenticated
  using ((select private.is_event_owner(event_id)));

grant select on public.rsvps, public.games, public.game_answers, public.score_events,
  public.team_scores, public.live_state, public.event_members to authenticated;
create policy rsvps_select_owner on public.rsvps for select to authenticated
  using ((select private.is_event_owner(event_id)));
create policy games_select_owner on public.games for select to authenticated
  using ((select private.is_event_owner(event_id)));
create policy game_answers_select_owner on public.game_answers for select to authenticated
  using ((select private.is_event_owner(event_id)));
create policy score_events_select_owner on public.score_events for select to authenticated
  using ((select private.is_event_owner(event_id)));
create policy team_scores_select_owner on public.team_scores for select to authenticated
  using ((select private.is_event_owner(event_id)));
create policy live_state_select_owner on public.live_state for select to authenticated
  using ((select private.is_event_owner(event_id)));
create policy event_members_select_owner on public.event_members for select to authenticated
  using ((select private.is_event_owner(event_id)) or user_id = (select auth.uid()));

-- Owner and moderator reads.
grant select on public.teams, public.players, public.wall_posts to authenticated;
grant select (id, event_id, player_id, purpose, mime, bytes, width, height, duration_ms, state, created_at)
  on public.media to authenticated;
create policy teams_select_member on public.teams for select to authenticated
  using ((select private.is_event_member(event_id)));
create policy players_select_member on public.players for select to authenticated
  using ((select private.is_event_member(event_id)));
create policy wall_posts_select_member on public.wall_posts for select to authenticated
  using ((select private.is_event_member(event_id)));
create policy media_select_member on public.media for select to authenticated
  using ((select private.is_event_member(event_id)) and purpose in ('wall_photo', 'wall_voice', 'content_image'));

-- No policies (server only): staff_roles, staff_grants, slug_tombstones, player_secrets,
-- guest_sessions, game_secrets, game_serves, reveals, orders, payments, jobs, rate_limits, audit_log.

-- ---------------------------------------------------------------------------
-- Server-only functions (service_role). Not callable with a host or anonymous key.
-- ---------------------------------------------------------------------------

-- Fixed-window counter. Returns true while the caller is within the limit.
create function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c integer;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, w, 1)
    on conflict (key, window_start) do update set count = r.count + 1
    returning r.count into c;
  return c <= p_max;
end $$;

-- Claims due jobs without blocking other workers (security rule 36).
create function public.jobs_claim(p_limit integer, p_visibility_seconds integer)
returns setof public.jobs language sql security invoker set search_path = '' as $$
  update public.jobs j
     set state = 'running',
         attempts = j.attempts + 1,
         locked_until = now() + make_interval(secs => p_visibility_seconds)
   where j.id in (
     select id from public.jobs
      where (state = 'queued' and run_at <= now())
         or (state = 'running' and locked_until < now())
      order by run_at
      limit p_limit
      for update skip locked
   )
  returning j.*;
$$;

-- Team score = average of the team's top N active players, N = smallest team's
-- active-player count clamped to 3..15 (technical design §7).
create function public.recompute_team_scores(p_event_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  n integer;
begin
  with totals as (
    select s.team_id, s.player_id, sum(s.points) as pts
      from public.score_events s
      join public.players p on p.id = s.player_id
     where s.event_id = p_event_id and s.team_id is not null
       and p.approved and p.removed_at is null
     group by s.team_id, s.player_id
  ), counts as (
    select team_id, count(*) as c from totals group by team_id
  )
  select greatest(3, least(15, coalesce(min(c), 3)))::integer into n from counts;

  insert into public.team_scores as ts (team_id, event_id, score, active_players, updated_at)
  select t.id, t.event_id, coalesce(x.score, 0), coalesce(x.active, 0), now()
    from public.teams t
    left join lateral (
      select round(coalesce(sum(r.pts), 0)::numeric / n, 2) as score,
             (select count(*) from (
                select 1 from public.score_events s2
                  join public.players p2 on p2.id = s2.player_id
                 where s2.team_id = t.id and p2.approved and p2.removed_at is null
                 group by s2.player_id) a)::integer as active
        from (
          select sum(s.points) as pts
            from public.score_events s
            join public.players p on p.id = s.player_id
           where s.team_id = t.id and p.approved and p.removed_at is null
           group by s.player_id
           order by sum(s.points) desc
           limit n
        ) r
    ) x on true
   where t.event_id = p_event_id
  on conflict (team_id) do update
    set score = excluded.score, active_players = excluded.active_players, updated_at = now();
end $$;

-- Releases the reveal on database time, exactly once (security rules 27-28).
create function public.reveal_release(p_event_id uuid)
returns table (id uuid, ciphertext bytea, nonce bytea, key_version integer)
language sql security invoker set search_path = '' as $$
  update public.reveals r
     set revealed_at = now()
   where r.event_id = p_event_id
     and r.reveal_at is not null and r.reveal_at <= now()
     and r.revealed_at is null and r.ciphertext is not null
  returning r.id, r.ciphertext, r.nonce, r.key_version;
$$;

-- Settles an order and grants the plan in one transaction (security P1).
create function public.settle_order(
  p_order_id uuid, p_provider text, p_provider_ref text, p_amount_egp integer,
  p_approved_by uuid, p_receipt_media_id uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status <> 'pending' or o.amount_egp <> p_amount_egp then
    return false;
  end if;
  insert into public.payments (order_id, provider, provider_ref, amount_egp, approved_by, receipt_media_id)
    values (p_order_id, p_provider, p_provider_ref, p_amount_egp, p_approved_by, p_receipt_media_id);
  update public.orders set status = 'paid', paid_at = now() where id = p_order_id;
  update public.events set plan_id = o.plan_id where id = o.event_id;
  return true;
end $$;

revoke execute on function
  public.rate_limit_hit(text, integer, integer),
  public.jobs_claim(integer, integer),
  public.recompute_team_scores(uuid),
  public.reveal_release(uuid),
  public.settle_order(uuid, text, text, integer, uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.rate_limit_hit(text, integer, integer),
  public.jobs_claim(integer, integer),
  public.recompute_team_scores(uuid),
  public.reveal_release(uuid),
  public.settle_order(uuid, text, text, integer, uuid, uuid)
to service_role;

-- ---------------------------------------------------------------------------
-- Storage: private buckets, no policies for API roles (security rules 8, 30).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('quarantine', 'quarantine', false, 2097152,
    array['image/jpeg', 'image/webp', 'image/png', 'audio/webm', 'audio/mp4', 'audio/ogg']),
  ('media', 'media', false, 4194304, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Plans (prices are hypotheses; see launch scope §5)
-- ---------------------------------------------------------------------------
insert into public.plans (id, name_ar, name_en, price_egp, position, entitlements) values
  ('essential', 'الأساسية', 'Essential', 350, 1,
    '{"max_guests":100,"personal_links":false,"games":false,"share_cards":false,"voice":false,"photos":false,"reveal":false}'),
  ('premium', 'المميزة', 'Premium', 750, 2,
    '{"max_guests":null,"personal_links":true,"games":true,"share_cards":true,"voice":true,"photos":true,"reveal":true}');
