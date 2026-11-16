-- Recap highlights: hosts and moderators mark wall posts to feature in the
-- after-event recap. Only the flag is new; who can see a post is unchanged
-- (visible, not taken down by staff, wall rules apply). Written only by the
-- moderation server action on the service key; `authenticated` keeps its
-- select-only grant on wall_posts (security A1, rule 7).
alter table public.wall_posts
  add column highlighted boolean not null default false;

create index wall_posts_highlighted_idx on public.wall_posts (event_id, created_at)
  where highlighted;

-- Top scorers per team for the recap, computed in the database so a large event
-- is not cut off by the API's row limit. Approved, not-removed players only;
-- points count for the team they were earned for. Server-only (security rule 9
-- pattern: execute revoked from API roles). Names are trimmed to first names by
-- the caller.
create function public.recap_top_players(p_event_id uuid, p_per_team integer)
returns table (team_id uuid, player_id uuid, name text, points numeric)
language sql stable security invoker set search_path = '' as $$
  select r.team_id, r.player_id, r.name, r.points
    from (
      select s.team_id, p.id as player_id, p.name, sum(s.points)::numeric as points,
             row_number() over (partition by s.team_id order by sum(s.points) desc, min(s.created_at), p.id) as rn
        from public.score_events s
        join public.players p on p.event_id = s.event_id and p.id = s.player_id
       where s.event_id = p_event_id
         and s.team_id is not null
         and p.approved
         and p.removed_at is null
       group by s.team_id, p.id, p.name
      having sum(s.points) > 0
    ) r
   where r.rn <= greatest(1, least(p_per_team, 10))
   order by r.team_id, r.rn;
$$;

revoke execute on function public.recap_top_players(uuid, integer) from public, anon, authenticated;
grant execute on function public.recap_top_players(uuid, integer) to service_role;
