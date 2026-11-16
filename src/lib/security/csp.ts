// Strict, nonce-based Content Security Policy for the dashboard, the back office
// and the link pages (security rule 17, review F10). Set per request by
// src/proxy.ts on the request (Next.js reads the nonce from it and puts it on
// every script it renders) and on the response. The cached invitation shell and
// the marketing pages keep the static policy from next.config.ts.
import { LANG_SCRIPT } from "@/app/(invite)/lang-script";

const LOCALES = "(?:ar|en)";

// /[lang]/app/**, /[lang]/admin/**, /l/**, /k
export const STRICT_CSP_PATH = new RegExp(`^/(?:${LOCALES}/(?:app|admin)(?:/|$)|l(?:/|$)|k/?$)`);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Hosts that serve data and media (signed upload and read URLs).
function remoteHosts(): string {
  return [originOf(process.env.NEXT_PUBLIC_SUPABASE_URL), originOf(process.env.NEXT_PUBLIC_MEDIA_URL)]
    .filter((h): h is string => h !== null)
    .join(" ");
}

let langScriptHash: Promise<string> | null = null;
function langHash(): Promise<string> {
  langScriptHash ??= crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(LANG_SCRIPT))
    .then((digest) => `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`);
  return langScriptHash;
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export async function strictCsp(nonce: string, isDev = process.env.NODE_ENV === "development"): Promise<string> {
  const remote = remoteHosts();
  return [
    "default-src 'self'",
    // Only scripts carrying this response's nonce (and what they load), plus
    // the guest layout's constant language script by hash. No 'unsafe-inline'.
    `script-src 'nonce-${nonce}' 'strict-dynamic' ${await langHash()}${isDev ? " 'unsafe-eval'" : ""}`,
    // Style attributes from the server render need this; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${remote}`.trim(),
    `media-src 'self' blob: ${remote}`.trim(),
    `connect-src 'self' ${remote}${isDev ? " ws:" : ""}`.trim(),
    "font-src 'self'",
    "worker-src 'self' blob:",
    // The editor's live preview is an iframe of /preview on this origin.
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
