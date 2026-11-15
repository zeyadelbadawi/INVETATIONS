// WebCodecs frame engine (playbook §6.5): decodes frames straight out of the downloaded MP4
// with the manifest's decode index and draws them into a 2D canvas.

import { decodeDescription, keyframeAtOrBefore, type VideoDecodeIndex } from "./manifest";

export type FrameEngineFailure = "timeout" | "error" | "stalled";

export type FrameEngineOptions = {
  /** The whole MP4. */
  bytes: ArrayBuffer;
  index: VideoDecodeIndex;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  canvas: HTMLCanvasElement;
  /** Decoded frames kept around the position: 24 / 18 / 12. */
  ringSize: number;
  /** A decoded frame arrived; the caller should present again. */
  onFrameAvailable: () => void;
  /** The engine gave up and released everything; the caller falls back to the video element. */
  onFail: (reason: FrameEngineFailure) => void;
};

/** No output for this long while frames are in the decoder means it is holding them back: flush. */
export const STALL_MS = 120;
/** Without a drawn frame after this long the engine reports failure. */
export const FIRST_FRAME_TIMEOUT_MS = 6000;
const MAX_IN_FLIGHT = 8;
const MAX_DECODER_ERRORS = 3;
const MAX_STALLS_WITHOUT_OUTPUT = 4;

function decoderConfig(index: VideoDecodeIndex, width: number, height: number): VideoDecoderConfig {
  return {
    codec: index.codec,
    description: decodeDescription(index),
    codedWidth: width,
    codedHeight: height,
    optimizeForLatency: true,
  };
}

export async function isEngineSupported(index: VideoDecodeIndex, width: number, height: number): Promise<boolean> {
  if (typeof VideoDecoder === "undefined" || typeof EncodedVideoChunk === "undefined" || typeof createImageBitmap === "undefined") {
    return false;
  }
  try {
    const support = await VideoDecoder.isConfigSupported(decoderConfig(index, width, height));
    return support.supported === true;
  } catch {
    return false;
  }
}

type Job = { start: number; end: number; restart: boolean };

export class FrameEngine {
  private readonly options: FrameEngineOptions;
  private readonly config: VideoDecoderConfig;
  private readonly context: CanvasRenderingContext2D;
  private readonly isKey: Uint8Array;
  private readonly lastFrame: number;
  /** Compact copies of decoded frames by index. The decoder's own VideoFrames are never kept. */
  private readonly ring = new Map<number, ImageBitmap>();
  /** Fed to the decoder, no output yet. */
  private readonly decoding = new Set<number>();
  /** Output received, bitmap copy pending. */
  private readonly copying = new Set<number>();
  private decoder: VideoDecoder | null = null;
  /** Last frame fed. The decoder can only continue with `fed + 1` while `chainOpen`. */
  private fed = -1;
  private chainOpen = false;
  private flushing = false;
  private target = 0;
  private direction: 1 | -1 = 1;
  private presentedIndex = -1;
  private near = true;
  private dead = false;
  private lastActivityAt = 0;
  private errors = 0;
  private stalls = 0;
  private firstFrameTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: FrameEngineOptions) {
    this.options = options;
    this.config = decoderConfig(options.index, options.width, options.height);
    this.lastFrame = options.frameCount - 1;
    this.isKey = new Uint8Array(options.frameCount);
    for (const key of options.index.keys) this.isKey[key] = 1;

    options.canvas.width = options.width;
    options.canvas.height = options.height;
    const context = options.canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("2D canvas is not available");
    this.context = context;
    this.armFirstFrameTimer();
  }

  get presented(): number {
    return this.presentedIndex;
  }

  /** Decoded frames currently kept (for a memory meter). */
  get ringCount(): number {
    return this.ring.size;
  }

  /**
   * Asks for `target` (a frame index) and draws the best decoded frame toward it.
   * Returns the index on the canvas, or -1 before the first draw. Call once per animation frame
   * while the result differs from the target.
   */
  present(target: number): number {
    if (this.dead) return this.presentedIndex;
    const clamped = Math.min(this.lastFrame, Math.max(0, Math.round(target)));
    if (clamped !== this.target) {
      this.direction = clamped > this.target ? 1 : -1;
      this.target = clamped;
    }
    if (!this.near && this.presentedIndex === this.target) {
      this.release();
      return this.presentedIndex;
    }
    this.checkStall();
    this.pump();
    if (this.presentedIndex === this.target) return this.presentedIndex;

    const pick = this.pickFrame();
    const bitmap = pick === null ? undefined : this.ring.get(pick);
    if (bitmap && pick !== null) {
      this.context.drawImage(bitmap, 0, 0);
      this.presentedIndex = pick;
      this.clearFirstFrameTimer();
      // Arrived while far from the screen: nothing more will be asked for, so let go now.
      if (!this.near && pick === this.target) this.release();
    }
    return this.presentedIndex;
  }

  /**
   * Far from the screen the engine still draws the frame for its position, then closes the
   * decoder and frees the ring, keeping only the first frame.
   */
  setNear(near: boolean): void {
    if (this.dead || near === this.near) return;
    this.near = near;
    if (!near && this.presentedIndex === this.target) this.release();
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.clearFirstFrameTimer();
    this.closeDecoder();
    for (const bitmap of this.ring.values()) bitmap.close();
    this.ring.clear();
  }

  // --- choosing what to draw -------------------------------------------------------------

  /** The target if decoded; else the decoded frame nearest to it on the way from the current picture. */
  private pickFrame(): number | null {
    if (this.ring.has(this.target)) return this.target;
    if (this.presentedIndex < 0) {
      let best: number | null = null;
      for (const index of this.ring.keys()) {
        if (best === null || Math.abs(index - this.target) < Math.abs(best - this.target)) best = index;
      }
      return best;
    }
    // Only frames between the current picture and the target qualify: a late frame must
    // never make the picture step back, and one past the target would have to be undone.
    const step = this.presentedIndex < this.target ? -1 : 1;
    for (let index = this.target + step; index !== this.presentedIndex; index += step) {
      if (this.ring.has(index)) return index;
    }
    return null;
  }

  // --- deciding what to decode -----------------------------------------------------------

  private get lookahead(): number {
    return this.near ? Math.floor(this.options.ringSize / 2) : 0;
  }

  private isMissing(index: number): boolean {
    return !this.ring.has(index) && !this.decoding.has(index) && !this.copying.has(index);
  }

  private firstMissing(from: number, to: number): number {
    for (let index = from; index <= to; index++) if (this.isMissing(index)) return index;
    return -1;
  }

  private gopEnd(key: number): number {
    for (let index = key + 1; index <= this.lastFrame; index++) if (this.isKey[index]) return index - 1;
    return this.lastFrame;
  }

  private jobFor(missing: number, end: number): Job {
    const key = keyframeAtOrBefore(this.options.index.keys, missing);
    const canContinue = this.chainOpen && this.fed + 1 <= missing && key <= this.fed + 1;
    return { start: canContinue ? this.fed + 1 : key, end, restart: !canContinue };
  }

  private nextJob(): Job | null {
    const look = this.lookahead;
    if (this.direction > 0 || look === 0) {
      // Forward: keep feeding up to a little past the target.
      const end = Math.min(this.lastFrame, this.target + look);
      const missing = this.firstMissing(this.target, end);
      return missing < 0 ? null : this.jobFor(missing, end);
    }
    // Backward: whole GOPs, the target's first, then the ones below it.
    const floor = Math.max(0, this.target - look);
    let key = keyframeAtOrBefore(this.options.index.keys, this.target);
    for (;;) {
      const end = this.gopEnd(key);
      const missing = this.firstMissing(Math.max(key, floor), Math.min(end, this.target));
      if (missing >= 0) return this.jobFor(missing, end);
      if (key <= floor) return null;
      key = keyframeAtOrBefore(this.options.index.keys, key - 1);
    }
  }

  private pump(): void {
    if (this.flushing) return;
    const job = this.nextJob();
    if (!job) return;
    const decoder = this.decoder ?? this.openDecoder();
    if (!decoder) return;
    if (job.restart) this.restartAt(job.start);
    while (this.fed < job.end && this.decoding.size + this.copying.size < MAX_IN_FLIGHT) this.feed(decoder, this.fed + 1);
  }

  /** Starts again at a keyframe (far jump, or a new GOP while moving back). */
  private restartAt(key: number): void {
    const decoder = this.decoder;
    if (!decoder) return;
    // Frames still in the decoder are worth waiting for when they lie on the way to the target;
    // otherwise drop them so the jump costs at most one GOP of decodes.
    if (this.decoding.size > 0 && !this.hasUsefulDecodes()) {
      decoder.reset();
      decoder.configure(this.config);
      this.decoding.clear();
    }
    this.fed = key - 1;
    this.chainOpen = true;
  }

  private hasUsefulDecodes(): boolean {
    const from = this.presentedIndex < 0 ? this.target : Math.min(this.presentedIndex, this.target);
    const to = this.presentedIndex < 0 ? this.target : Math.max(this.presentedIndex, this.target);
    for (const index of this.decoding) if (index >= from && index <= to) return true;
    return false;
  }

  private feed(decoder: VideoDecoder, index: number): void {
    const [offset, size] = this.options.index.samples[index];
    decoder.decode(
      new EncodedVideoChunk({
        type: this.isKey[index] ? "key" : "delta",
        // No B-frames, so frame i is sample i and is shown at exactly i / fps.
        timestamp: Math.round((index * 1e6) / this.options.fps),
        data: new Uint8Array(this.options.bytes, offset, size),
      }),
    );
    this.decoding.add(index);
    this.fed = index;
    this.lastActivityAt = performance.now();
  }

  // --- decoder lifecycle -----------------------------------------------------------------

  private openDecoder(): VideoDecoder | null {
    try {
      const decoder: VideoDecoder = new VideoDecoder({
        output: (frame) => this.onOutput(decoder, frame),
        error: () => this.onDecoderError(decoder),
      });
      decoder.configure(this.config);
      this.decoder = decoder;
      this.chainOpen = false;
      return decoder;
    } catch {
      this.fail("error");
      return null;
    }
  }

  private closeDecoder(): void {
    const decoder = this.decoder;
    this.decoder = null;
    this.chainOpen = false;
    this.flushing = false;
    this.decoding.clear();
    if (decoder && decoder.state !== "closed") decoder.close();
  }

  private release(): void {
    this.closeDecoder();
    for (const [index, bitmap] of this.ring) {
      if (index === 0) continue;
      bitmap.close();
      this.ring.delete(index);
    }
  }

  private onOutput(decoder: VideoDecoder, frame: VideoFrame): void {
    const index = Math.round((frame.timestamp * this.options.fps) / 1e6);
    if (decoder !== this.decoder || this.dead) {
      frame.close();
      return;
    }
    this.decoding.delete(index);
    this.lastActivityAt = performance.now();
    this.stalls = 0;
    if (this.ring.has(index)) {
      frame.close();
      return;
    }
    this.copying.add(index);
    let copy: Promise<ImageBitmap>;
    try {
      // createImageBitmap takes its copy of the pixels before it returns, so the VideoFrame
      // can be closed at once. Holding VideoFrames stalls the decoder.
      copy = createImageBitmap(frame);
    } catch (error) {
      copy = Promise.reject(error);
    }
    frame.close();
    copy.then(
      (bitmap) => this.store(index, bitmap),
      () => {
        this.copying.delete(index);
        this.noteError();
      },
    );
  }

  private store(index: number, bitmap: ImageBitmap): void {
    this.copying.delete(index);
    const released = !this.near && this.decoder === null && index !== 0;
    if (this.dead || released || this.ring.has(index)) {
      bitmap.close();
      return;
    }
    this.ring.set(index, bitmap);
    this.evict();
    this.options.onFrameAvailable();
  }

  /** Drops the frames farthest from a point a little ahead of the target in the scroll direction. */
  private evict(): void {
    const centre = this.target + this.direction * (this.options.ringSize / 4);
    while (this.ring.size > this.options.ringSize) {
      let farthest = -1;
      let distance = -1;
      for (const index of this.ring.keys()) {
        const d = Math.abs(index - centre);
        if (d > distance) {
          distance = d;
          farthest = index;
        }
      }
      this.ring.get(farthest)?.close();
      this.ring.delete(farthest);
    }
  }

  // --- trouble ---------------------------------------------------------------------------

  private checkStall(): void {
    const decoder = this.decoder;
    if (!decoder || this.flushing || this.decoding.size === 0) return;
    if (performance.now() - this.lastActivityAt <= STALL_MS) return;
    this.stalls += 1;
    if (this.stalls > MAX_STALLS_WITHOUT_OUTPUT) {
      this.fail("stalled");
      return;
    }
    this.flushing = true;
    const settle = () => {
      if (decoder !== this.decoder) return;
      // Everything the decoder had has been output now; after a flush it needs a keyframe.
      this.flushing = false;
      this.chainOpen = false;
      this.decoding.clear();
      this.options.onFrameAvailable();
    };
    decoder.flush().then(settle, settle);
  }

  private onDecoderError(decoder: VideoDecoder): void {
    if (decoder !== this.decoder || this.dead) return;
    // A decoder that reported an error is closed; start a new one unless errors keep coming.
    this.decoder = null;
    this.chainOpen = false;
    this.flushing = false;
    this.decoding.clear();
    this.noteError();
  }

  private noteError(): void {
    if (this.dead) return;
    this.errors += 1;
    if (this.errors >= MAX_DECODER_ERRORS) this.fail("error");
    else this.options.onFrameAvailable();
  }

  private armFirstFrameTimer(): void {
    this.firstFrameTimer = setTimeout(() => {
      this.firstFrameTimer = null;
      if (this.dead || this.presentedIndex >= 0) return;
      // A hidden tab gets no animation frames, so nothing could have been drawn: wait on.
      if (document.visibilityState === "hidden") this.armFirstFrameTimer();
      else this.fail("timeout");
    }, FIRST_FRAME_TIMEOUT_MS);
  }

  private clearFirstFrameTimer(): void {
    if (this.firstFrameTimer !== null) clearTimeout(this.firstFrameTimer);
    this.firstFrameTimer = null;
  }

  private fail(reason: FrameEngineFailure): void {
    if (this.dead) return;
    this.destroy();
    this.options.onFail(reason);
  }
}
