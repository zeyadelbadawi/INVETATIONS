import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { newNonce, STRICT_CSP_PATH, strictCsp } from "@/lib/security/csp";

// Guest-facing and technical paths carry their own locale handling or none.
const UNLOCALISED = /^\/(i|l|k|preview|api)(\/|$)/;

function preferredLocale(request: NextRequest): Locale {
  const header = request.headers.get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase().split("-")[0] ?? "";
    if (isLocale(tag)) return tag;
  }
  return defaultLocale;
}

// Pages under the strict policy (dashboard, back office, link pages) get a
// fresh nonce per request. Next.js reads it from the request's policy header
// and adds it to the scripts it renders; the browser enforces the response's.
async function withCsp(request: NextRequest): Promise<{ next: () => NextResponse; csp: string | null }> {
  const csp = STRICT_CSP_PATH.test(request.nextUrl.pathname) ? await strictCsp(newNonce()) : null;
  const next = () => {
    if (!csp) return NextResponse.next({ request });
    const headers = new Headers(request.headers);
    headers.set("content-security-policy", csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };
  return { next, csp };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { next } = await withCsp(request);
  if (UNLOCALISED.test(pathname)) return next();

  const first = pathname.split("/")[1] ?? "";
  if (!isLocale(first)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  // Signed-in areas: keep the host session cookie fresh. This is an optimistic
  // check only; every server action and data function authorises again.
  const section = pathname.split("/")[2] ?? "";
  if (section !== "app" && section !== "admin") return next();

  let response = next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = next();
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    const url = request.nextUrl.clone();
    url.pathname = `/${first}/login`;
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|media/|.*\\.(?:png|jpg|jpeg|webp|avif|svg|mp4|ico|json)$).*)"],
};
