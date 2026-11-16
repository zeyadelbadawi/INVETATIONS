import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Hosts that serve data, guest media and scene media.
const remote = [hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL), hostOf(process.env.NEXT_PUBLIC_MEDIA_URL)]
  .filter((h): h is string => h !== null)
  .join(" ");

// A nonce-based policy would force every page to render per request, which the
// cached invitation shell cannot afford. Inline scripts are therefore allowed
// here (recorded exception, security rule 17); no third-party script host is.
// The dashboard, back office and link pages render per request anyway and get
// a strict nonce policy from src/proxy.ts (src/lib/security/csp.ts) instead, so
// this one must not be sent for them: see STATIC_CSP_SOURCE.
function csp(frameAncestors: "'none'" | "'self'"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${remote}`,
    `media-src 'self' blob: ${remote}`,
    `connect-src 'self' ${remote}${isDev ? " ws:" : ""}`,
    "font-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "frame-src 'self'",
  ].join("; ");
}

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Every path except /preview, and except the pages whose policy comes from the
// proxy: /[lang]/app/**, /[lang]/admin/**, /l/**, /k.
const STATIC_CSP_SOURCE = "/((?!preview$|l$|l/|k$|k/$|(?:ar|en)/(?:app|admin)$|(?:ar|en)/(?:app|admin)/).*)";

// Personal guest API responses (security rule 4). Listed after the catch-all,
// which sets a different Referrer-Policy: for a header set in more than one
// matching entry the last one wins, and config headers replace the ones a
// route handler sets itself (review F10).
const privateApiHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "private, no-store" },
];

const guestHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/((?!preview$).*)",
        headers: [...baseHeaders, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
      { source: STATIC_CSP_SOURCE, headers: [{ key: "Content-Security-Policy", value: csp("'none'") }] },
      {
        source: "/preview",
        headers: [...baseHeaders, ...guestHeaders, { key: "Content-Security-Policy", value: csp("'self'") }],
      },
      { source: "/i/:path*", headers: guestHeaders },
      // The editor preview runs in a sandboxed iframe with an opaque origin; it can
      // only load fonts and draft scene files if they are readable cross-origin.
      // Both are public, static files.
      { source: "/_next/static/media/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] },
      { source: "/media/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] },
      { source: "/l/:path*", headers: [...guestHeaders, { key: "Cache-Control", value: "private, no-store" }] },
      { source: "/k", headers: [...guestHeaders, { key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/guest/:path*", headers: privateApiHeaders },
      { source: "/api/keeper", headers: privateApiHeaders },
    ];
  },
};

export default nextConfig;
