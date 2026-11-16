"use client";

import { useState, type CSSProperties } from "react";

type Labels = {
  label: string;
  question: string;
  him: string;
  her: string;
  prompt: string;
  room: string;
  couple: string;
  voted: string;
  again: string;
  sample: string;
};

// Sample votes so the result has something to show; labelled as a demo on screen.
const SAMPLE = { him: 23, her: 14 };

// A playable miniature of مين فيهم؟: vote, then see the room and the couple's answer.
export function WhoDemo({ labels }: { labels: Labels }) {
  const [vote, setVote] = useState<"him" | "her" | null>(null);
  const him = SAMPLE.him + (vote === "him" ? 1 : 0);
  const her = SAMPLE.her + (vote === "her" ? 1 : 0);
  const total = him + her;
  const rows = [
    { key: "him" as const, label: labels.him, count: him, tone: "bg-primary" },
    { key: "her" as const, label: labels.her, count: her, tone: "bg-secondary" },
  ];

  return (
    <div className="rounded-[1.75rem] bg-ink p-6 text-paper shadow-[0_30px_60px_-30px_var(--brand-ink)] md:p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-highlight">{labels.label}</p>
        <p className="text-xs text-paper/60">{labels.sample}</p>
      </div>
      <p id="who-q" className="mk-display mt-4 text-[1.875rem] md:text-[2.25rem]">
        {labels.question}
      </p>
      <div role="group" aria-labelledby="who-q" className="mt-6 grid grid-cols-2 gap-3">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            aria-pressed={vote === row.key}
            onClick={() => setVote(row.key)}
            className="min-h-13 rounded-full border border-paper/30 text-lg font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] aria-pressed:border-paper aria-pressed:bg-paper aria-pressed:text-ink"
          >
            {row.label}
          </button>
        ))}
      </div>
      <div className="mt-6" aria-live="polite">
        {vote === null ? (
          <p className="text-sm text-paper/70">{labels.prompt}</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-paper/80">{labels.room}</p>
            <ul className="mt-3 space-y-3">
              {rows.map((row) => {
                const share = row.count / total;
                return (
                  <li key={row.key}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{row.label}</span>
                      <span className="mk-num text-xl">{Math.round(share * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper/15">
                      <div className={`mk-bar h-full rounded-full ${row.tone}`} style={{ "--mk-share": share } as CSSProperties} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-base font-semibold text-highlight">{labels.couple}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-paper/70">{labels.voted}</p>
              <button
                type="button"
                onClick={() => setVote(null)}
                className="min-h-11 rounded-full px-3 text-sm font-medium text-paper/80 underline underline-offset-4 hover:text-paper"
              >
                {labels.again}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
