#!/usr/bin/env node
// Encodes one source shot into a scroll scene, following docs/playbooks/scroll-animation-playbook.md §4:
// desktop 16:9 + mobile 4:5 H.264 (GOP 6, no B-frames, faststart), posters, timing curve, WebCodecs decode index, manifest.
//
// Usage:
//   node tools/sequences/build-video.mjs --input shot.mp4 --id brand.scene --out public/media/drafts [--draft]
//        [--focal 0.5,0.5] [--ease-in 0.06] [--ease-out 0.12] [--no-motion]
//        [--desktop-crf 24] [--mobile-crf 26]   (raise for detailed footage to stay within the phone budget)

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.id) {
  console.error("Required: --input <file> --id <brand.scene>");
  process.exit(1);
}
if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(args.id)) {
  console.error("--id must look like brand.scene (lowercase)");
  process.exit(1);
}

const draft = Boolean(args.draft);
const [focalX, focalY] = (args.focal ?? "0.5,0.5").split(",").map(Number);
const outDir = join(args.out ?? "public/media/drafts", args.id);
mkdirSync(outDir, { recursive: true });

const VARIANTS = draft
  ? [
      { name: "desktop", width: 960, height: 540, crf: 32 },
      { name: "mobile", width: 432, height: 540, crf: 34 },
    ]
  : [
      { name: "desktop", width: 1920, height: 1080, crf: Number(args["desktop-crf"] ?? 24) },
      { name: "mobile", width: 1080, height: 1350, crf: Number(args["mobile-crf"] ?? 26) },
    ];

const X264 = [
  "-c:v", "libx264", "-preset", "slow",
  "-g", "6", "-keyint_min", "6", "-sc_threshold", "0", "-bf", "0",
  "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-tag:v", "avc1",
];

const source = probeStream(args.input);
const fps = source.fps;
const sourceFrames = countFrames(args.input);

const variants = [];
for (const v of VARIANTS) {
  const file = join(outDir, `${v.name}.mp4`);
  const vf =
    v.name === "desktop"
      ? `scale=${v.width}:${v.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${v.width}:${v.height}`
      : // 4:5 crop around the focal x, full height
        `crop=ih*${v.width}/${v.height}:ih:(iw-ih*${v.width}/${v.height})*${focalX}:0,scale=${v.width}:${v.height}:flags=lanczos`;
  ffmpeg(["-i", args.input, "-an", "-vf", vf, ...X264, "-crf", String(v.crf), file]);

  const frames = countFrames(file);
  if (frames !== sourceFrames) {
    throw new Error(`${v.name}: frame count ${frames} differs from source ${sourceFrames}`);
  }
  variants.push({
    name: v.name,
    width: v.width,
    height: v.height,
    src: `${v.name}.mp4`,
    bytes: statSync(file).size,
    decode: decodeIndex(file),
  });
}

// Posters come from the first frame of the desktop encode.
const posterSize = VARIANTS[0];
ffmpeg(["-i", join(outDir, "desktop.mp4"), "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", join(outDir, "poster.webp")]);
ffmpeg(["-i", join(outDir, "desktop.mp4"), "-frames:v", "1", "-c:v", "libaom-av1", "-still-picture", "1", "-crf", "30", "-cpu-used", "6", join(outDir, "poster.avif")]);

const timing = args["no-motion"]
  ? linearTiming(sourceFrames)
  : motionTiming(args.input, sourceFrames, Number(args["ease-in"] ?? 0), Number(args["ease-out"] ?? 0));

const manifest = {
  id: args.id,
  kind: "video",
  fps,
  frameCount: sourceFrames,
  focal: { x: focalX, y: focalY },
  poster: { avif: "poster.avif", webp: "poster.webp", width: posterSize.width, height: posterSize.height },
  variants,
  timing,
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest));
console.log(
  `${args.id}: ${sourceFrames} frames @ ${fps} fps → ` +
    variants.map((v) => `${v.name} ${(v.bytes / 1e6).toFixed(2)} MB`).join(", "),
);

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

function ffmpeg(argv) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...argv], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${argv.join(" ")}`);
}

function ffprobeJson(argv) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-of", "json", ...argv], { maxBuffer: 256 * 1024 * 1024 }).toString());
}

function probeStream(file) {
  const s = ffprobeJson(["-select_streams", "v:0", "-show_entries", "stream=r_frame_rate,width,height", file]).streams[0];
  const [n, d] = s.r_frame_rate.split("/").map(Number);
  return { fps: Math.round((n / d) * 1000) / 1000, width: s.width, height: s.height };
}

function countFrames(file) {
  const s = ffprobeJson(["-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", file]).streams[0];
  return Number(s.nb_read_packets);
}

// Frame index for WebCodecs: codec string + avcC record + per-frame byte ranges (playbook §4.4).
function decodeIndex(file) {
  const probe = ffprobeJson([
    "-select_streams", "v:0", "-show_data",
    "-show_entries", "stream=extradata:packet=pos,size,flags,pts",
    file,
  ]);
  const hex = probe.streams[0].extradata
    .split("\n")
    .map((line) => line.replace(/^[0-9a-f]{8}:\s*/i, "").slice(0, 40))
    .join("")
    .replace(/[^0-9a-f]/gi, "");
  const avcc = Buffer.from(hex, "hex");
  if (avcc[0] !== 1) throw new Error("Unexpected extradata: not an avcC record");
  const codec = `avc1.${[avcc[1], avcc[2], avcc[3]].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

  const packets = probe.packets.slice().sort((a, b) => Number(a.pts) - Number(b.pts));
  // With -bf 0, decode order equals presentation order; verify instead of assuming.
  for (let i = 1; i < probe.packets.length; i++) {
    if (Number(probe.packets[i].pts) < Number(probe.packets[i - 1].pts)) {
      throw new Error("Packets are not in presentation order (B-frames present?)");
    }
  }
  const keys = [];
  const samples = packets.map((p, i) => {
    if (p.flags.includes("K")) keys.push(i);
    return [Number(p.pos), Number(p.size)];
  });
  return { codec, description: avcc.toString("base64"), keys, samples };
}

function linearTiming(n) {
  return Array.from({ length: n }, (_, i) => round4(n > 1 ? i / (n - 1) : 0));
}

// Even camera speed per scroll (playbook §4.3): place each frame by cumulative image change.
function motionTiming(file, n, easeIn, easeOut) {
  const W = 192, H = 108, FLOOR = 3;
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vf", `scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"],
    { maxBuffer: 1024 * 1024 * 1024 },
  );
  const size = W * H;
  const frames = Math.min(n, Math.floor(raw.length / size));
  const change = [0];
  for (let i = 1; i < frames; i++) {
    let sum = 0;
    const a = (i - 1) * size, b = i * size;
    for (let p = 0; p < size; p++) sum += Math.abs(raw[b + p] - raw[a + p]);
    change.push(Math.max(FLOOR, sum / size));
  }
  // Ease the ends by stretching the scroll spent there (down to 30% speed).
  const weighted = change.map((c, i) => {
    const t = frames > 1 ? i / (frames - 1) : 0;
    let slow = 1;
    if (easeIn > 0 && t < easeIn) slow = 0.3 + 0.7 * (t / easeIn);
    if (easeOut > 0 && t > 1 - easeOut) slow = Math.min(slow, 0.3 + 0.7 * ((1 - t) / easeOut));
    return c / slow;
  });
  const cumulative = [];
  let total = 0;
  for (const w of weighted) cumulative.push((total += w));
  const first = cumulative[0], span = cumulative[cumulative.length - 1] - first || 1;
  const timing = cumulative.map((c) => round4((c - first) / span));
  while (timing.length < n) timing.push(1);
  return timing;
}

function round4(x) {
  return Math.round(x * 1e4) / 1e4;
}
