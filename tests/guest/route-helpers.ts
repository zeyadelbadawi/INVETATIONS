// Helpers for calling guest route handlers in-process. Each test file mocks
// next/headers with `cookieJar` and getPublicEvent with `publicEvents` (vi.mock
// calls must live in the test file itself, so only the state is shared here).
import { randomBytes } from "node:crypto";
import { admin, hash } from "../db/helpers";
import type { PublicEvent } from "@/lib/events/published";

export type JarEntry = { value: string; options?: Record<string, unknown> };

export function makeCookieStore(jar: Map<string, JarEntry>) {
  return {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    getAll: () => [...jar.entries()].map(([name, entry]) => ({ name, value: entry.value })),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      jar.set(name, { value, options });
    },
    delete: (name: string) => jar.delete(name),
  };
}

export const origin = () => new URL(process.env.APP_ORIGIN!).origin;

export function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) } as never;
}

export function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${origin()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: origin(),
      // A fresh address per request keeps the per-IP ceiling out of the way.
      "x-forwarded-for": `10.${randomBytes(3).join(".")}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

export function get(path: string): Request {
  return new Request(`${origin()}${path}`);
}

// A real guest session row; returns the cookie token the session route would set.
export async function sessionToken(event: Pick<PublicEvent, "id">, kind: "personal" | "group" = "group") {
  const { data: invitation } = await admin
    .from("invitations")
    .insert({ event_id: event.id, kind, label: `Party ${randomBytes(3).toString("hex")}`, pax_cap: 2, max_players: 5, code_hash: hash(randomBytes(16).toString("hex")) })
    .select("id")
    .single();
  const token = randomBytes(32).toString("base64url");
  const { data: session } = await admin
    .from("guest_sessions")
    .insert({ token_hash: hash(token), event_id: event.id, invitation_id: invitation!.id, expires_at: new Date(Date.now() + 86400000).toISOString() })
    .select("id")
    .single();
  return { token, invitationId: invitation!.id, sessionId: session!.id };
}
