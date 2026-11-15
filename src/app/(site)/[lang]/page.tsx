import { notFound } from "next/navigation";
import { brand } from "@/config/brand";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-5xl font-bold text-primary">{brand.name[lang]}</h1>
      <p className="text-lg text-muted">{brand.tagline[lang]}</p>
      <p className="text-sm text-muted">{t.home.soon}</p>
    </main>
  );
}
