import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pick } from "@/content/schema";
import { isLocale, type Locale } from "@/i18n/config";
import { getPublicEvent, type PublicEvent } from "@/lib/events/published";
import { getPalette, getTemplate } from "@/templates/registry";
import { Invitation } from "@/features/invite/Invitation";
import { eventTitle } from "@/features/invite/lib/content";
import { loadScene } from "@/features/invite/server/scenes";
import type { InviteEvent } from "@/features/invite/types";

// The invitation: one cacheable shell per event, locale and published version,
// identical for every visitor. It reads no cookies or headers and contains only
// the public half of the content; everything personal is fetched in the browser
// from /api/guest/[slug]/me (technical design §3, security V1).

type Props = PageProps<"/i/[slug]/[locale]">;

// Only what the page needs crosses into the client payload: no ids, no plan.
function toInviteEvent(event: PublicEvent): InviteEvent {
  // A passcode-protected event shows its opening only until the passcode flow exists.
  const gated = event.hasPasscode;
  return {
    slug: event.slug,
    kind: event.kind,
    status: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    fields: event.fields,
    blocks: gated ? [] : event.blocks,
    order: gated ? [] : event.order,
    preview: event.preview,
    settings: { sharingEnabled: event.settings.sharingEnabled, rosterVisible: event.settings.rosterVisible, lockTeams: event.settings.lockTeams },
    entitlements: { games: event.entitlements.games, share_cards: event.entitlements.share_cards, reveal: event.entitlements.reveal, voice: event.entitlements.voice, photos: event.entitlements.photos },
  };
}

async function inviteMetadata(slug: string, locale: Locale): Promise<Metadata> {
  "use cache";
  const event = await getPublicEvent(slug);
  const template = event ? getTemplate(event.templateId, event.templateVersion) : null;
  if (!event || !template) return { title: "" };
  const titleFields = template.overlays.filter((slot) => slot.role === "title").map((slot) => slot.field);
  const title = eventTitle(event, titleFields, locale, locale === "ar" ? " و" : " & ") || pick(template.name, locale);
  const description = pick(event.preview?.description, locale) || pick(event.fields.eyebrow, locale) || pick(event.fields.date_line, locale) || undefined;
  return {
    title,
    description,
    robots: { index: false, follow: false, nocache: true },
    openGraph: { title, description, type: "website", locale: locale === "ar" ? "ar_EG" : "en_GB" },
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params;
  if (!isLocale(locale)) return {};
  return inviteMetadata(slug, locale);
}

async function InvitationPage({ slug, locale }: { slug: string; locale: string }) {
  if (!isLocale(locale)) notFound();
  const event = await getPublicEvent(slug);
  if (!event) notFound();
  const template = getTemplate(event.templateId, event.templateVersion);
  if (!template) notFound();
  const scene = template.scenes[0] ? await loadScene(template.scenes[0]) : null;
  return <Invitation event={toInviteEvent(event)} template={template} palette={getPalette(template, event.theme.palette)} locale={locale} scene={scene} />;
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<div className="min-h-lvh" />}>
      {params.then(({ slug, locale }) => (
        <InvitationPage slug={slug} locale={locale} />
      ))}
    </Suspense>
  );
}
