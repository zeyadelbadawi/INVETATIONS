"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale, type Locale } from "@/i18n/config";
import { appOrigin } from "@/lib/env";
import { hostDb } from "@/lib/supabase/server";
import { sha256 } from "@/lib/security/tokens";
import { refundLimit, withinLimit, type Limit } from "@/lib/security/rate-limit";
import { safeNext } from "../lib/redirect";
import { reservedEmail } from "../lib/text";

export type AuthState = {
  error?: "invalid" | "credentials" | "weak_password" | "too_many" | "unknown";
  // Problems with what was typed, all at once, shown under each field.
  fields?: { email?: "email_missing" | "invalid"; password?: "password_missing" | "weak_password" };
  notice?: "check_email" | "reset_sent" | "password_saved";
  email?: string;
};

const emailShape = z.email().max(254);

// What is wrong with each field, before anything reaches the auth server.
function fieldProblems(formData: FormData, mode: "login" | "signup"): AuthState["fields"] | null {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fields: NonNullable<AuthState["fields"]> = {};
  if (email === "") fields.email = "email_missing";
  else if (mode === "signup" && (!emailShape.safeParse(email).success || reservedEmail(email))) fields.email = "invalid";
  if (password === "") fields.password = "password_missing";
  else if (mode === "signup" && (password.length < 8 || password.length > 72)) fields.password = "weak_password";
  return fields.email || fields.password ? fields : null;
}

const credentials = z.object({
  email: z.email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(72),
});

function localeOf(formData: FormData): Locale {
  const lang = String(formData.get("lang") ?? "");
  return isLocale(lang) ? lang : "ar";
}

const SIGN_IN_FAILURES: Limit = { windowSeconds: 600, max: 10 };
const SIGN_UP_ATTEMPTS: Limit = { windowSeconds: 600, max: 10 };

const hashed = (value: string) => sha256(value).toString("hex").slice(0, 32);

async function requestIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : "unknown";
}

// Sign-in throttle on top of the auth server's own limits: wrong passwords per
// account AND address, so a stranger guessing at someone's account from
// elsewhere cannot lock its owner out, and a successful sign-in gives its slot
// back. Keyed by hashes so no email address or IP is stored in the limiter table.
async function signInKey(email: string): Promise<string> {
  return `host_login:${hashed(email)}:${hashed(await requestIp())}`;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const lang = localeOf(formData);
  const next = safeNext(formData.get("next"), lang);
  // Only empty fields are reported per field; anything else gets the one
  // answer below, which says nothing about whether an account exists.
  const empty = fieldProblems(formData, "login");
  if (empty) return { fields: empty, email: String(formData.get("email") ?? "").slice(0, 254) };
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  // The same answer for a malformed address, an unknown one, an unconfirmed
  // one and a wrong password: nothing here says whether an account exists.
  if (!parsed.success) return { error: "credentials", email: String(formData.get("email") ?? "").slice(0, 254) };
  // The slot is taken before the password is checked, so parallel guesses
  // cannot all slip under the limit; a correct password gives it back.
  const key = await signInKey(parsed.data.email);
  if (!(await withinLimit(key, SIGN_IN_FAILURES))) return { error: "too_many", email: parsed.data.email };

  const db = await hostDb();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error) return { error: "credentials", email: parsed.data.email };
  await refundLimit(key, SIGN_IN_FAILURES);
  redirect(next as Route);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const lang = localeOf(formData);
  const next = safeNext(formData.get("next"), lang);
  const email = String(formData.get("email") ?? "").slice(0, 254);
  const problems = fieldProblems(formData, "signup");
  if (problems) return { error: problems.email ? "invalid" : "weak_password", fields: problems, email };
  const parsed = credentials.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) {
    const weak = parsed.error.issues.some((issue) => issue.path[0] === "password");
    return { error: weak ? "weak_password" : "invalid", email };
  }
  if (reservedEmail(parsed.data.email)) return { error: "invalid", email };
  if (!(await withinLimit(`host_signup:${hashed(parsed.data.email)}`, SIGN_UP_ATTEMPTS))) return { error: "too_many", email: parsed.data.email };

  const db = await hostDb();
  const confirmUrl = new URL(`/${lang}/auth/confirm`, appOrigin());
  confirmUrl.searchParams.set("next", next);
  const { data, error } = await db.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: confirmUrl.toString() },
  });
  if (error?.code === "weak_password") return { error: "weak_password", email: parsed.data.email };
  // With confirmations off a new account is signed in straight away.
  if (!error && data.session) redirect(next as Route);
  // Otherwise — confirmation pending, or the address is already registered —
  // the answer is the same, so the form cannot be used to test for accounts.
  return { notice: "check_email", email: parsed.data.email };
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const lang = localeOf(formData);
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH !== "1") redirect(`/${lang}/login` as Route);
  const callback = new URL(`/${lang}/auth/callback`, appOrigin());
  callback.searchParams.set("next", safeNext(formData.get("next"), lang));
  const db = await hostDb();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) redirect(`/${lang}/login?error=oauth` as Route);
  // The auth server's own consent URL; the only off-site redirect in the app.
  redirect(data.url as Route);
}

export async function signOut(formData: FormData): Promise<void> {
  const lang = localeOf(formData);
  const db = await hostDb();
  await db.auth.signOut();
  redirect(`/${lang}/login` as Route);
}

const RESET_ATTEMPTS: Limit = { windowSeconds: 3600, max: 5 };

// "Forgot password": the auth server emails a one-time recovery link that
// lands on /auth/confirm, which signs the person in and sends them to the
// new-password page. The answer is the same whether or not the address has
// an account.
export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const lang = localeOf(formData);
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  if (email === "") return { fields: { email: "email_missing" }, email };
  const parsed = emailShape.safeParse(email);
  if (!parsed.success || reservedEmail(email)) return { fields: { email: "invalid" }, email };
  const address = parsed.data.toLowerCase();
  if (!(await withinLimit(`host_reset:${hashed(address)}`, RESET_ATTEMPTS))) return { error: "too_many", email };
  if (!(await withinLimit(`host_reset_ip:${hashed(await requestIp())}`, { windowSeconds: 3600, max: 20 }))) return { error: "too_many", email };

  const db = await hostDb();
  const confirmUrl = new URL(`/${lang}/auth/confirm`, appOrigin());
  confirmUrl.searchParams.set("next", `/${lang}/app/password`);
  // Errors (unknown address, mail limits) are not shown: the reply must not reveal accounts.
  await db.auth.resetPasswordForEmail(address, { redirectTo: confirmUrl.toString() });
  return { notice: "reset_sent", email: address };
}

// Sets a new password for the signed-in person (after the recovery link, or any time).
export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password === "") return { fields: { password: "password_missing" } };
  if (password.length < 8 || password.length > 72) return { fields: { password: "weak_password" } };
  const db = await hostDb();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return { error: "unknown" };
  const { error } = await db.auth.updateUser({ password });
  if (error?.code === "weak_password") return { fields: { password: "weak_password" } };
  if (error) return { error: "unknown" };
  return { notice: "password_saved" };
}
