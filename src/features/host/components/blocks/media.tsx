"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { completeImageUpload, contentImageUrls, requestImageUpload } from "../../actions/media";
import type { HostErrorCode } from "../../lib/errors";
import { fmt } from "../../lib/text";
import { errorText, hostMessages } from "../../messages";
import { IconButton, move } from "../editor-parts";

// Uploading and showing the host's content images in the editor. Every photo
// is downscaled in the browser first (≤ 1600 px, WebP or JPEG), then put in the
// quarantine bucket and re-encoded on the server before anyone else sees it.

const MAX_EDGE = 1600;
const MAX_BYTES = 2_000_000;
// Signed thumbnail links last ten minutes; ask again a little before.
const RENEW_MS = 8 * 60 * 1000;

type UploadResult = { ok: true; mediaId: string } | { ok: false; message: string };

type MediaContextValue = {
  lang: Locale;
  urls: Record<string, string>;
  want: (ids: string[]) => void;
  upload: (file: File) => Promise<UploadResult>;
};

const MediaContext = createContext<MediaContextValue | null>(null);

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Decodes whatever the browser can read (including HEIC on iPhones), applies
// the orientation, scales to fit 1600 px and re-encodes. Location data and
// other metadata do not survive the canvas.
export async function downscaleImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const quality of [0.85, 0.75, 0.6]) {
    let blob = await toBlob(canvas, "image/webp", quality);
    // Browsers without a WebP encoder hand back PNG: use JPEG instead.
    if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("too_big");
}

export function EditorMediaProvider({ eventId, lang, children }: { eventId: string; lang: Locale; children: ReactNode }) {
  const t = hostMessages(lang);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [wanted, setWanted] = useState<string[]>([]);
  const asked = useRef(new Set<string>());

  const want = useCallback((ids: string[]) => {
    const fresh = ids.filter((id) => !asked.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) asked.current.add(id);
    setWanted((current) => [...current, ...fresh]);
  }, []);

  const wantedKey = wanted.join(",");
  useEffect(() => {
    if (wantedKey === "") return;
    let cancelled = false;
    const ids = wantedKey.split(",").slice(0, 100);
    contentImageUrls(eventId, ids)
      .then((result) => {
        if (cancelled || !result.ok) return;
        setUrls((current) => ({ ...current, ...result.urls }));
        setWanted((current) => current.filter((id) => !ids.includes(id)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eventId, wantedKey]);

  // Links expire: drop them and ask again for every image still in use.
  useEffect(() => {
    const timer = setInterval(() => {
      setUrls({});
      setWanted([...asked.current]);
    }, RENEW_MS);
    return () => clearInterval(timer);
  }, []);

  const upload = useCallback(
    async (file: File): Promise<UploadResult> => {
      let blob: Blob;
      try {
        blob = await downscaleImage(file);
      } catch (error) {
        return { ok: false, message: error instanceof Error && error.message === "too_big" ? t.images.tooBig : t.images.failed };
      }
      const failed = (code: HostErrorCode): UploadResult => ({
        ok: false,
        message: code === "too_many_rows" ? t.images.quota : code === "invalid" ? t.images.failed : errorText(t, code),
      });
      let slot: Awaited<ReturnType<typeof requestImageUpload>>;
      try {
        slot = await requestImageUpload(eventId, { bytes: blob.size, type: blob.type });
      } catch {
        return failed("unknown");
      }
      if (!slot.ok) return failed(slot.error);
      try {
        const put = await fetch(slot.uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": blob.type } });
        if (!put.ok) return failed("invalid");
      } catch {
        return failed("unknown");
      }
      let done: Awaited<ReturnType<typeof completeImageUpload>>;
      try {
        done = await completeImageUpload(eventId, slot.mediaId);
      } catch {
        return failed("unknown");
      }
      if (!done.ok) return failed(done.error);
      // Show the local copy straight away; the signed link replaces it on renewal.
      const local = URL.createObjectURL(blob);
      asked.current.add(done.mediaId);
      setUrls((current) => ({ ...current, [done.mediaId]: local }));
      return { ok: true, mediaId: done.mediaId };
    },
    [eventId, t],
  );

  const value = useMemo<MediaContextValue>(() => ({ lang, urls, want, upload }), [lang, urls, want, upload]);
  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}

function useEditorMedia(): MediaContextValue | null {
  return useContext(MediaContext);
}

// Keeps the newest props readable from an upload that finishes later, so a
// slow upload never brings back text the host has changed meanwhile.
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

function Thumb({ id, alt, urls }: { id: string; alt: string; urls: Record<string, string> }) {
  const url = urls[id];
  if (!url) return <span className="block size-full animate-pulse bg-line/40" aria-hidden="true" />;
  return (
    // A short-lived signed link (or a local object URL): no optimiser, no referrer.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} referrerPolicy="no-referrer" className="size-full object-cover" />
  );
}

function FilePicker({ label, multiple, disabled, onFiles }: { label: string; multiple?: boolean; disabled?: boolean; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      <Button variant="secondary" size="sm" disabled={disabled} aria-busy={disabled} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
}

// One optional photo: a person's photo or the link-preview image.
export function ImageField({ label, value, alt, onChange }: { label: string; value: string | null; alt: string; onChange: (id: string | null) => void }) {
  const media = useEditorMedia();
  const labelId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useLatest(onChange);
  const want = media?.want;
  useEffect(() => {
    if (value && want) want([value]);
  }, [value, want]);
  if (!media) return null;
  const t = hostMessages(media.lang).images;

  async function pick(files: File[]) {
    if (!media) return;
    setBusy(true);
    setError(null);
    const result = await media.upload(files[0]);
    setBusy(false);
    if (result.ok) latest.current(result.mediaId);
    else setError(result.message);
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <span className="block size-20 overflow-hidden rounded-control border border-line bg-surface">
          {value ? <Thumb id={value} alt={alt} urls={media.urls} /> : null}
        </span>
        <div className="flex flex-wrap gap-2">
          <FilePicker label={busy ? t.uploading : value ? t.replace : t.addPhoto} disabled={busy} onFiles={pick} />
          {value ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onChange(null)}>
              {t.remove}
            </Button>
          ) : null}
        </div>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-danger">
        {error ?? ""}
      </p>
    </div>
  );
}

// The gallery: add several at once, remove, reorder with buttons (keyboard and
// phone friendly), up to the schema's limit.
export function GalleryEditor({ images, max, onChange }: { images: string[]; max: number; onChange: (images: string[]) => void }) {
  const media = useEditorMedia();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useLatest({ images, onChange });
  const want = media?.want;
  const key = images.join(",");
  useEffect(() => {
    if (key && want) want(key.split(","));
  }, [key, want]);
  if (!media) return null;
  const t = hostMessages(media.lang);
  const i = t.images;

  async function add(files: File[]) {
    if (!media) return;
    setBusy(true);
    setError(null);
    const room = max - latest.current.images.length;
    let failure: string | null = null;
    for (const file of files.slice(0, Math.max(0, room))) {
      const result = await media.upload(file);
      if (result.ok) {
        const { images: current, onChange: commit } = latest.current;
        if (current.length < max && !current.includes(result.mediaId)) commit([...current, result.mediaId]);
      } else failure = result.message;
    }
    setBusy(false);
    setError(failure);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{i.galleryLead}</p>
      {images.length > 0 ? (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((id, index) => {
            const n = index + 1;
            return (
              <li key={id} className="flex flex-col gap-2 rounded-control border border-line bg-surface p-2">
                <span className="block aspect-square overflow-hidden rounded-control bg-raised">
                  <Thumb id={id} alt={fmt(i.photo, { n })} urls={media.urls} />
                </span>
                <div className="flex justify-between gap-1">
                  <IconButton label={fmt(i.moveEarlier, { n })} disabled={index === 0} onClick={() => onChange(move(images, index, -1))}>
                    ↑
                  </IconButton>
                  <IconButton label={fmt(i.moveLater, { n })} disabled={index === images.length - 1} onClick={() => onChange(move(images, index, 1))}>
                    ↓
                  </IconButton>
                  <IconButton label={fmt(i.removePhoto, { n })} onClick={() => onChange(images.filter((other) => other !== id))}>
                    ×
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {images.length < max ? <FilePicker label={busy ? i.uploading : i.addPhotos} multiple disabled={busy} onFiles={add} /> : null}
        <span className="text-sm text-muted">{fmt(i.count, { n: images.length, max })}</span>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-danger">
        {error ?? ""}
      </p>
    </div>
  );
}
