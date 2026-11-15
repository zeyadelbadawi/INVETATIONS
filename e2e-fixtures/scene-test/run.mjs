// Browser checks for the scene player (playbook §10.1), run against the built test page.
// Usage: node e2e-fixtures/scene-test/run.mjs <builtDir>   (the outDir given to build.mjs)
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { startServer } from "./server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

if (!process.argv[2]) throw new Error("Usage: run.mjs <builtDir>");
const server = await startServer(join(resolve(process.argv[2]), "public"));
const browser = await chromium.launch();
const results = [];
const only = process.argv[3];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, options, body) {
  if (only && !name.includes(only)) return;
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...options.context });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|net::ERR/.test(message.text())) errors.push(message.text());
  });
  const started = Date.now();
  try {
    const note = await body(page, context);
    assert(options.allowErrors || errors.length === 0, `page errors: ${errors.join(" | ")}`);
    results.push({ name, ok: true, note, ms: Date.now() - started });
  } catch (error) {
    results.push({ name, ok: false, note: String(error?.message ?? error), ms: Date.now() - started });
  } finally {
    server.throttle(0);
    await context.close();
  }
}

const splash = (page) => page.evaluate(() => document.documentElement.getAttribute("data-splash"));
const scenes = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__ss)));
const waitOpen = (page, timeout = 15000) => page.waitForFunction(() => document.documentElement.getAttribute("data-splash") === "seen", null, { timeout });

/** Scrolls to y and waits until every scene shows the frame for that position, for several frames in a row. */
async function settleAt(page, y) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  await page.waitForFunction(
    (top) => {
      const w = window;
      if (Math.abs(w.scrollY - top) > 1) return false;
      const all = Object.values(w.__ss.scenes);
      const settled = all.length > 0 && all.every((s) => s.mode !== "still" && s.presented === Math.round(s.want));
      w.__settled = settled ? (w.__settled ?? 0) + 1 : 0;
      return w.__settled >= 6;
    },
    y,
    { polling: "raf", timeout: 8000 },
  );
  await page.evaluate(() => void (window.__settled = 0));
  return page.evaluate(() => {
    const out = {};
    for (const [key, scene] of Object.entries(window.__ss.scenes)) out[key] = { presented: scene.presented, want: scene.want, mode: scene.mode };
    // A checksum of each canvas, to compare the pictures themselves and not only the index.
    document.querySelectorAll("[data-seq-stage] canvas").forEach((canvas, i) => {
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let p = 0; p < data.length; p += 16) sum = (sum * 31 + data[p] + data[p + 1] * 3 + data[p + 2] * 7) >>> 0;
      out[`canvas${i}`] = sum;
    });
    out.video = [...document.querySelectorAll("[data-seq-stage] video")].map((v) => Number(v.currentTime.toFixed(4)));
    return out;
  });
}

async function bothWays(page, expectMode) {
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const fractions = [0, 0.04, 0.11, 0.17, 0.26, 0.31, 0.38, 0.47, 0.55, 0.63, 0.78, 0.86, 0.93, 1];
  const positions = fractions.map((f) => Math.round(f * pageHeight));
  const forward = [];
  for (const y of positions) forward.push(await settleAt(page, y));
  const backward = [];
  for (const y of [...positions].reverse()) backward.unshift(await settleAt(page, y));
  const distinct = new Set();
  positions.forEach((y, i) => {
    assert(JSON.stringify(forward[i]) === JSON.stringify(backward[i]), `at y=${y}: forward ${JSON.stringify(forward[i])} != backward ${JSON.stringify(backward[i])}`);
    for (const [key, value] of Object.entries(forward[i])) {
      if (value && typeof value === "object" && "mode" in value) {
        assert(value.mode === expectMode, `${key} is in mode ${value.mode}, expected ${expectMode}`);
        distinct.add(`${key}:${value.presented}`);
      }
    }
  });
  return { positions: positions.length, distinctFrames: distinct.size, last: forward[forward.length - 1] };
}

await test("gate: covered and locked from the first paint, opens when the gating scene is ready", {}, async (page) => {
  await page.goto(server.url, { waitUntil: "commit" });
  await page.waitForSelector("[data-splash-panel]", { state: "attached" });
  assert((await splash(page)) === "hold", "page is not held at first paint");
  assert(await page.evaluate(() => getComputedStyle(document.documentElement).overflow === "hidden"), "scroll is not locked");
  assert(await page.locator("[data-splash-panel]").isVisible(), "panel is not visible");
  await page.mouse.move(640, 360);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(60);
  }
  await page.keyboard.press("PageDown");
  await page.keyboard.press("End");
  await page.waitForTimeout(150);
  assert((await page.evaluate(() => window.scrollY)) === 0, "page scrolled under the splash");
  const inertWhileUp = await page.evaluate(() => document.querySelector("main").inert);

  await waitOpen(page);
  const openedAt = await page.evaluate(() => performance.now());
  assert(openedAt >= 2000, `opened after ${openedAt} ms, before the 2 s minimum`);
  const state = await scenes(page);
  const first = state.scenes["draft.opening"];
  assert(first.mode === "engine", `gating scene mode is ${first.mode}`);
  assert(first.ready && first.shown && first.presented === 0, `gating scene not drawn: ${JSON.stringify(first)}`);
  assert(inertWhileUp === true, "page was not inert while the splash was up");
  assert((await page.evaluate(() => document.querySelector("main").inert)) === false, "page still inert after release");
  assert((await page.locator("[data-splash-panel]").count()) === 0, "panel still in the DOM");
  assert((await page.evaluate(() => window.scrollY)) === 0, "not at the top after release");
  await page.mouse.wheel(0, 600);
  await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 3000 });
  return `opened at ${Math.round(openedAt)} ms; modes ${Object.values(state.scenes).map((s) => s.mode).join(",")}`;
});

await test("engine: WebCodecs mode, same position gives the same frame and picture both ways", {}, async (page) => {
  await page.goto(server.url);
  await waitOpen(page);
  const result = await bothWays(page, "engine");
  const state = await scenes(page);
  for (const [key, scene] of Object.entries(state.scenes)) assert(scene.ready && scene.shown, `${key} not ready/shown`);
  assert(result.distinctFrames >= 12, `only ${result.distinctFrames} distinct frames seen`);
  return `${result.positions} positions x 2 directions identical (index + canvas checksum); ${result.distinctFrames} distinct scene frames; maxStep ${Object.values(state.scenes).map((s) => s.maxStep).join(",")}`;
});

await test("engine: wheel scrolling through Lenis comes to rest on the frame for the position", {}, async (page) => {
  await page.goto(server.url);
  await waitOpen(page);
  await page.waitForFunction(() => document.documentElement.classList.contains("lenis"), null, { timeout: 5000 });
  await page.mouse.move(640, 360);
  const rest = async () => {
    await page.waitForFunction(
      () => {
        const w = window;
        const still = w.__lastY === w.scrollY;
        w.__lastY = w.scrollY;
        const all = Object.values(w.__ss.scenes);
        w.__rest = still && all.every((s) => s.presented === Math.round(s.want)) ? (w.__rest ?? 0) + 1 : 0;
        return w.__rest >= 20;
      },
      null,
      { polling: "raf", timeout: 10000 },
    );
    return page.evaluate(() => ({ y: window.scrollY, a: window.__ss.scenes["draft.opening"].presented }));
  };
  await page.evaluate(() => void (window.__ss.scenes["draft.opening"].maxStep = 0));
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(40);
  }
  const down = await rest();
  const slowStep = await page.evaluate(() => window.__ss.scenes["draft.opening"].maxStep);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 900);
  const flick = await rest();
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -900);
  const top = await rest();
  assert(down.y > 300 && down.a > 0, `slow wheel did not advance the scene: ${JSON.stringify(down)}`);
  assert(flick.y > down.y, "flick did not scroll");
  assert(top.y === 0 && top.a === 0, `back at the top shows frame ${top.a} at y=${top.y}`);
  return `slow wheel: y=${down.y} frame ${down.a}, max step ${slowStep}; flick: y=${flick.y}; back to top: frame ${top.a}`;
});

await test("fallback: without VideoDecoder the video element presents frames behind the same gate", {}, async (page) => {
  await page.addInitScript(() => {
    delete window.VideoDecoder;
  });
  await page.goto(server.url);
  assert((await splash(page)) === "hold", "not held");
  await waitOpen(page);
  const before = await scenes(page);
  assert(before.scenes["draft.opening"].mode === "video", `mode is ${before.scenes["draft.opening"].mode}`);
  assert(before.scenes["draft.opening"].ready && before.scenes["draft.opening"].shown, "fallback did not draw before the gate opened");
  const result = await bothWays(page, "video");
  const times = result.last.video;
  // Mid-frame seek time: (i + 0.5) / fps.
  const third = result.last["draft.third"].presented;
  assert(Math.abs(times[2] - (third + 0.5) / 24) < 0.002, `video time ${times[2]} is not mid-frame of ${third}`);
  const visible = await page.evaluate(() => [...document.querySelectorAll("[data-seq-stage]")].map((s) => [s.querySelector("canvas").style.opacity, s.querySelector("video").style.opacity]));
  assert(visible.every(([canvas, video]) => canvas !== "1" && video === "1"), `wrong layer visible: ${JSON.stringify(visible)}`);
  assert(await page.evaluate(() => [...document.querySelectorAll("video")].every((v) => v.src.startsWith("blob:"))), "video does not play from a blob URL");
  return `${result.positions} positions x 2 directions identical (index + currentTime); ${result.distinctFrames} distinct scene frames`;
});

// A decoder that accepts everything and never outputs a frame. With `flushHangs` its flush never
// settles either, so only the 6 s first-frame timeout can end the wait.
function silentDecoder(flushHangs) {
  const Real = window.VideoDecoder;
  window.VideoDecoder = class {
    static isConfigSupported(config) {
      return Real.isConfigSupported(config);
    }
    state = "configured";
    decodeQueueSize = 0;
    configure() {}
    decode() {}
    reset() {}
    flush() {
      return flushHangs ? new Promise(() => {}) : Promise.resolve();
    }
    close() {
      this.state = "closed";
    }
  };
}

await test("fallback: a decoder that stalls (flushes bring nothing) is replaced by the video element", {}, async (page) => {
  await page.addInitScript(silentDecoder, false);
  await page.goto(server.url);
  await waitOpen(page, 20000);
  const openedAt = await page.evaluate(() => performance.now());
  const state = await scenes(page);
  assert(state.scenes["draft.opening"].mode === "video" && state.scenes["draft.opening"].shown, `scene: ${JSON.stringify(state.scenes["draft.opening"])}`);
  return `fell back to video, gate opened at ${Math.round(openedAt)} ms`;
});

await test("fallback: no first frame within 6 s falls back to the video element", {}, async (page) => {
  await page.addInitScript(silentDecoder, true);
  await page.goto(server.url);
  await page.waitForTimeout(5000);
  assert((await splash(page)) === "hold", "gate opened before the scene drew anything");
  assert((await scenes(page)).scenes["draft.opening"].mode === "engine", "left the engine before the timeout");
  await waitOpen(page, 20000);
  const openedAt = await page.evaluate(() => performance.now());
  const state = await scenes(page);
  assert(state.scenes["draft.opening"].mode === "video" && state.scenes["draft.opening"].shown, `scene: ${JSON.stringify(state.scenes["draft.opening"])}`);
  assert(openedAt > 6000 && openedAt < 9000, `opened at ${openedAt} ms`);
  return `still on the engine at 5 s; fell back and opened at ${Math.round(openedAt)} ms`;
});

await test("engine housekeeping: VideoFrames closed at once, frame ring bounded, freed far from the screen", {}, async (page) => {
  await page.addInitScript(() => {
    const stats = (window.__stats = { frames: 0, leftOpen: 0, liveBitmaps: 0, peakBitmaps: 0, decoders: 0, openDecoders: 0, decodes: 0, resets: 0, flushes: 0 });
    const Real = window.VideoDecoder;
    window.VideoDecoder = class extends Real {
      constructor(init) {
        super({
          ...init,
          output: (frame) => {
            stats.frames++;
            init.output(frame);
            // A closed VideoFrame has no format.
            if (frame.format !== null) stats.leftOpen++;
          },
        });
        stats.decoders++;
        stats.openDecoders++;
      }
      decode(chunk) {
        stats.decodes++;
        return super.decode(chunk);
      }
      reset() {
        stats.resets++;
        return super.reset();
      }
      flush() {
        stats.flushes++;
        return super.flush();
      }
      close() {
        stats.openDecoders--;
        return super.close();
      }
    };
    const create = window.createImageBitmap.bind(window);
    window.createImageBitmap = (...args) =>
      create(...args).then((bitmap) => {
        stats.liveBitmaps++;
        stats.peakBitmaps = Math.max(stats.peakBitmaps, stats.liveBitmaps);
        return bitmap;
      });
    const close = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function () {
      stats.liveBitmaps--;
      return close.call(this);
    };
  });
  await page.goto(server.url);
  await waitOpen(page);
  const stats = () => page.evaluate(() => ({ ...window.__stats }));
  const atOpen = await stats();
  // Smooth scroll down and back up through scene A, so the engine decodes in both directions.
  const glide = (from, to) =>
    page.evaluate(
      ([a, b]) =>
        new Promise((done) => {
          const t0 = performance.now();
          const step = (now) => {
            const t = Math.min(1, (now - t0) / 2500);
            window.scrollTo({ top: a + (b - a) * t, behavior: "instant" });
            if (t < 1) requestAnimationFrame(step);
            else done();
          };
          requestAnimationFrame(step);
        }),
      [from, to],
    );
  await page.evaluate(() => void (window.__ss.scenes["draft.opening"].maxStep = 0));
  await glide(0, 1440);
  const down = await stats();
  await glide(1440, 0);
  await settleAt(page, 0);
  const up = await stats();
  const glideStep = await page.evaluate(() => window.__ss.scenes["draft.opening"].maxStep);
  // Go to the last scene: A and B are now more than a screen away.
  const bottom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  await settleAt(page, bottom - 800);
  await page.waitForTimeout(300);
  const far = await stats();
  await settleAt(page, 700);
  const back = await stats();

  assert(up.frames > 200, `only ${up.frames} frames decoded`);
  assert(back.leftOpen === 0, `${back.leftOpen} VideoFrames were still open after the output callback`);
  // Ring is 24 on this desktop; three scenes.
  assert(back.peakBitmaps <= 3 * 24 + 8, `peak of ${back.peakBitmaps} bitmaps alive`);
  assert(far.openDecoders === 1 && far.liveBitmaps <= 24 + 2, `far from A and B: ${far.openDecoders} decoders open, ${far.liveBitmaps} bitmaps alive`);
  assert(glideStep <= 4, `max step ${glideStep} on a slow scroll`);
  // Forward costs about one decode per frame; backward decodes whole GOPs once each.
  assert(down.decodes - atOpen.decodes < 144 * 1.5, `forward pass used ${down.decodes - atOpen.decodes} decodes for 144 frames`);
  assert(up.decodes - down.decodes < 144 * 1.5, `backward pass used ${up.decodes - down.decodes} decodes for 144 frames`);
  return `frames ${back.frames}, left open ${back.leftOpen}; peak bitmaps ${back.peakBitmaps}; far away: ${far.openDecoders} decoder, ${far.liveBitmaps} bitmaps; decodes fwd ${down.decodes - atOpen.decodes} / back ${up.decodes - down.decodes} for 144 frames; resets ${back.resets}, flushes ${back.flushes}; max step on a 2.5 s glide ${glideStep}`;
});

await test("stills: reduced motion gets posters in normal flow, no panel, no lock, no downloads", { context: { reducedMotion: "reduce" } }, async (page) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(server.url);
  assert((await splash(page)) === "seen", `data-splash is ${await splash(page)}`);
  await page.waitForFunction(() => document.querySelector("[data-seq-stage]").dataset.animated === "false");
  const info = await page.evaluate(() => ({
    overflow: getComputedStyle(document.documentElement).overflow,
    panelVisible: !!document.querySelector("[data-splash-panel]"),
    canvases: document.querySelectorAll("canvas, video").length,
    heights: [...document.querySelectorAll("[data-seq-scene]")].map((s) => s.offsetHeight),
    copyOpacity: getComputedStyle(document.querySelector("[data-testid=copy-a]")).opacity,
    posterLoaded: document.querySelector("[data-seq-stage] img").complete && document.querySelector("[data-seq-stage] img").naturalWidth > 0,
    lenis: document.documentElement.classList.contains("lenis"),
  }));
  await page.waitForTimeout(1500);
  assert(info.overflow !== "hidden", "page is locked");
  assert(!info.panelVisible, "panel rendered");
  assert(info.canvases === 0, "canvas/video rendered in the still version");
  assert(info.heights.every((h) => h === 720), `scene heights ${info.heights} are not one screen`);
  assert(info.copyOpacity === "1", `copy opacity ${info.copyOpacity}, expected final state`);
  assert(info.posterLoaded, "poster not loaded");
  assert(!requests.some((url) => /\.mp4|gsap|lenis|ScrollTrigger|scene-driver/.test(url)), `unexpected requests: ${requests.filter((u) => /\.mp4|chunk/.test(u))}`);
  assert(!info.lenis, "smooth scroll started");
  return `scene heights ${info.heights.join("/")} px; no mp4, no motion library, no driver chunk requested`;
});

await test("no gsap: scenes still follow the scroll when the motion library fails to load", {}, async (page) => {
  await page.route(/chunk-(gsap|ScrollTrigger)/, (route) => route.abort());
  await page.goto(server.url);
  await waitOpen(page);
  const result = await bothWays(page, "engine");
  const progress = await page.evaluate(() => document.querySelector("[data-seq-stage]").style.getPropertyValue("--seq-progress"));
  assert(progress === "0.0000", `--seq-progress at top is ${progress}`);
  return `${result.positions} positions x 2 directions identical with gsap blocked; ${result.distinctFrames} distinct scene frames`;
});

await test("css variables: --seq-progress and --seq-hold follow lead/move/hold", {}, async (page) => {
  await page.goto(server.url);
  await waitOpen(page);
  const vh = 720;
  const read = (y) =>
    page.evaluate(async (top) => {
      window.scrollTo({ top, behavior: "instant" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const stage = document.querySelector("[data-seq-stage]");
      return {
        p: Number(stage.style.getPropertyValue("--seq-progress")),
        h: Number(stage.style.getPropertyValue("--seq-hold")),
        copy: Number(getComputedStyle(stage.querySelector("[data-testid=copy-a]")).opacity),
        mark: stage.querySelector("[data-testid=mark-a]").getBoundingClientRect().left,
        frame: stage.querySelector("[data-seq-frame]").getBoundingClientRect().toJSON(),
      };
    }, y);
  // Scene A: scroll 300 + hold 80 → travel 280vh, move ends at 200vh.
  const mid = await read(1 * vh);
  const endMove = await read(2 * vh);
  const midHold = await read(2.4 * vh);
  const end = await read(2.8 * vh);
  assert(Math.abs(mid.p - 0.5) < 0.002 && mid.h === 0, `mid move: ${JSON.stringify(mid)}`);
  assert(endMove.p === 1 && endMove.h === 0 && endMove.copy === 0, `end of move: ${JSON.stringify(endMove)}`);
  assert(midHold.p === 1 && Math.abs(midHold.h - 0.5) < 0.002 && midHold.copy === 1, `mid hold: ${JSON.stringify(midHold)}`);
  assert(end.p === 1 && end.h === 1, `end: ${JSON.stringify(end)}`);
  // 1280x720 is exactly 16:9, so the frame overlay equals the stage and the mark sits at 62%.
  assert(Math.abs(mid.frame.width - 1280) < 1 && Math.abs(mid.frame.height - 720) < 1, `frame overlay ${JSON.stringify(mid.frame)}`);
  assert(Math.abs(mid.mark - 0.62 * 1280) < 1, `mark at ${mid.mark}`);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const tall = await read(0);
  // Taller screen: cover scales the frame to the height; the overlay must match (1000*16/9 wide, centred).
  assert(Math.abs(tall.frame.width - (1000 * 16) / 9) < 1 && Math.abs(tall.frame.left - (1280 - (1000 * 16) / 9) / 2) < 1, `frame overlay on a tall screen ${JSON.stringify(tall.frame)}`);
  return `p/hold at 100vh ${mid.p}/${mid.h}, 200vh ${endMove.p}/${endMove.h}, 240vh ${midHold.p}/${midHold.h}, 280vh ${end.p}/${end.h}`;
});

await test("handoff: a chained stage is hidden until its section reaches the top, then shows a drawn frame", {}, async (page) => {
  await page.goto(server.url);
  await waitOpen(page);
  const at = (y) =>
    page.evaluate(async (top) => {
      window.scrollTo({ top, behavior: "instant" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      const section = document.querySelectorAll("[data-seq-scene]")[1];
      const stage = section.querySelector("[data-seq-stage]");
      return { top: section.getBoundingClientRect().top, visibility: getComputedStyle(stage).visibility, canvas: stage.querySelector("canvas").style.opacity, scene: { ...window.__ss.scenes["draft.second"] } };
    }, y);
  // Scene A is 380vh tall and B starts one screen early: B's section top is at 280vh.
  const sectionTop = 2.8 * 720;
  const early = await at(sectionTop - 300);
  const justBefore = await at(sectionTop - 2);
  const atTop = await at(sectionTop);
  const after = await at(sectionTop + 200);
  assert(early.visibility === "hidden" && justBefore.visibility === "hidden", `stage visible before the cut: ${early.visibility}/${justBefore.visibility} (top ${justBefore.top})`);
  assert(atTop.visibility === "visible" && after.visibility === "visible", `stage hidden after the cut: ${atTop.visibility}/${after.visibility}`);
  assert(atTop.scene.shown && atTop.scene.presented === 0 && atTop.canvas === "1", `no drawn frame at the cut: ${JSON.stringify(atTop.scene)}`);
  return `hidden at ${Math.round(justBefore.top)} px above the cut, visible at 0 with frame ${atTop.scene.presented} drawn; ViewTimeline ${await page.evaluate(() => typeof ViewTimeline === "function")}`;
});

await test("hash: a link to a section lands there once the gate opens", {}, async (page) => {
  await page.goto(`${server.url}/#after`);
  assert((await splash(page)) === "hold", "not held");
  await waitOpen(page);
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => ({ top: document.getElementById("after").getBoundingClientRect().top, y: window.scrollY }));
  assert(Math.abs(info.top) <= 1, `#after is at ${info.top} px, scrollY ${info.y}`);
  return `#after at ${info.top} px (scrollY ${info.y})`;
});

await test("return: a reload in the same session gets the quick cover and starts at the top", {}, async (page) => {
  await page.goto(server.url);
  await waitOpen(page);
  assert((await page.evaluate(() => sessionStorage.getItem("sq-ready-desktop"))) === "1", "session key not set");
  await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" }));
  await page.reload({ waitUntil: "commit" });
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-splash"));
  assert((await splash(page)) !== "seen", "reload was not covered");
  await waitOpen(page);
  const info = await page.evaluate(() => ({ at: performance.now(), y: window.scrollY, ready: window.__ss.scenes["draft.opening"].ready }));
  assert(info.at < 1800, `quick cover took ${info.at} ms`);
  assert(info.y === 0 && info.ready, `after reload: ${JSON.stringify(info)}`);
  return `reload mid-walk reopened at the top in ${Math.round(info.at)} ms`;
});

await test("slow line: downloads are stopped and the visit switches to stills", {}, async (page) => {
  server.throttle(1200);
  await page.goto(server.url);
  assert((await splash(page)) === "hold", "not held");
  await waitOpen(page, 12000);
  const info = await page.evaluate(() => ({
    at: performance.now(),
    stills: window.__ss.stills,
    animated: [...document.querySelectorAll("[data-seq-stage]")].map((s) => s.dataset.animated),
    canvases: document.querySelectorAll("canvas").length,
    session: sessionStorage.getItem("sq-ready-desktop"),
    aborted: window.__sq.x,
    progress: getComputedStyle(document.querySelector("[data-testid=copy-a]")).opacity,
  }));
  assert(info.stills && info.animated.every((a) => a === "false") && info.canvases === 0, `not in stills: ${JSON.stringify(info)}`);
  assert(info.at < 6000, `took ${info.at} ms to give up on the slow line`);
  assert(info.session === null, "session key set although nothing loaded");
  assert(info.aborted === true, "inline download queue not stopped");
  return `1.2 kB/s line: stills at ${Math.round(info.at)} ms instead of ~70 s of waiting`;
});

await test("stall: the way out appears only after no progress, and opens the page", { allowErrors: true }, async (page) => {
  // The first file never finishes: the server sends headers and stops.
  await page.route(/desktop\.mp4/, () => {});
  await page.goto(`${server.url}/stall.html`);
  await page.waitForTimeout(1000);
  assert((await page.getByRole("button", { name: "Continue without waiting" }).count()) === 0, "way out offered too early");
  const button = page.getByRole("button", { name: "Continue without waiting" });
  await button.waitFor({ timeout: 5000 });
  assert((await splash(page)) === "hold", "gate gave up on its own");
  await button.focus();
  await page.keyboard.press("Space");
  await waitOpen(page, 3000);
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 3000 });
  return "button appeared after the stall limit, Space on it opened the page, scrolling works";
});

await test("failsafe: the boot lock lets go after 10 s when the app script never loads", { allowErrors: true }, async (page) => {
  await page.route(/client\.js/, (route) => route.abort());
  await page.goto(server.url);
  assert((await splash(page)) === "hold", "not held");
  await page.waitForTimeout(9000);
  assert((await splash(page)) === "hold", "let go before 10 s");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, { timeout: 3000 });
  const info = await page.evaluate(() => ({ overflow: getComputedStyle(document.documentElement).overflow, panel: getComputedStyle(document.querySelector("[data-splash-panel]")).display, at: performance.now() }));
  assert(info.overflow !== "hidden" && info.panel === "none", `still covered: ${JSON.stringify(info)}`);
  return `released at ${Math.round(info.at)} ms; panel hidden, scroll free`;
});

await test("no js: posters and copy are in the server HTML, nothing is locked", { context: { javaScriptEnabled: false } }, async (page) => {
  await page.goto(server.url);
  const html = await page.content();
  assert(!/data-splash="hold"/.test(html.slice(0, 200)), "locked without JS");
  const copy = page.locator("[data-testid=copy-a]");
  assert((await copy.textContent()) === "Scene A", "copy missing");
  const opacity = await copy.evaluate((el) => getComputedStyle(el).opacity).catch(() => "n/a");
  assert(await page.locator("[data-seq-stage] img").first().isVisible(), "poster not visible");
  assert(!(await page.locator("[data-splash-panel]").isVisible()), "panel visible without JS");
  return `poster and copy rendered; copy opacity ${opacity} (noscript CSS sets final state)`;
});

await test("mobile: a portrait screen downloads and plays the 4:5 cut", { context: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }, async (page) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(server.url);
  await waitOpen(page);
  const info = await page.evaluate(() => {
    const stage = document.querySelector("[data-seq-stage]");
    const canvas = stage.querySelector("canvas");
    return { variant: window.__sq.v, w: canvas.width, h: canvas.height, mode: window.__ss.scenes["draft.opening"].mode, frame: stage.querySelector("[data-seq-frame]").getBoundingClientRect().toJSON(), stage: stage.getBoundingClientRect().toJSON() };
  });
  assert(info.variant === "mobile" && info.w === 432 && info.h === 540, `variant ${JSON.stringify(info)}`);
  assert(requests.some((u) => u.endsWith("mobile.mp4")) && !requests.some((u) => u.endsWith("desktop.mp4")), "wrong file downloaded");
  assert(info.mode === "engine", `mode ${info.mode}`);
  assert(Math.abs(info.frame.height - info.stage.height) < 1 && Math.abs(info.frame.width - info.stage.height * 0.8) < 1, `frame overlay ${JSON.stringify(info.frame)}`);
  const result = await bothWays(page, "engine");
  return `432x540 canvas, frame overlay ${Math.round(info.frame.width)}x${Math.round(info.frame.height)}; ${result.positions} positions x 2 identical`;
});

await browser.close();
await server.close();
let failed = 0;
for (const result of results) {
  if (!result.ok) failed++;
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}  (${result.ms} ms)\n      ${result.note}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
