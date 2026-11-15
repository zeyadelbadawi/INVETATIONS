import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { AuthPage } from "@/features/host/components/auth-page";
import { hostMessages } from "@/features/host/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/login">): Promise<Metadata> {
  const { lang } = await params;
  return { title: hostMessages(isLocale(lang) ? lang : "ar").auth.loginTitle, robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <AuthPage mode="login" lang={lang} searchParams={searchParams} />;
}
