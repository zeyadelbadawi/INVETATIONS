// Host sign-up and sign-in server actions (review F1 and F11). The auth server
// is replaced by a stub so the throttles themselves are what is tested; the
// limiter is the real one, in the local database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ip: "203.0.113.1",
  signUps: [] as string[],
  signIns: 0,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": state.ip }),
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  hostDb: async () => ({
    auth: {
      signInWithPassword: async ({ password }: { password: string }) => {
        state.signIns++;
        return { error: password === "the-right-password" ? null : { message: "Invalid login credentials" } };
      },
      signUp: async ({ email }: { email: string }) => {
        state.signUps.push(email);
        return { data: { session: null, user: null }, error: null };
      },
    },
  }),
}));

import "../db/helpers";
import { randomBytes } from "node:crypto";
import { signIn, signUp, type AuthState } from "@/features/host/actions/auth";
import { reservedEmail } from "@/features/host/lib/text";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  data.set("lang", "en");
  return data;
}

// The action's state, or "redirect" when it signed the user in.
async function outcome(action: Promise<AuthState>): Promise<AuthState | "redirect"> {
  try {
    return await action;
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") return "redirect";
    throw error;
  }
}

const login = (email: string, password: string) => outcome(signIn({}, form({ email, password })));

beforeEach(() => {
  state.signUps = [];
  state.signIns = 0;
  state.ip = `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
});

describe("sign-up", () => {
  it("refuses .invalid addresses (the holding-account domain) before reaching the auth server", async () => {
    for (const email of ["holding-1@no-reply.invalid", "HOLDING-7@No-Reply.INVALID", "x@sub.example.invalid"]) {
      expect(reservedEmail(email)).toBe(true);
      const result = await outcome(signUp({}, form({ email, password: "a-long-password" })));
      expect(result).toMatchObject({ error: "invalid" });
    }
    expect(state.signUps).toEqual([]);
    expect(await outcome(signUp({}, form({ email: "real.person@example.com", password: "a-long-password" })))).toMatchObject({ notice: "check_email" });
    expect(state.signUps).toEqual(["real.person@example.com"]);
    expect(reservedEmail("someone@invalid.example.com")).toBe(false);
  });
});

describe("sign-in throttle", () => {
  it("counts wrong passwords per account and address, so a stranger elsewhere cannot lock the owner out", async () => {
    const email = `owner-${randomBytes(4).toString("hex")}@example.test`;
    state.ip = "198.51.100.66";
    for (let i = 0; i < 10; i++) expect(await login(email, `wrong-guess-${i}`)).toMatchObject({ error: "credentials" });
    expect(await login(email, "wrong-guess-x")).toMatchObject({ error: "too_many" });
    // The attacker's address is held off even with the right password...
    expect(await login(email, "the-right-password")).toMatchObject({ error: "too_many" });
    // ...but the owner, from their own address, signs in.
    state.ip = "192.0.2.10";
    expect(await login(email, "the-right-password")).toBe("redirect");
  });

  it("does not count successful sign-ins", async () => {
    const email = `busy-${randomBytes(4).toString("hex")}@example.test`;
    for (let i = 0; i < 15; i++) expect(await login(email, "the-right-password")).toBe("redirect");
    expect(await login(email, "a-typo-in-it")).toMatchObject({ error: "credentials" });
  });

  it("holds a parallel burst of guesses to the limit", async () => {
    const email = `burst-${randomBytes(4).toString("hex")}@example.test`;
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => login(email, `wrong-guess-${i}`)));
    expect(results.filter((r) => r !== "redirect" && r.error === "credentials").length).toBeLessThanOrEqual(10);
    expect(state.signIns).toBeLessThanOrEqual(10);
  });
});
