// Identifies a file from its first bytes. The type a client claims is never
// trusted (security C2). Only the formats below are accepted anywhere.
export type Sniffed =
  | { kind: "image"; mime: "image/jpeg" | "image/png" | "image/webp" }
  | { kind: "audio"; mime: "audio/webm" | "audio/mp4" | "audio/ogg" }
  | null;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function sniff(bytes: Uint8Array): Sniffed {
  if (bytes.length < 16) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return { kind: "image", mime: "image/png" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return { kind: "image", mime: "image/webp" };
  // Matroska/WebM (EBML header). Voice notes from Chrome and Firefox.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { kind: "audio", mime: "audio/webm" };
  if (ascii(bytes, 0, 4) === "OggS") return { kind: "audio", mime: "audio/ogg" };
  // ISO base media (Safari records AAC in MP4). Accept only audio-ish brands.
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["M4A ", "mp42", "isom", "iso5", "mp41", "dash"].includes(brand)) return { kind: "audio", mime: "audio/mp4" };
  }
  return null;
}
