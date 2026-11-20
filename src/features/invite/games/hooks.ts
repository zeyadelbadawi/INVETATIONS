"use client";

// Data for the play sections, from the guest API. Each hook returns null until
// it has something to show, and the page renders a section only when it does.
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { useInvite } from "../guest/GuestContext";
import { useLive } from "../guest/Live";
import type { AnswerValue, GameItem, GamesData, RecapData, ServeResult, SubmitResult, WallData, WallPost } from "./types";

const base = (slug: string) => `/api/guest/${encodeURIComponent(slug)}`;

async function submit(path: string, body: unknown): Promise<SubmitResult> {
  const result = await apiPost<{ points?: number }>(path, body);
  return result.ok ? { ok: true, points: typeof result.data?.points === "number" ? result.data.points : null } : { ok: false, error: result.error };
}

export function useGames(): GamesData | null {
  const { event, status, me, demo, refresh: refreshMe } = useInvite();
  const { live, revision } = useLive();
  const [games, setGames] = useState<GameItem[] | null>(null);
  const [tick, setTick] = useState(0);
  const slug = event.slug;
  const enabled = !demo && status === "ready" && event.entitlements.games && event.status !== "cancelled" && event.status !== "postponed";
  const playerId = me?.player?.id ?? null;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiGet<{ games: GameItem[] }>(`${base(slug)}/games`, controller.signal).then((result) => {
      if (!controller.signal.aborted && result.ok && Array.isArray(result.data.games)) setGames(result.data.games);
    });
    return () => controller.abort();
  }, [enabled, slug, playerId, tick, revision]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const canSwitch = Boolean(me?.player && !me.player.teamSwitchedAt) && event.kind === "gender_reveal" && !event.settings.lockTeams && (live?.phase ?? "idle") === "idle";

  return useMemo(() => {
    if (!enabled || !games || games.length === 0) return null;
    return {
      games,
      refresh,
      answer: (gameId: string, questionId: string, answer: AnswerValue) => submit(`${base(slug)}/games/${gameId}/answer`, { questionId, answer }),
      serve: async (gameId: string): Promise<ServeResult> => {
        const result = await apiPost<ServeResult>(`${base(slug)}/games/${gameId}/serve`, {});
        return result.ok ? result.data : { ok: false, error: result.error };
      },
      switchTeam: canSwitch
        ? async (teamKey: string) => {
            const result = await submit(`${base(slug)}/team`, { teamKey });
            if (result.ok) refreshMe();
            return result;
          }
        : null,
    };
  }, [enabled, games, refresh, slug, canSwitch, refreshMe]);
}

export function useWall(): WallData | null {
  const { event, status, me, demo } = useInvite();
  const { revision } = useLive();
  const [posts, setPosts] = useState<WallPost[] | null>(null);
  const [tick, setTick] = useState(0);
  const slug = event.slug;
  const player = me?.player ?? null;
  const enabled = !demo && status === "ready" && player !== null && event.status !== "cancelled";
  const playerId = player?.id ?? null;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiGet<{ posts: WallPost[] }>(`${base(slug)}/wall`, controller.signal).then((result) => {
      if (!controller.signal.aborted && result.ok && Array.isArray(result.data.posts)) setPosts(result.data.posts);
    });
    return () => controller.abort();
  }, [enabled, slug, playerId, tick, revision]);

  const voice = event.entitlements.voice;
  const photos = event.entitlements.photos;
  return useMemo(() => {
    if (!enabled || !posts) return null;
    const reload = () => setTick((n) => n + 1);
    return {
      posts,
      canPost: true,
      voiceEnabled: voice,
      photosEnabled: photos,
      postText: async (text: string) => {
        const result = await submit(`${base(slug)}/wall`, { body: text });
        if (result.ok) reload();
        return result;
      },
      // Ask for a slot, put the file in quarantine, then tell the server it is there.
      postMedia: async (purpose, file, caption) => {
        const slot = await apiPost<{ mediaId: string; uploadUrl: string }>(`${base(slug)}/upload`, { purpose, bytes: file.size });
        if (!slot.ok) return { ok: false, error: slot.error };
        try {
          const put = await fetch(slot.data.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
          if (!put.ok) return { ok: false, error: "upload" };
        } catch {
          return { ok: false, error: "network" };
        }
        const done = await submit(`${base(slug)}/upload/complete`, { mediaId: slot.data.mediaId, caption });
        if (done.ok) reload();
        return done;
      },
      report: async (postId: string) => {
        await apiPost(`${base(slug)}/wall/report`, { postId });
      },
    };
  }, [enabled, posts, slug, voice, photos]);
}

// Over when the hosts closed it, or when its end time has passed.
export function eventEnded(event: { status: string; endsAt: string | null }, now = Date.now()): boolean {
  if (event.status === "ended") return true;
  return event.status === "published" && event.endsAt !== null && Date.parse(event.endsAt) < now;
}

// The recap, for guests with a session once the event is over. The server
// refuses it before then, so asking early only costs one request.
export function useRecap(): RecapData | null {
  const { event, status, demo } = useInvite();
  const [recap, setRecap] = useState<RecapData | null>(null);
  const slug = event.slug;
  const [ended] = useState(() => eventEnded(event));
  const enabled = !demo && status === "ready" && ended;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiGet<RecapData>(`${base(slug)}/recap`, controller.signal).then((result) => {
      if (!controller.signal.aborted && result.ok && Array.isArray(result.data?.teams)) setRecap(result.data);
    });
    return () => controller.abort();
  }, [enabled, slug]);

  return enabled ? recap : null;
}
