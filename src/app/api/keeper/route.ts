import { cookies } from "next/headers";
import { z } from "zod";
import { keeperSeal, keeperStatus } from "@/lib/reveal/service";
import { isSameOriginJsonPost } from "@/lib/security/origin";
import { limits, withinLimit } from "@/lib/security/rate-limit";
import { newSessionToken, sha256 } from "@/lib/security/tokens";

const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const DEVICE_COOKIE = "__Host-keeper";

const schema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/),
  // Omitted = only ask for the status. The stored value is never returned.
  answer: z.array(z.enum(["boy", "girl"])).min(1).max(3).optional(),
});

// The secret keeper's endpoint. Write-only, bound to the first device that seals,
// locked once the countdown starts (security rule 29).
export async function POST(request: Request) {
  if (!isSameOriginJsonPost(request)) return Response.json({ error: "bad_origin" }, { status: 403, headers: HEADERS });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400, headers: HEADERS });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ state: "not_found" }, { status: 404, headers: HEADERS });

  const codeKey = sha256(parsed.data.code).toString("hex").slice(0, 24);
  if (!(await withinLimit(`keeper:${codeKey}`, limits.keeperPerCode))) {
    return Response.json({ error: "slow_down" }, { status: 429, headers: HEADERS });
  }

  const store = await cookies();
  let device = store.get(DEVICE_COOKIE)?.value ?? null;

  if (!parsed.data.answer) {
    const status = await keeperStatus(parsed.data.code, device);
    return Response.json(status, { status: status.state === "not_found" ? 404 : 200, headers: HEADERS });
  }

  if (!device) {
    device = newSessionToken();
    store.set(DEVICE_COOKIE, device, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 120 });
  }
  const state = await keeperSeal(parsed.data.code, device, parsed.data.answer);
  return Response.json({ state }, { status: state === "not_found" ? 404 : 200, headers: HEADERS });
}
