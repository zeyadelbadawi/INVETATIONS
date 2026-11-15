import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { appOrigin } from "@/lib/env";
import { hostDb } from "@/lib/supabase/server";
import { safeNext } from "@/features/host/lib/redirect";

// Return leg of Google sign-in (PKCE): swaps the one-time code for a session.
export async function GET(request: NextRequest, ctx: RouteContext<"/[lang]/auth/callback">) {
  const { lang: raw } = await ctx.params;
  const lang = isLocale(raw) ? raw : "ar";
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

  if (code && code.length <= 512) {
    const db = await hostDb();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext(params.get("next"), lang), appOrigin()), { headers });
    }
  }
  return NextResponse.redirect(new URL(`/${lang}/login?error=oauth`, appOrigin()), { headers });
}
