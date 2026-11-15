import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SECRET_KEY: z.string().min(10),
  APP_ORIGIN: z.url(),
  GUEST_PEPPER: z.string().min(32),
  REVEAL_KEY_V1: z.string().min(40),
  REVEAL_KEY_VERSION: z.coerce.number().int().positive(),
  CRON_SECRET: z.string().min(16),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

// Read lazily so a missing variable fails the request that needs it, with a clear name,
// instead of failing at import time during the build.
export function env(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Missing or invalid environment variables: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function appOrigin(): string {
  return new URL(env().APP_ORIGIN).origin;
}
