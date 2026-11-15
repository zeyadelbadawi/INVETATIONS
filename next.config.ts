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
// (recorded exception, security rule 17); no third-party script host is.
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
        source: "/((?!preview/).*)",
        headers: [
          ...baseHeaders,
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: csp("'none'") },
        ],
      },
      {
        source: "/preview/:path*",
        headers: [...baseHeaders, ...guestHeaders, { key: "Content-Security-Policy", value: csp("'self'") }],
      },
      { source: "/i/:path*", headers: guestHeaders },
      { source: "/l/:path*", headers: [...guestHeaders, { key: "Cache-Control", value: "private, no-store" }] },
      { source: "/k", headers: [...guestHeaders, { key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
