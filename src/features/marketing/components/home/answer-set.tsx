"use client";

import { useState } from "react";

// Answer buttons as guests see them in the product. Choosing one marks it, as
// in the invitation; nothing is sent anywhere.
export function AnswerSet({ options, labelledBy, layout = "list" }: { options: string[]; labelledBy: string; layout?: "list" | "grid" | "pair" }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div role="group" aria-labelledby={labelledBy} className="mk-answers" data-layout={layout}>
      {options.map((option, index) => (
        <button key={option} type="button" aria-pressed={picked === index} onClick={() => setPicked(picked === index ? null : index)} className="mk-answer">
          {option}
        </button>
      ))}
    </div>
  );
}
