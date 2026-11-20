"use client";

import { useEffect, useState } from "react";
import { highlightPost, listHighlightedPosts, moderatePost } from "@/features/control/actions";
import { Button } from "@/components/ui/button";
import { Badge, Notice, SectionHeading } from "@/components/ui/card";
import type { Locale } from "@/i18n/config";
import { wallMediaUrls } from "../../actions/play";
import type { PostView } from "../../lib/play-data";
import { fmt } from "../../lib/text";
import { hostMessages } from "../../messages";
import { ActNotice } from "./act-notice";
import { useAct } from "./use-act";

type Props = { lang: Locale; eventId: string; posts: PostView[]; timezone: string };

// Signed links last ten minutes; they are fetched again a little before that.
const RENEW_MS = 8 * 60 * 1000;

export function WallSection({ lang, eventId, posts, timezone }: Props) {
  const t = hostMessages(lang);
  const w = t.play.wall;
  const h = t.highlights;
  const { act, pending, message } = useAct(lang);
  // Wishes marked for the guests' recap. Read separately so the shared page
  // data does not change; refreshed whenever the list of posts does.
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  const [highlightRound, setHighlightRound] = useState(0);
  const postsKey = posts.map((post) => `${post.id}:${post.status}`).join(",");
  // Kept across the page's periodic reloads so a playing voice note is not interrupted.
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [round, setRound] = useState(0);

  const wanted = posts
    .filter((post) => post.media?.ready && !post.locked)
    .map((post) => post.media!.id)
    .filter((id) => !urls[id])
    .slice(0, 80);
  const wantedKey = wanted.join(",");

  useEffect(() => {
    if (wantedKey === "") return;
    let cancelled = false;
    wallMediaUrls(eventId, wantedKey.split(","))
      .then((result) => {
        if (!cancelled && result.ok) setUrls((current) => ({ ...current, ...result.urls }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eventId, wantedKey, round]);

  useEffect(() => {
    let cancelled = false;
    listHighlightedPosts(eventId)
      .then((ids) => {
        if (!cancelled) setHighlighted(new Set(ids));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eventId, postsKey, highlightRound]);

  useEffect(() => {
    const timer = setInterval(() => {
      setUrls({});
      setRound((n) => n + 1);
    }, RENEW_MS);
    return () => clearInterval(timer);
  }, []);

  const sections = [
    { status: "pending" as const, title: w.pending },
    { status: "visible" as const, title: w.visible },
    { status: "hidden" as const, title: w.hidden },
  ];
  const moderate = (postId: string, status: "visible" | "hidden") =>
    act(
      () => moderatePost(eventId, postId, status),
      (ok) => (ok ? null : { tone: "danger", text: t.play.failed }),
    );
  const toggleHighlight = (postId: string, on: boolean) =>
    act(
      () => highlightPost(eventId, postId, on),
      (result) => {
        setHighlightRound((n) => n + 1);
        if (result.ok) return null;
        return { tone: "danger", text: result.reason === "full" ? h.full : t.play.failed };
      },
    );
  const dates = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });

  function media(post: PostView) {
    if (!post.media) return null;
    if (post.locked) return null;
    if (!post.media.ready) return <p className="text-sm text-muted">{w.processing}</p>;
    const url = urls[post.media.id];
    if (!url) return <div className="h-40 animate-pulse rounded-control bg-line/40" aria-hidden="true" />;
    if (post.kind === "voice") {
      return (
        <audio controls preload="none" src={url} aria-label={fmt(w.voice, { name: post.author })} className="w-full">
          {w.unavailable}
        </audio>
      );
    }
    return (
      // A short-lived signed link from private storage; the image optimiser must not cache it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={fmt(w.photo, { name: post.author })}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="max-h-96 w-full rounded-control bg-surface object-contain"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ActNotice message={message} />
      <div>
        <SectionHeading title={w.title} lead={`${w.lead} ${h.lead}`} />
        {posts.length === 0 ? <Notice>{w.empty}</Notice> : null}
        <div className="flex flex-col gap-8">
          {sections.map(({ status, title }) => {
            const list = posts.filter((post) => post.status === status);
            if (list.length === 0) return null;
            return (
              <section key={status} aria-label={title}>
                <h3 className="mb-3 text-base font-semibold">
                  {title} · {list.length}
                </h3>
                <ul className={`grid gap-3 ${status === "pending" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                  {list.map((post) => (
                    <li key={post.id} className="flex flex-col gap-3 rounded-panel border border-line bg-raised p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold [overflow-wrap:anywhere]">{post.author}</p>
                        <span className="flex flex-wrap gap-1">
                          {highlighted.has(post.id) && post.status === "visible" ? <Badge tone="highlight">{h.badge}</Badge> : null}
                          {post.reported > 0 ? <Badge tone="danger">{fmt(w.reported, { n: post.reported })}</Badge> : null}
                        </span>
                      </div>
                      {media(post)}
                      {/* Guest text is rendered as text, never as markup. */}
                      {post.body ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{post.body}</p> : null}
                      <p className="text-xs text-muted">{dates.format(new Date(post.createdAt))}</p>
                      {post.locked ? (
                        <p className="text-sm text-danger">{w.locked}</p>
                      ) : (
                        <div className="mt-auto flex flex-wrap gap-2">
                          {status !== "visible" ? (
                            <Button size="md" className="flex-1" disabled={pending} onClick={() => moderate(post.id, "visible")}>
                              {status === "pending" ? w.approve : w.show}
                              <span className="sr-only"> — {post.author}</span>
                            </Button>
                          ) : null}
                          {status !== "hidden" ? (
                            <Button variant="secondary" size="md" className="flex-1" disabled={pending} onClick={() => moderate(post.id, "hidden")}>
                              {w.hide}
                              <span className="sr-only"> — {post.author}</span>
                            </Button>
                          ) : null}
                          {status === "visible" ? (
                            <Button
                              variant={highlighted.has(post.id) ? "primary" : "ghost"}
                              size="md"
                              className="w-full"
                              disabled={pending}
                              aria-pressed={highlighted.has(post.id)}
                              onClick={() => toggleHighlight(post.id, !highlighted.has(post.id))}
                            >
                              {highlighted.has(post.id) ? h.remove : h.add}
                              <span className="sr-only"> — {post.author}</span>
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
