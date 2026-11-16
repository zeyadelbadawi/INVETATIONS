import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { appOrigin } from "@/lib/env";
import { hostDb } from "@/lib/supabase/server";
import { safeNext } from "@/features/host/lib/redirect";

const TYPES = ["signup", "email", "recovery", "invite", "magiclink", "email_change"] as const;
type OtpType = (typeof TYPES)[number];

// Target of the link in the confirmation email. The destination afterwards is
// taken from an allow-list of relative paths, never from the link as given.
export async function GET(request: NextRequest, ctx: RouteContext<"/[lang]/auth/confirm">) {
  const { lang: raw } = await ctx.params;
  const lang = isLocale(raw) ? raw : "ar";
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

  if (tokenHash && tokenHash.length <= 256 && (TYPES as readonly string[]).includes(type ?? "")) {
    const db = await hostDb();
    const { error } = await db.auth.verifyOtp({ type: type as OtpType, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(safeNext(params.get("next"), lang), appOrigin()), { headers });
    }
  }
  // Links built from the default email template arrive with a PKCE code instead.
  const code = params.get("code");
  if (code && code.length <= 256) {
    const db = await hostDb();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext(params.get("next"), lang), appOrigin()), { headers });
    }
  }
  return NextResponse.redirect(new URL(`/${lang}/login?error=link`, appOrigin()), { headers });
}
