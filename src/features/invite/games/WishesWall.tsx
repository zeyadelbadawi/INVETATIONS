"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getMessages } from "../messages";
import { Icon } from "../Icon";
import { useInvite } from "../guest/GuestContext";
import type { WallData } from "./types";

const MAX_SECONDS = 60;
const MAX_TEXT = 300;

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
        setClip(new Blob(chunks, { type: instance.mimeType || "audio/webm" }));
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

export function WishesWall({ wall }: { wall: WallData }) {
  const { locale, demo } = useInvite();
  const t = getMessages(locale);
  const fieldId = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const voice = useRecorder();
  const locked = busy || demo || !wall.canPost;

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (locked) return;
    setBusy(true);
    setError("");
    const result = voice.clip ? await wall.postVoice(voice.clip) : text.trim() ? await wall.postText(text.trim()) : null;
    setBusy(false);
    if (result?.ok) {
      setText("");
      voice.discard();
    } else if (result) setError(result.error === "slow_down" ? t.common.slowDown : t.common.error);
  };

  return (
    <section id="wall" className="inv-block inv-wall" aria-labelledby="wall-title" data-testid="wall">
      <h2 id="wall-title" className="inv-h2">
        {t.wall.title}
      </h2>
      <form className="inv-form" onSubmit={submit}>
        {voice.clip ? (
          <div className="inv-wall__clip">
            <audio controls src={URL.createObjectURL(voice.clip)} aria-label={t.wall.voiceReady} />
            <button type="button" className="inv-link" onClick={voice.discard}>
              {t.wall.discard}
            </button>
          </div>
        ) : (
          <label className="inv-field" htmlFor={fieldId}>
            <span className="inv-sr">{t.wall.label}</span>
            <textarea id={fieldId} className="inv-input" rows={3} maxLength={MAX_TEXT} placeholder={wall.canPost ? t.wall.placeholder : t.wall.joinToPost} value={text} onChange={(e) => setText(e.target.value)} disabled={locked || voice.seconds !== null} />
          </label>
        )}
        <div className="inv-actions">
          <button type="submit" className="inv-btn inv-btn--solid" disabled={locked || (!voice.clip && !text.trim())}>
            {t.wall.send}
          </button>
          {wall.voiceEnabled && voice.supported && !voice.clip ? (
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
        </div>
        <p className="inv-error" role="alert">
          {error || (voice.failed ? t.common.error : "")}
        </p>
      </form>

      {wall.posts.length === 0 ? (
        <p className="inv-hint">{t.wall.empty}</p>
      ) : (
        <ul className="inv-wishes">
          {wall.posts.map((post) => (
            <li key={post.id} className="inv-wish" data-status={post.status}>
              {post.kind === "voice" && post.audioUrl ? <audio controls preload="none" src={post.audioUrl} aria-label={`${t.wall.voice}: ${post.author}`} /> : <p className="inv-wish__text">{post.text}</p>}
              <p className="inv-wish__meta">
                <span>{post.author}</span>
                {post.status === "pending" ? <span className="inv-chip">{t.wall.pending}</span> : null}
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
