"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getMessages } from "../messages";
import { Icon } from "../Icon";
import { useInvite } from "../guest/GuestContext";
import type { WallData } from "./types";

const MAX_SECONDS = 60;
const MAX_TEXT = 600;
const MAX_EDGE = 1600;
const MAX_BYTES = 2_000_000;

function useRecorder() {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [clip, setClip] = useState<Blob | null>(null);
  const [failed, setFailed] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const stop = () => {
    clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  useEffect(() => stop, []);

  const start = async () => {
    setFailed(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const instance = new MediaRecorder(stream);
      recorder.current = instance;
      instance.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
      instance.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setSeconds(null);
        setClip(new Blob(chunks, { type: (instance.mimeType || "audio/webm").split(";")[0] }));
      };
      instance.start();
      const began = Date.now();
      setSeconds(0);
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      setFailed(true);
    }
  };
  return { seconds, clip, failed, start, stop, discard: () => setClip(null), supported: typeof window !== "undefined" && "MediaRecorder" in window };
}

// Shrinks a photo in the browser before upload: long edge 1600 px, re-encoded,
// which also drops the EXIF block (location) the camera wrote (technical design §9).
export async function downscalePhoto(file: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (const quality of [0.82, 0.68, 0.5]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
    return null;
  } catch {
    return null;
  }
}

export function WishesWall({ wall }: { wall: WallData }) {
  const { locale, demo } = useInvite();
  const t = getMessages(locale);
  const fieldId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const voice = useRecorder();
  const locked = busy || demo || !wall.canPost;
  const clipUrl = useMemo(() => (voice.clip ? URL.createObjectURL(voice.clip) : null), [voice.clip]);
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (clipUrl && URL.revokeObjectURL(clipUrl)), [clipUrl]);
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl]);

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    const small = await downscalePhoto(file);
    if (small) setPhoto(small);
    else setError(t.wall.photoFailed);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (locked) return;
    setBusy(true);
    setError("");
    const body = text.trim();
    const result = voice.clip ? await wall.postMedia("wall_voice", voice.clip, "") : photo ? await wall.postMedia("wall_photo", photo, body.slice(0, 200)) : body ? await wall.postText(body) : null;
    setBusy(false);
    if (result?.ok) {
      setText("");
      setPhoto(null);
      voice.discard();
    } else if (result) setError(result.error === "slow_down" ? t.common.slowDown : result.error === "quota" ? t.wall.quota : t.common.error);
  };

  const attaching = voice.clip !== null || photo !== null;
  return (
    <section id="wall" className="inv-block inv-wall" aria-labelledby="wall-title" data-testid="wall">
      <h2 id="wall-title" className="inv-h2">
        {t.wall.title}
      </h2>
      <form className="inv-form" onSubmit={submit}>
        {clipUrl ? (
          <div className="inv-wall__clip">
            <audio controls src={clipUrl} aria-label={t.wall.voiceReady} />
            <button type="button" className="inv-link" onClick={voice.discard}>
              {t.wall.discard}
            </button>
          </div>
        ) : null}
        {photoUrl ? (
          <div className="inv-wall__clip">
            {/* A local preview of the guest's own file; next/image cannot optimise a blob URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="inv-wall__photo" src={photoUrl} alt={t.wall.photoReady} width={320} height={240} />
            <button type="button" className="inv-link" onClick={() => setPhoto(null)}>
              {t.wall.discardPhoto}
            </button>
          </div>
        ) : null}
        {voice.clip ? null : (
          <label className="inv-field" htmlFor={fieldId}>
            <span className="inv-sr">{photo ? t.wall.caption : t.wall.label}</span>
            <textarea id={fieldId} className="inv-input" rows={photo ? 2 : 3} maxLength={photo ? 200 : MAX_TEXT} placeholder={photo ? t.wall.caption : t.wall.placeholder} value={text} onChange={(e) => setText(e.target.value)} disabled={locked || voice.seconds !== null} />
          </label>
        )}
        <div className="inv-actions">
          <button type="submit" className="inv-btn inv-btn--solid" disabled={locked || (!attaching && !text.trim())}>
            {busy ? t.wall.sending : t.wall.send}
          </button>
          {wall.voiceEnabled && voice.supported && !attaching ? (
            voice.seconds === null ? (
              <button type="button" className="inv-btn" onClick={voice.start} disabled={locked}>
                <Icon name="mic" /> {t.wall.record}
              </button>
            ) : (
              <button type="button" className="inv-btn inv-btn--recording" onClick={voice.stop}>
                <span className="inv-rec" aria-hidden="true" /> {t.wall.stop}
                <span className="inv-num" role="timer">
                  {" "}
                  {t.wall.recording(voice.seconds)}
                </span>
              </button>
            )
          ) : null}
          {wall.photosEnabled && !attaching && voice.seconds === null ? (
            <>
              <input ref={fileRef} className="inv-sr" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-hidden="true" onChange={(e) => choosePhoto(e.target.files?.[0])} data-testid="wall-file" />
              <button type="button" className="inv-btn" onClick={() => fileRef.current?.click()} disabled={locked}>
                <Icon name="plus" /> {t.wall.photo}
              </button>
            </>
          ) : null}
        </div>
        <p className="inv-error" role="alert">
          {error || (voice.failed ? t.wall.micFailed : "")}
        </p>
      </form>

      {wall.posts.length === 0 ? (
        <p className="inv-hint">{t.wall.empty}</p>
      ) : (
        <ul className="inv-wishes">
          {wall.posts.map((post) => (
            <li key={post.id} className="inv-wish" data-status={post.status} data-testid="wish">
              {post.kind === "voice" && post.mediaUrl ? <audio controls preload="none" src={post.mediaUrl} aria-label={`${t.wall.voice}: ${post.author}`} /> : null}
              {post.kind === "photo" && post.mediaUrl ? (
                // Signed, short-lived URL on the storage host.
                // eslint-disable-next-line @next/next/no-img-element
                <img className="inv-wall__photo" src={post.mediaUrl} alt={post.body || t.wall.photoBy(post.author)} width={320} height={240} loading="lazy" decoding="async" />
              ) : null}
              {post.kind !== "text" && !post.mediaUrl ? <p className="inv-hint">{post.kind === "voice" ? t.wall.voice : t.wall.photo}</p> : null}
              {post.body ? <p className={post.kind === "text" ? "inv-wish__text" : "inv-text"}>{post.body}</p> : null}
              <p className="inv-wish__meta">
                <span>{post.author}</span>
                {post.status === "pending" ? <span className="inv-status" data-state="pending">{t.wall.pending}</span> : null}
                {!post.mine && post.status === "visible" ? (
                  <button type="button" className="inv-link inv-wish__report" onClick={() => wall.report(post.id)} disabled={demo}>
                    {t.wall.report}
                  </button>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
