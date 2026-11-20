import { notFound } from "next/navigation";
import { lang as rootLang } from "next/root-params";
import { Suspense } from "react";
import { settingsSchema } from "@/content/schema";
import { isLocale } from "@/i18n/config";
import { PageSkeleton } from "@/features/host/components/app-header";
import { SettingsForm } from "@/features/host/components/settings-form";
import { eventForPage } from "@/features/host/lib/page";
import { isoToZoned, TIMEZONES } from "@/features/host/lib/time";
import { hostMessages } from "@/features/host/messages";

type Props = PageProps<"/[lang]/app/events/[id]/settings">;

async function SettingsLoader({ params }: Pick<Props, "params">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  const { event } = await eventForPage(lang, id, "edit_content", "settings");
  const parsed = settingsSchema.safeParse(event.settings);
  const settings = parsed.success ? parsed.data : settingsSchema.parse({});
  const timezone = (TIMEZONES as readonly string[]).includes(event.timezone) ? event.timezone : "Africa/Cairo";
  return (
    <SettingsForm
      key={event.id}
      lang={lang}
      eventId={event.id}
      // Only whether a passcode exists reaches the browser, never the hash.
      hasPasscode={event.passcode_hash !== null}
      initial={{
        startsAt: isoToZoned(event.starts_at, timezone),
        endsAt: isoToZoned(event.ends_at, timezone),
        timezone,
        defaultLocale: event.default_locale === "en" ? "en" : "ar",
        rosterVisible: settings.rosterVisible,
        sharingEnabled: settings.sharingEnabled,
        openLinkApproval: settings.openLinkApproval,
        photosHostOnly: settings.photosHostOnly,
        wallEnabled: settings.wallEnabled,
        lockTeams: settings.lockTeams,
        rsvpDeadline: isoToZoned(settings.rsvpDeadline, timezone),
      }}
    />
  );
}

export default async function SettingsPage({ params }: Props) {
  const l = await rootLang();
  return (
    <Suspense fallback={<PageSkeleton label={hostMessages(isLocale(l) ? l : "ar").common.loading} />}>
      <SettingsLoader params={params} />
    </Suspense>
  );
}
