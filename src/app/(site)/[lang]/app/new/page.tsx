import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { listTemplates } from "@/templates/registry";
import { CreateEvent, type TemplateChoice } from "@/features/host/components/create-event";
import { hostMessages } from "@/features/host/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/new">): Promise<Metadata> {
  const { lang } = await params;
  return { title: hostMessages(isLocale(lang) ? lang : "ar").create.title };
}

// Static page: the template list is code, and the create action checks the
// session itself.
export default async function NewEventPage({ params }: PageProps<"/[lang]/app/new">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = hostMessages(lang);
  const templates: TemplateChoice[] = listTemplates().map((template) => ({
    id: template.id,
    kind: template.kind,
    name: template.name[lang],
    description: template.description[lang],
    swatch: {
      paper: template.palettes[0].tokens.paper,
      ink: template.palettes[0].tokens.ink,
      accent: template.palettes[0].tokens.accent,
    },
  }));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/${lang}/app` as Route} className="inline-flex min-h-11 items-center text-sm font-medium text-secondary">
          {t.nav.allEvents}
        </Link>
        <h1 className="text-2xl font-semibold">{t.create.title}</h1>
      </div>
      <CreateEvent lang={lang} templates={templates} />
    </div>
  );
}
