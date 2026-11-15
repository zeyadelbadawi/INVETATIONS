import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AccessError } from "@/lib/events/access";
import { HostError, type ActionResult } from "./errors";

// Turns the failures a server action can explain into a result the client can
// show, and never leaks anything else. Logs carry the error name only — no
// request bodies, cookies or link codes (security rule 40).
export async function run<T extends object>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof HostError) return { ok: false, error: error.code, detail: error.detail };
    if (error instanceof AccessError) return { ok: false, error: error.reason };
    console.error(`[host action] ${name} failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return { ok: false, error: "unknown" };
  }
}
