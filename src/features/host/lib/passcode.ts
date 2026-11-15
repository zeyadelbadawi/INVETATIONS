import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Event passcodes (security rule 38): at least 6 characters, stored as a slow
// salted hash. Format: scrypt$N$r$p$saltB64$hashB64
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
export const PASSCODE_MIN_LENGTH = 6;
export const PASSCODE_MAX_LENGTH = 64;

function derive(passcode: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passcode.normalize("NFKC"), salt, length, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPasscode(passcode: string): Promise<string> {
  if (passcode.length < PASSCODE_MIN_LENGTH || passcode.length > PASSCODE_MAX_LENGTH) {
    throw new Error("passcode length out of range");
  }
  const salt = randomBytes(16);
  const key = await derive(passcode, salt, N, R, P, KEY_LENGTH);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Constant-time comparison. Returns false for any malformed or foreign hash.
export async function verifyPasscode(passcode: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || typeof passcode !== "string" || passcode.length > PASSCODE_MAX_LENGTH) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  // Refuse parameters this module would never have written, so a forged row
  // cannot make verification arbitrarily expensive.
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n < 1024 || n > 1 << 17 || r < 1 || r > 16 || p < 1 || p > 4) return false;
  try {
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    if (salt.length < 8 || expected.length < 16 || expected.length > 64) return false;
    const actual = await derive(passcode, salt, n, r, p, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
