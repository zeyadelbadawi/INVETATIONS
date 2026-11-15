import { notFound } from "next/navigation";
import { lang as rootLang } from "next/root-params";
import { Suspense } from "react";
import { Notice } from "@/components/ui/card";
import { parseContent, themeSchema } from "@/content/schema";
import { isLocale } from "@/i18n/config";
import { getTemplate } from "@/templates/registry";
import { PageSkeleton } from "@/features/host/components/app-header";
import { Editor } from "@/features/host/components/editor";
import { allowedBlocks } from "@/features/host/lib/blocks";
import { eventForPage } from "@/features/host/lib/page";
import { hostMessages } from "@/features/host/messages";

type Props = PageProps<"/[lang]/app/events/[id]/edit">;

async function EditorLoader({ params }: Pick<Props, "params">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  const t = hostMessages(lang);
  const { event } = await eventForPage(lang, id, "edit_content", "edit");
  const template = getTemplate(event.template_id, event.template_version);
  if (!template) return <Notice tone="danger">{t.errors.invalid_content}</Notice>;
  return (
    <Editor
      // A fresh editor per event, so state never carries over between events.
      key={event.id}
      lang={lang}
      eventId={event.id}
      template={template}
      // The stored draft is schema-parsed on every read (security C1).
      initialContent={parseContent(event.content)}
      initialTheme={themeSchema.catch({}).parse(event.theme)}
      timezone={event.timezone}
      allowed={allowedBlocks(template)}
    />
  );
}

export default async function EditPage({ params }: Props) {
  const l = await rootLang();
  return (
    <Suspense fallback={<PageSkeleton label={hostMessages(isLocale(l) ? l : "ar").common.loading} />}>
      <EditorLoader params={params} />
    </Suspense>
  );
}
