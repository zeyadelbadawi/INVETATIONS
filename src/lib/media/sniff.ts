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

// --- Voice notes must be audio only (review F11) ------------------------------
// The first bytes say "MP4" or "WebM" but not whether the file carries a
// picture: an MP4 or WebM video would otherwise be served as a voice note.
// These walk just enough of the container to list its tracks. Anything that
// cannot be read is refused.

type TrackKinds = string[] | null;

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
}

// ISO base media: moov > trak > mdia > hdlr; the handler type is "soun" for
// audio and "vide" for video.
function* mp4Boxes(bytes: Uint8Array, start: number, end: number): Generator<{ type: string; body: number; end: number }> {
  let at = start;
  while (at + 8 <= end) {
    let size = u32(bytes, at);
    const type = ascii(bytes, at + 4, 4);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) return;
      const high = u32(bytes, at + 8);
      if (high !== 0) return; // over 4 GB: never a voice note
      size = u32(bytes, at + 12);
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) return;
    yield { type, body: at + header, end: at + size };
    at += size;
  }
}

export function mp4TrackKinds(bytes: Uint8Array): TrackKinds {
  const kinds: string[] = [];
  for (const top of mp4Boxes(bytes, 0, bytes.length)) {
    if (top.type !== "moov") continue;
    for (const trak of mp4Boxes(bytes, top.body, top.end)) {
      if (trak.type !== "trak") continue;
      let handler: string | null = null;
      for (const mdia of mp4Boxes(bytes, trak.body, trak.end)) {
        if (mdia.type !== "mdia") continue;
        for (const box of mp4Boxes(bytes, mdia.body, mdia.end)) {
          // version/flags (4), pre_defined (4), handler_type (4)
          if (box.type === "hdlr" && box.body + 12 <= box.end) handler = ascii(bytes, box.body + 8, 4);
        }
      }
      if (handler === null) return null;
      kinds.push(handler);
    }
  }
  return kinds;
}

// EBML (Matroska / WebM): Segment > Tracks > TrackEntry > TrackType, where
// 1 = video and 2 = audio.
const EBML = { segment: 0x18538067, tracks: 0x1654ae6b, trackEntry: 0xae, trackType: 0x83, cluster: 0x1f43b675 } as const;

function vint(bytes: Uint8Array, at: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null {
  const first = bytes[at];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23;
  if (length > 8 || at + length > bytes.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = (first & (0xff >> length)) === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[at + i];
    if (bytes[at + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

export function webmTrackKinds(bytes: Uint8Array): TrackKinds {
  const kinds: string[] = [];
  let sawTracks = false;
  const walk = (start: number, end: number, depth: number): boolean => {
    let at = start;
    while (at < end) {
      const id = vint(bytes, at, true);
      if (!id) return false;
      const size = vint(bytes, at + id.length, false);
      if (!size) return false;
      const body = at + id.length + size.length;
      const container = id.value === EBML.segment || id.value === EBML.tracks || id.value === EBML.trackEntry;
      if (size.unknown && id.value !== EBML.segment && id.value !== EBML.cluster) return false;
      const stop = size.unknown ? end : Math.min(body + size.value, end);
      if (id.value === EBML.cluster) return sawTracks; // tracks always come before media data
      if (id.value === EBML.tracks) sawTracks = true;
      if (container && depth < 4) {
        if (!walk(body, stop, depth + 1)) return false;
      } else if (id.value === EBML.trackType) {
        let type = 0;
        for (let i = body; i < stop; i++) type = type * 256 + bytes[i];
        kinds.push(type === 2 ? "soun" : type === 1 ? "vide" : `type${type}`);
      }
      if (size.unknown) return true;
      at = stop;
    }
    return true;
  };
  if (!walk(0, bytes.length, 0) || !sawTracks) return null;
  return kinds;
}

// True only for a container whose every track is audio, with at least one.
export function isAudioOnly(bytes: Uint8Array, mime: "audio/webm" | "audio/mp4" | "audio/ogg"): boolean {
  if (mime === "audio/ogg") return true;
  const kinds = mime === "audio/mp4" ? mp4TrackKinds(bytes) : webmTrackKinds(bytes);
  return kinds !== null && kinds.length > 0 && kinds.every((kind) => kind === "soun");
}
