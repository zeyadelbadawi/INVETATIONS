// Video-element scrubber (playbook §6.6): the fallback when WebCodecs is missing, unsupported
// for the file, or fails. Plays the downloaded bytes from a blob: URL, never from the network.

export type VideoScrubberOptions = {
  video: HTMLVideoElement;
  bytes: ArrayBuffer;
  fps: number;
  frameCount: number;
  /** A seek landed (or was given up on); the caller should present again. */
  onFrame: () => void;
  /** The element cannot play the file. */
  onFail: () => void;
};

/** After `seeked`, how long to wait for the frame callback before trusting the event. */
const SEEKED_BACKSTOP_MS = 120;
/** A seek that reports nothing for this long is treated as lost, so the next one can start. */
const SEEK_TIMEOUT_MS = 1000;
const LOAD_TIMEOUT_MS = 6000;
const PRIME_AFTER_MS = 250;
const SAME_TIME_EPSILON = 1e-4;

export class VideoScrubber {
  private readonly options: VideoScrubberOptions;
  private readonly url: string;
  private readonly abort = new AbortController();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private loaded = false;
  private seeking = false;
  private seekToken = 0;
  private target = 0;
  private presentedIndex = -1;
  private dead = false;

  constructor(options: VideoScrubberOptions) {
    this.options = options;
    const { video } = options;
    const { signal } = this.abort;
    this.url = URL.createObjectURL(new Blob([options.bytes], { type: "video/mp4" }));

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("loadeddata", () => this.onLoaded(), { signal });
    video.addEventListener("error", () => this.fail(), { signal });
    video.addEventListener(
      "loadedmetadata",
      () => {
        // iOS Safari may not load frame data for a video that has never played. A muted
        // inline play/pause makes it do so; elsewhere `loadeddata` arrives first.
        this.after(PRIME_AFTER_MS, () => {
          if (this.loaded) return;
          video.play().then(
            () => video.pause(),
            () => {},
          );
        });
      },
      { signal },
    );
    this.after(LOAD_TIMEOUT_MS, () => {
      if (!this.loaded) this.fail();
    });
    video.src = this.url;
    video.load();
  }

  get presented(): number {
    return this.presentedIndex;
  }

  /** Asks for a frame index. Returns the index the element shows, or -1 before the first one. */
  present(target: number): number {
    if (this.dead) return this.presentedIndex;
    this.target = Math.min(this.options.frameCount - 1, Math.max(0, Math.round(target)));
    // One seek in flight at a time; when it lands the caller presents again with the walk's current frame.
    if (this.loaded && !this.seeking && this.target !== this.presentedIndex) this.seek(this.target);
    return this.presentedIndex;
  }

  /** The element holds no decoded-frame ring, so there is nothing to free off screen. */
  setNear(): void {}

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.abort.abort();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    const { video } = this.options;
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(this.url);
  }

  private onLoaded(): void {
    if (this.loaded || this.dead) return;
    this.loaded = true;
    this.options.video.pause();
    this.options.onFrame();
  }

  private seek(index: number): void {
    const { video, fps } = this.options;
    const token = ++this.seekToken;
    // Mid-frame, so rounding never lands on the neighbour.
    const time = (index + 0.5) / fps;
    this.seeking = true;

    const land = (painted: boolean) => {
      if (token !== this.seekToken || !this.seeking || this.dead) return;
      this.seeking = false;
      if (painted) this.presentedIndex = index;
      this.options.onFrame();
    };

    if (Math.abs(video.currentTime - time) < SAME_TIME_EPSILON) {
      // Already there: no `seeked` would fire.
      land(true);
      return;
    }
    const hasFrameCallback = typeof video.requestVideoFrameCallback === "function";
    // Safari reports seeks done before the frame is painted, so wait for the frame itself.
    if (hasFrameCallback) video.requestVideoFrameCallback(() => land(true));
    video.addEventListener(
      "seeked",
      () => {
        if (hasFrameCallback) this.after(SEEKED_BACKSTOP_MS, () => land(true));
        else land(true);
      },
      { once: true, signal: this.abort.signal },
    );
    this.after(SEEK_TIMEOUT_MS, () => land(false));
    video.currentTime = time;
  }

  private after(ms: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.dead) run();
    }, ms);
    this.timers.add(timer);
  }

  private fail(): void {
    if (this.dead) return;
    this.destroy();
    this.options.onFail();
  }
}
