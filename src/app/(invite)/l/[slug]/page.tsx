import { connection } from "next/server";
import { Suspense } from "react";
import { pick } from "@/content/schema";
import { getPublicEvent } from "@/lib/events/published";
import { getTemplate } from "@/templates/registry";
import { LinkEntry, LinkEntryLoading } from "@/features/invite/entry/LinkEntry";
import { eventTitle } from "@/features/invite/lib/content";
import type { Locale } from "@/i18n/config";

// Rendered per request, never from a prerendered shell: the strict
// Content-Security-Policy (src/proxy.ts) puts a fresh nonce on every script,
// which a shell built ahead of time cannot carry (security rule 17, review F10).
export const instant = false;

type Props = PageProps<"/l/[slug]">;

// The language the event is written in: the page talks to the guest in it
// (also when the link fails). Null when the event has both, or is unknown: then
// the phone's language decides.
function writtenIn(fields: Record<string, { ar: string; en: string }>): Locale | null {
  const values = Object.values(fields);
  const ar = values.some((value) => value.ar.trim() !== "");
  const en = values.some((value) => value.en.trim() !== "");
  return ar === en ? null : ar ? "ar" : "en";
}

// Public facts only (the cached public event, the same for every visitor): the
// code is in the URL fragment and never reaches the server here.
async function Entry({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  const template = event ? getTemplate(event.templateId, event.templateVersion) : null;
  const titleFields = template ? template.overlays.filter((slot) => slot.role === "title").map((slot) => slot.field) : [];
  const title = (locale: Locale) => (event ? eventTitle(event, titleFields, locale, locale === "ar" ? " و" : " & ") || pick(template?.name, locale) : "");
  return <LinkEntry eventLocale={event ? writtenIn(event.fields) : null} defaultLocale={event?.defaultLocale ?? null} title={{ ar: title("ar"), en: title("en") }} />;
}

// Link entry. The server sends the same page for every link of an event and
// does nothing else: the code is in the URL fragment and only the browser sees it.
export default async function LinkEntryPage({ params }: Props) {
  await connection();
  return (
    <Suspense fallback={<LinkEntryLoading />}>
      <Entry params={params} />
    </Suspense>
  );
}
