import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

export type Answer = ("boy" | "girl")[];

// Fixed-length plaintext, so the ciphertext says nothing about the answer or
// how many babies there are (security R1).
const PLAINTEXT_BYTES = 256;

function key(version: number): Buffer {
  const e = env();
  if (version !== e.REVEAL_KEY_VERSION) throw new Error(`reveal key version ${version} is not available`);
  const k = Buffer.from(e.REVEAL_KEY_V1, "base64");
  if (k.length !== 32) throw new Error("REVEAL_KEY_V1 must be 32 bytes, base64-encoded");
  return k;
}

function aad(revealId: string, eventId: string, version: number): Buffer {
  return Buffer.from(`${revealId}|${eventId}|${version}`);
}

export function sealAnswer(answer: Answer, revealId: string, eventId: string) {
  const version = env().REVEAL_KEY_VERSION;
  const body = Buffer.from(JSON.stringify(answer));
  if (body.length > PLAINTEXT_BYTES) throw new Error("answer too long");
  const padded = Buffer.alloc(PLAINTEXT_BYTES, 0x20);
  body.copy(padded);

  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(version), nonce);
  cipher.setAAD(aad(revealId, eventId, version));
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext, nonce, keyVersion: version };
}

export function openAnswer(ciphertext: Buffer, nonce: Buffer, version: number, revealId: string, eventId: string): Answer {
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key(version), nonce);
  decipher.setAAD(aad(revealId, eventId, version));
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8").trimEnd();
  return JSON.parse(plain) as Answer;
}
