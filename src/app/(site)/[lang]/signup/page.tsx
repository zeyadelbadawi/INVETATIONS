import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { AuthPage } from "@/features/host/components/auth-page";
import { hostMessages } from "@/features/host/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/signup">): Promise<Metadata> {
  const { lang } = await params;
  return { title: hostMessages(isLocale(lang) ? lang : "ar").auth.signupTitle, robots: { index: false } };
}

export default async function SignupPage({ params, searchParams }: PageProps<"/[lang]/signup">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <AuthPage mode="signup" lang={lang} searchParams={searchParams} />;
}
