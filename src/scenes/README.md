# Scroll-scene player

Scroll-scrubbed video scenes, following `docs/playbooks/scroll-animation-playbook.md` (§6–§9).
One deliberate difference from the playbook: a scene has a `gate` flag. **Only gating scenes hold
the splash.** A non-gating scene shows its poster until its video is ready and never blocks.

## What the page must render

In `<head>`, in this order (the scripts read the JSON element, so it must come first):

```tsx
import {
  buildPageSceneData, serializePageSceneData, SCENE_DATA_ID,
  splashBootScript, prefetchScript, splashCss, sceneNoScriptCss,
} from "@/scenes";

const data = buildPageSceneData([
  { source: hero, manifest: heroManifest, gate: true },     // page order = download order
  { source: story, manifest: storyManifest, gate: false },
]);

<head>
  <style dangerouslySetInnerHTML={{ __html: splashCss() }} />
  <noscript><style dangerouslySetInnerHTML={{ __html: sceneNoScriptCss() }} /></noscript>
  <script type="application/json" id={SCENE_DATA_ID}
          dangerouslySetInnerHTML={{ __html: serializePageSceneData(data) }} />
  <script dangerouslySetInnerHTML={{ __html: splashBootScript() }} />
  <script dangerouslySetInnerHTML={{ __html: prefetchScript() }} />
</head>
```

- `splashBootScript()`, `prefetchScript()`, `splashCss()` and `sceneNoScriptCss()` return **constant
  strings**. Nothing is interpolated into them. All page data travels in the JSON element, and
  `serializePageSceneData` escapes `<`, `>` and `&`, so a scene id or URL cannot break out of it.
- With a CSP, the two scripts need a nonce or their hashes (the strings never change between requests).
- The splash colour is the CSS variable `--splash-bg` (default `#0c0c0c`).
- Only render the scripts on pages that have scenes. The boot script acts only when at least one
  listed scene has `gate: true`; it then sets `history.scrollRestoration = "manual"` and
  `<html data-splash="hold">`.

JSON shape (`PageSceneData`): `{ s: [{ k: sceneKey, g: 0|1, d: [desktopUrl, bytes], m: [mobileUrl, bytes] }] }`.

## Usage: two scenes

```tsx
// Server component. Manifests come from the scene folder (manifest.json), checked with parseManifest.
import { MotionProvider, ScrollScene, SplashGate, parseManifest, manifestUrl, type SceneSource } from "@/scenes";

const base = process.env.NEXT_PUBLIC_MEDIA_URL ?? "/media/drafts";   // the caller decides the base
const hero: SceneSource = { id: "brand.hero", rev: 2, baseUrl: base };
const story: SceneSource = { id: "brand.story", baseUrl: base };
const P = "var(--seq-progress, 0)";
const HOLD = "var(--seq-hold, 0)";

export default async function Home() {
  const [heroManifest, storyManifest] = await Promise.all(
    [hero, story].map(async (s) => parseManifest(await (await fetch(manifestUrl(s))).json())),
  );
  return (
    <MotionProvider headerOffset={72}>
      <SplashGate />                                  {/* default visual; see below for a custom one */}
      <main>
        <ScrollScene source={hero} manifest={heroManifest} gate priority alt="The house at dusk"
                     scrollVh={300} holdVh={80}
                     frameOverlay={<LockMark style={{ position: "absolute", left: "62%", top: "40%" }} />}>
          <h1 style={{ opacity: `clamp(0, calc(${HOLD} * 3), 1)` }}>Welcome home</h1>
        </ScrollScene>

        <section id="about">…normal content…</section>

        <ScrollScene source={story} manifest={storyManifest} alt="The living room" scrollVh={250}>
          <p style={{ opacity: `clamp(0, calc((${P} - 0.72) * 6), 1)` }}>Lights follow you.</p>
        </ScrollScene>
      </main>
    </MotionProvider>
  );
}
```

`SplashGate` must sit **outside** the content it covers (a sibling of `<main>`): while it is up,
every sibling of the panel and of its ancestors is made `inert`.

### `ScrollScene` props

| Prop | Default | Meaning |
|---|---|---|
| `source` | – | `{ id, rev?, baseUrl }`. Files are read from `baseUrl/<id>[.r<rev>]/`. |
| `manifest` | – | The scene's `VideoManifest`. Keep the object identity stable between renders (a new object restarts the player). |
| `alt` | – | Alt text of the poster `<img>`. |
| `gate` | `false` | Holds the splash until the scene has drawn its frame. Must match the `gate` given to `buildPageSceneData`. |
| `priority` | `false` | Poster `loading="eager"` + `fetchpriority="high"` (the first scene). Others are lazy. |
| `leadVh` / `scrollVh` / `holdVh` | `0` / `300` / `0` | Section height is their sum in `lvh`. As in the playbook, the pinned travel is the sum minus 100. |
| `panX` | – | `[from, to]` focal x (0..1) across the move. |
| `continuesPrevious` | `false` | Chained scene (§6.8): `margin-top: -100lvh`, stage hidden until the section reaches the top. |
| `frameOverlay` | – | Marks on the footage, positioned in % of the frame (16:9, or 4:5 on the mobile cut). |
| `copy` / `children` | – | Headlines and CTAs, a layer over the whole stage. |
| `id`, `className`, `stageClassName` | – | Passed to the section / stage. |

`frameOverlay`, `copy` and `children` take nodes, or a function `({ animated, variant }) => node`.
A function can only be passed from a client component.

The stage gets `--seq-progress` (0..1 over the move) and `--seq-hold` (0..1 over the hold), written
only when they change; nothing re-renders on scroll. The stage carries `data-seq-stage` and
`data-animated="true|false"`. In the still version both variables are `1`, so overlays written with
`calc()` on them show their final state without extra code.

### `SplashGate` props

`children` (nodes, or `({ progress, phase, quick }) => node` from a client component; the panel
also carries `--splash-progress`), `label`, `continueLabel`, `className`, `continueClassName`, and
the timing options `minMs` (2000), `quickMinMs` (250), `exitMs` (600), `quickExitMs` (400),
`stallMs` (8000), `maxWaitMs` (30000), `slowLineSeconds` (30), `sessionKeyPrefix` (`"sq-ready-"`).
`useSplashGate(panelRef, options)` gives the same state for a fully custom panel; that panel must
carry the `data-splash-panel` attribute (`SPLASH_PANEL_ATTR`).

The gate lets go when every gating scene's file is downloaded **and** that scene has drawn its
frame, the fonts are loaded and the minimum time (from navigation start) has passed. It then jumps
to the top or the `#hash` target, waits up to 1 s for the gating scenes to draw there, fades for
`exitMs` with the lock still on, and only then opens the page.

### State for tests and a meter

`window.__ss` = `{ scenes: { [sceneKey]: { mode, ready, shown, want, presented, maxStep, gate } }, stills }`.
`window.__sq` = the downloads started by the inline script (`{ v: variant, x: stopped, d: { [url]: … } }`).
`subscribeSceneStatus` / `getSceneStatusSnapshot` work with `useSyncExternalStore`; they notify on
`mode`, `ready`, `shown` and scene-list changes, not on the per-frame fields.

## Files

| File | Role |
|---|---|
| `manifest.ts`, `page-data.ts` | Types, URL helpers, the page JSON |
| `device-tier.ts`, `frame-math.ts` | Pure rules and math (unit-tested) |
| `boot-script.ts` | Inline head scripts + CSS as constant strings |
| `video-preload.ts` | Download queue, adoption of the inline prefetch, line-speed estimate |
| `frame-engine.ts`, `video-fallback.ts`, `scene-driver.ts` | WebCodecs engine, video-element fallback, the walk. Loaded as a separate chunk after the download |
| `scene-status.ts` | Per-scene state store |
| `motion-libs.ts`, `MotionProvider.tsx` | Lazy GSAP/ScrollTrigger, Lenis |
| `ScrollScene.tsx`, `SplashGate.tsx`, `use-splash-gate.ts` | Components |

## Checks

```bash
pnpm exec vitest run src/scenes                      # unit tests
node e2e-fixtures/scene-test/build.mjs /tmp/scene-test          # add --dev for a React development build (StrictMode)
NODE_PATH=$(npm root -g) node e2e-fixtures/scene-test/run.mjs /tmp/scene-test   # Chromium checks on the draft scene
```

## Not verified in this environment, and known limits

Everything below is untested here. Only headless Chromium on Linux (software decoding) was run.

- **Inside Next.js.** The library was type-checked with the app's `tsconfig` and exercised in a
  standalone React 19 page (server-rendered, then hydrated), not in `next dev` / `next build`.
  Chunk splitting, the 180 KB initial-JS budget and the App Router behaviour are unmeasured.
- **Safari (macOS, iOS), Firefox, Android, in-app browsers, real devices.** In particular:
  hardware decoders (stall behaviour, frames held back), `createImageBitmap(VideoFrame)` followed
  by an immediate `close()` outside Chromium, the video-element fallback on iOS (the muted
  play/pause that makes iOS load frame data is written from known behaviour, never run), Firefox
  for Android, Low Power Mode, and memory against the playbook's 350 MB / 250 MB limits.
- **Smoothness numbers** (§10.2) on real hardware. No `?debug=scrub` meter is included.
- **The glide fix on link clicks** in `MotionProvider` is implemented as in §8 but has no test;
  it needs a client-side router.
- **`panX`** and the script fallback of the chained reveal (browsers without `ViewTimeline`) have
  no test. The chained reveal was only checked with one draft clip, so a pixel-identical handoff
  between two real shots was not looked at.
- **CDN behaviour.** Files are fetched with `fetch()` to get the bytes, so a cross-origin media
  host must send CORS headers (`Access-Control-Allow-Origin`, and `Vary: Origin` if it caches).
  The playbook's "no `crossOrigin`" advice is kept in the sense that no credentials mode or
  attribute is set, but this still differs from loading a `<video src>`.
- **`lvh`** has no fallback unit: browsers before Safari 15.4 / Chrome 108 ignore the height.
- **Lenis CSS** (`lenis/dist/lenis.css`) is not imported here; import it in the app's global CSS.

Differences from the playbook, on purpose:

- The line speed is measured over 2.5 s **from the first bytes**, not from the request, so a slow
  first response alone does not switch the visit to stills. If no bytes ever arrive, the stall rule
  (8 s) offers the way out instead.
- The splash waits for the files **up to the last gating scene** in page order (downloads are
  sequential, so files ahead of it are in the way); the slow-line estimate covers the same bytes.
- A downloaded file whose size differs from the manifest's `bytes` is refused (the decode index
  addresses bytes), and the scene stays on its poster.
- A scene whose file cannot be downloaded or played by either renderer settles on its poster
  (`mode: "still"`, `ready: true`) so it cannot hold the splash forever.
- Not built: the header that reads footage brightness (§6.9), opaque file names (§5), the debug
  meter (§10.2), streaming when the visitor outruns the download (the page waits or shows posters).
- Without JavaScript the scroll layout stays (tall sections with a sticky poster);
  `sceneNoScriptCss()` puts overlays in their final state.
