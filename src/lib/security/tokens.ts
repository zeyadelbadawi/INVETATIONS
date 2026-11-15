import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// 128-bit link codes and 256-bit session tokens. Only hashes are stored.
export function newLinkCode(): string {
  return randomBytes(16).toString("base64url");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// bytea literal for PostgREST.
export function bytea(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}

export function hashForDb(value: string): string {
  return bytea(sha256(value));
}

export function hmac(scope: string, value: string): Buffer {
  return createHmac("sha256", env().GUEST_PEPPER).update(`${scope}\n${value}`).digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function safeEqualStrings(a: string, b: string): boolean {
  return safeEqual(sha256(a), sha256(b));
}

export function newRejoinCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

// Six random characters appended to every slug so links cannot be guessed (security V1).
export function slugSuffix(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += SLUG_ALPHABET[randomInt(0, SLUG_ALPHABET.length)];
  return out;
}

export function parseBytea(value: string): Buffer {
  return Buffer.from(value.replace(/^\\x/, ""), "hex");
}
