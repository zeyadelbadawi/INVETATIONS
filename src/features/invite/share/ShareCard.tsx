"use client";

// The personal share card, drawn in a canvas so the browser shapes the Arabic.
// It carries a first name, a team and optionally a score — never a photo, and
// the only link is the plain invitation URL, never a link code (security rule 19).

import { useEffect, useRef, useState } from "react";
import { pick } from "@/content/schema";
import { brand } from "@/config/brand";
import { getMessages } from "../messages";
import { firstName } from "../lib/format";
import { eventTitle } from "../lib/content";
import { resolveColor } from "../reveal/confetti";
import { Icon } from "../Icon";
import { teamColor, useInvite } from "../guest/GuestContext";

type Format = "square" | "story";
const SIZE: Record<Format, { w: number; h: number }> = { square: { w: 1080, h: 1080 }, story: { w: 1080, h: 1920 } };

function star(context: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  // Two overlapped squares: the eight-point star used across the invitation.
  for (const turn of [0, Math.PI / 4]) {
    context.save();
    context.translate(cx, cy);
    context.rotate(turn);
    context.fillRect(-r, -r, r * 2, r * 2);
    context.restore();
  }
}

function fitText(context: CanvasRenderingContext2D, text: string, family: string, weight: string, max: number, width: number): number {
  let size = max;
  do {
    context.font = `${weight} ${size}px ${family}`;
    if (context.measureText(text).width <= width) break;
    size -= 6;
  } while (size > 40);
  return size;
}

type CardInput = { format: Format; name: string; line: string; title: string; score: string | null; footer: string; link: string; rtl: boolean };

function draw(canvas: HTMLCanvasElement, host: HTMLElement, team: string, input: CardInput) {
  const { w, h } = SIZE[input.format];
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  if (!context) return;
  const color = (expression: string) => resolveColor(host, expression);
  const paper = color("var(--paper)");
  const ink = color("var(--ink)");
  const teamFill = color(team);
  const display = getComputedStyle(host).getPropertyValue("--font-display").trim() || "serif";
  const body = getComputedStyle(host).fontFamily;

  context.direction = input.rtl ? "rtl" : "ltr";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = paper;
  context.fillRect(0, 0, w, h);

  // Team colour fills the top; a row of stars makes the torn edge.
  const band = Math.round(h * 0.42);
  context.fillStyle = teamFill;
  context.fillRect(0, 0, w, band);
  for (let x = 0; x <= w; x += 72) star(context, x, band, 30);

  context.fillStyle = "#ffffff";
  context.globalAlpha = 0.92;
  context.font = `500 ${46}px ${body}`;
  context.fillText(input.title, w / 2, band * 0.26, w - 160);
  context.globalAlpha = 1;
  const lineSize = fitText(context, input.line, display, "700", 104, w - 160);
  context.font = `700 ${lineSize}px ${display}`;
  context.fillText(input.line, w / 2, band * 0.26 + 150);

  context.fillStyle = ink;
  const nameSize = fitText(context, input.name, display, "700", 200, w - 140);
  context.font = `700 ${nameSize}px ${display}`;
  const nameY = band + (h - band) * 0.5;
  context.fillText(input.name, w / 2, nameY);

  if (input.score) {
    context.font = `500 52px ${body}`;
    context.fillText(input.score, w / 2, nameY + 110);
  }

  context.globalAlpha = 0.7;
  context.font = `400 36px ${body}`;
  context.direction = "ltr";
  context.fillText(input.link, w / 2, h - 130, w - 120);
  context.direction = input.rtl ? "rtl" : "ltr";
  context.fillText(input.footer, w / 2, h - 70);
  context.globalAlpha = 1;
}

export default function ShareCard({ score }: { score?: number }) {
  const { me, event, locale, titleFields, demo } = useInvite();
  const t = getMessages(locale);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [format, setFormat] = useState<Format>("square");
  const [note, setNote] = useState("");

  const player = me?.player ?? null;
  const team = me?.teams.find((item) => item.id === player?.teamId);
  const title = eventTitle(event, titleFields, locale, locale === "ar" ? " و" : " & ");
  const path = `/i/${event.slug}/${locale}`;
  const name = player ? firstName(player.name) : "";
  const line = team ? t.share.line(pick(team.name, locale)) : t.share.lineNoTeam;
  const teamExpression = teamColor(team?.color);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || !name) return;
    let cancelled = false;
    const paint = () => {
      if (cancelled) return;
      draw(canvas, host, teamExpression, {
        format,
        name,
        line,
        title,
        score: score === undefined ? null : t.share.score(score),
        footer: t.share.madeWith(brand.name[locale]),
        link: `${window.location.host}${path}`,
        rtl: locale === "ar",
      });
    };
    paint();
    // Draw again once the display face has loaded, or the first card uses the fallback font.
    void document.fonts?.ready.then(paint);
    return () => {
      cancelled = true;
    };
  }, [format, name, line, title, score, teamExpression, locale, path, t]);

  if (!player) return null;

  const link = () => `${window.location.origin}${path}`;
  const toBlob = () => new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob(resolve, "image/png") ?? resolve(null));
  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(""), 2500);
  };

  const save = async () => {
    const blob = await toBlob();
    if (!blob) return flash(t.common.error);
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${t.share.fileName}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  };
  const share = async () => {
    const blob = await toBlob();
    if (!blob) return flash(t.common.error);
    const file = new File([blob], `${t.share.fileName}.png`, { type: "image/png" });
    const data: ShareData = { files: [file], text: t.share.text(title), url: link() };
    try {
      if (navigator.canShare?.(data)) await navigator.share(data);
      else if (navigator.share) await navigator.share({ text: data.text, url: data.url });
      else await save();
    } catch {
      // The guest closed the share sheet; nothing to report.
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link());
      flash(t.share.copied);
    } catch {
      flash(link());
    }
  };

  return (
    <section className="inv-block inv-share" aria-labelledby="share-title" ref={hostRef} data-testid="share">
      <h2 id="share-title" className="inv-h2">
        {t.share.title}
      </h2>
      <p className="inv-text">{t.share.intro}</p>
      <div className="inv-segment" role="group" aria-label={t.share.title}>
        {(["square", "story"] as const).map((value) => (
          <button key={value} type="button" className="inv-segment__btn" aria-pressed={format === value} onClick={() => setFormat(value)}>
            {t.share[value]}
          </button>
        ))}
      </div>
      <canvas ref={canvasRef} className="inv-share__canvas" data-format={format} role="img" aria-label={t.share.alt} width={SIZE[format].w} height={SIZE[format].h} />
      <div className="inv-actions">
        <button type="button" className="inv-btn inv-btn--solid" onClick={share} disabled={demo}>
          <Icon name="share" /> {t.share.share}
        </button>
        <button type="button" className="inv-btn" onClick={save} disabled={demo}>
          <Icon name="download" /> {t.share.save}
        </button>
        <button type="button" className="inv-btn" onClick={copy} disabled={demo}>
          <Icon name="copy" /> {t.share.copy}
        </button>
      </div>
      <p className="inv-hint" role="status">
        {note}
      </p>
    </section>
  );
}
