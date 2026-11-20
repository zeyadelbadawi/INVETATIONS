// The invitation itself. Isomorphic and free of data access: the live page
// renders it on the server from the cached public event, the editor preview
// renders it in the browser from a draft. Everything personal is filled in by
// client components after /api/guest/[slug]/me.
import type { CSSProperties } from "react";
import { pick, type Block } from "@/content/schema";
import { brand } from "@/config/brand";
import { dirOf, otherLocale, type Locale } from "@/i18n/config";
// Imported file by file: the scenes barrel pulls in client-only hooks, and this module also renders on the server.
import { MotionProvider } from "@/scenes/MotionProvider";
import { prefetchScript, splashBootScript, splashCss, sceneNoScriptCss } from "@/scenes/boot-script";
import { buildPageSceneData, serializePageSceneData, SCENE_DATA_ID } from "@/scenes/page-data";
import type { Palette, Template } from "@/templates/types";
import { getMessages } from "./messages";
import { inviteFontClass } from "./fonts";
import { reportHref } from "./config";
import { dateLine, initials, luminance } from "./lib/format";
import { eventStart, hasBothLanguages } from "./lib/content";
import { BlockView, type BlockContext } from "./blocks/Blocks";
import { InviteProvider } from "./guest/GuestContext";
import { LiveProvider } from "./guest/Live";
import { GatedBody, GuestGreeting, GuestSlot } from "./guest/GuestSlots";
import { Rsvp } from "./guest/Rsvp";
import { Play } from "./guest/Play";
import { RevealStage } from "./reveal/RevealStage";
import { Extras, type DemoExtras } from "./Extras";
import { DetailsCta } from "./opening/DetailsCta";
import { OpeningScene, PlainOpening, type OverlayItem } from "./opening/OpeningScene";
import type { LoadedScene } from "./server/scenes";
import type { Answer, GuestMe, InviteEvent, LivePayload, RevealStyle } from "./types";
import "./invite.css";

export type InvitationDemo = { me: GuestMe; live?: LivePayload; extras?: DemoExtras; answer?: Answer; interactiveReveal?: boolean };

export type InvitationProps = {
  event: InviteEvent;
  template: Template;
  palette: Palette;
  locale: Locale;
  // The opening scene, or null to open without footage.
  scene: LoadedScene | null;
  revealStyle?: RevealStyle;
  // Editor preview only: sample guest data, guest-only blocks shown in place, nothing sent.
  demo?: InvitationDemo;
};

const HEX = /^#[0-9a-f]{6}$/i;

function themeVars(palette: Palette): CSSProperties {
  const { ink, paper, accent, accentSoft, onAccent } = palette.tokens;
  const safe = (value: string, fallback: string) => (HEX.test(value) ? value : fallback);
  const inkHex = safe(ink, "#1d1a16");
  const paperHex = safe(paper, "#f6efe4");
  const paperIsLight = luminance(paperHex) >= luminance(inkHex);
  return {
    "--ink": inkHex,
    "--paper": paperHex,
    "--accent": safe(accent, "#b5552d"),
    "--accent-soft": safe(accentSoft, "#ecd9c6"),
    "--on-accent": safe(onAccent, "#ffffff"),
    // Text on footage is always the light one of the pair, over a wash of the dark one.
    "--scene-fg": paperIsLight ? paperHex : inkHex,
    "--scene-shade": paperIsLight ? inkHex : paperHex,
  } as CSSProperties;
}

export function Invitation({ event, template, palette, locale, scene, revealStyle, demo }: InvitationProps) {
  const t = getMessages(locale);
  const dir = dirOf(locale);
  const preview = demo !== undefined;
  const titleFields = template.overlays.filter((slot) => slot.role === "title").map((slot) => slot.field);
  const sceneRef = template.scenes[0];
  const paper = HEX.test(palette.tokens.paper) ? palette.tokens.paper : "#f6efe4";
  const dark = luminance(paper) < 0.2;

  // An empty date line on the hold is filled from the event's start, so the
  // opening always says when (public data: the start is in the shell anyway).
  const startsAt = eventStart(event);
  const fallbackDate = startsAt ? dateLine(startsAt, event.timezone, locale) : "";
  const overlays: OverlayItem[] = template.overlays
    .filter((slot) => !sceneRef || slot.scene === sceneRef.id)
    .map((slot) => {
      const text = pick(event.fields[slot.field], locale).trim() || (slot.role === "subtitle" ? fallbackDate : "");
      return { key: slot.field, role: slot.role, appear: slot.appear, position: slot.position, align: slot.align, wash: slot.wash, text };
    })
    .filter((item) => item.text !== "");
  // The words of the first screen, before the scene moves: the opening line and who it is from.
  const intro = {
    eyebrow: overlays.find((item) => item.role === "eyebrow")?.text || t.hero.invited,
    title: overlays
      .filter((item) => item.role === "title")
      .map((item) => item.text)
      .join(locale === "ar" ? " و" : " & "),
  };
  const monogram = initials(template.splash.from.map((key) => pick(event.fields[key], locale)));

  const publicById = new Map(event.blocks.map((block) => [block.id, block]));
  const guestById = new Map((demo?.me.guestBlocks ?? []).map((block) => [block.id, block]));
  const ctx: BlockContext = { event, locale, titleFields, extraBlocks: demo?.me.guestBlocks, media: demo?.me.media };
  const firstGuestSlot = event.order.find((id) => !publicById.has(id));

  const reveal = event.kind === "gender_reveal" && event.entitlements.reveal && template.reveal;
  const style = revealStyle && template.reveal?.styles.includes(revealStyle) ? revealStyle : (template.reveal?.styles[0] ?? "balloon");
  const closed = event.status === "postponed" || event.status === "cancelled";
  const bilingual = hasBothLanguages(event);
  const other = otherLocale(locale);

  const top = (
    <>
      {bilingual && !preview ? (
        <a className="inv-lang" href={`/i/${event.slug}/${other}`} lang={other} hrefLang={other} aria-label={t.hero.otherLanguageLabel}>
          {t.hero.otherLanguage}
        </a>
      ) : null}
      <GuestGreeting />
    </>
  );

  return (
    <div className={`inv ${inviteFontClass}`} lang={locale} dir={dir} style={themeVars(palette)} data-palette={palette.id} data-kind={event.kind} data-scheme={dark ? "dark" : "light"}>
      {/* Constants and registry colours only: nothing a host typed reaches these tags (security C1). */}
      {preview ? null : <style>{`html,body{background:${paper}}html{--splash-bg:${paper}}${scene ? splashCss() : ""}`}</style>}
      {scene && !preview && sceneRef ? (
        <>
          <script id={SCENE_DATA_ID} type="application/json" dangerouslySetInnerHTML={{ __html: serializePageSceneData(buildPageSceneData([{ source: scene.source, manifest: scene.manifest, gate: sceneRef.gate }])) }} />
          <script dangerouslySetInnerHTML={{ __html: splashBootScript() }} />
          <script dangerouslySetInnerHTML={{ __html: prefetchScript() }} />
          <noscript>
            <style>{sceneNoScriptCss()}</style>
          </noscript>
        </>
      ) : null}

      <InviteProvider event={event} locale={locale} titleFields={titleFields} teamPresets={template.teams} teamJoin={template.teamJoin} revealStyle={style} demoMe={demo?.me}>
        <LiveProvider demoLive={demo?.live}>
          <MotionProvider>
            <header className="inv-head">
              {scene && sceneRef ? (
                <OpeningScene source={scene.source} manifest={scene.manifest} scene={sceneRef} overlays={overlays} intro={intro} monogram={monogram} labels={{ alt: t.hero.sceneAlt, splash: t.hero.splash, continue: t.hero.continue }} splash={!preview}>
                  {top}
                </OpeningScene>
              ) : (
                <PlainOpening overlays={overlays}>{top}</PlainOpening>
              )}
              <DetailsCta label={t.hero.cta} publicLabel={t.hero.ctaPublic} />
            </header>

            <main id="details" className="inv-body" tabIndex={-1}>
              {closed ? (
                <aside className="inv-notice" role="status" data-status={event.status}>
                  <h2 className="inv-h3">{event.status === "postponed" ? t.status.postponedTitle : t.status.cancelledTitle}</h2>
                  <p className="inv-text">{event.status === "postponed" ? t.status.postponedBody : t.status.cancelledBody}</p>
                </aside>
              ) : null}

              {reveal ? <RevealStage demoAnswer={demo?.answer} demoInteractive={demo?.interactiveReveal} /> : null}
              {reveal ? <Play /> : null}

              {event.order.map((id) => {
                const block: Block | undefined = publicById.get(id) ?? guestById.get(id);
                if (block) return <BlockView key={id} block={block} ctx={ctx} />;
                return preview ? null : <GuestSlot key={id} id={id} first={id === firstGuestSlot} />;
              })}
              {firstGuestSlot === undefined && !preview ? event.hasPasscode ? <GatedBody /> : <GuestSlot id="" first /> : null}

              <Rsvp />
              {reveal ? null : <Play />}
              <Extras demoExtras={demo?.extras} />
            </main>

            <footer className="inv-foot">
              <p>
                {t.footer.madeWith}{" "}
                <a className="inv-link" href={`/${locale}`}>
                  {brand.name[locale]}
                </a>
              </p>
              <a className="inv-foot__report" href={reportHref(event.slug, locale, t.footer.reportSubject(event.slug))}>
                {t.footer.report}
              </a>
            </footer>
          </MotionProvider>
        </LiveProvider>
      </InviteProvider>
    </div>
  );
}
