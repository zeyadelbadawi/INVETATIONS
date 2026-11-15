import "server-only";
import { appOrigin } from "@/lib/env";

// Every state-changing guest route requires a same-origin JSON POST (security rule 4).
export function isSameOriginJsonPost(request: Request): boolean {
  if (request.method !== "POST") return false;
  const origin = request.headers.get("origin");
  if (!origin || origin !== appOrigin()) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const type = request.headers.get("content-type") ?? "";
  return type.toLowerCase().startsWith("application/json");
}

// The platform sets x-forwarded-for; the first entry is the client. Used only
// before a guest session exists (security rule 35).
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : "unknown";
}
