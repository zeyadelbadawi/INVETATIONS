"use client";

import { useId, useState } from "react";

// Answer controls as guests use them in the product. Choosing one marks it, as
// in the invitation; nothing is sent anywhere.
export function AnswerSet({
  options,
  labelledBy,
  kind,
  marked,
  markedLabel,
}: {
  options: string[];
  labelledBy: string;
  kind: "quiz" | "vote" | "teams";
  /** Quiz only: the answer the couple gave, shown when the clock runs out or once a guest answers. */
  marked?: number;
  markedLabel?: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div role="group" aria-labelledby={labelledBy} className="mk-answers" data-kind={kind} data-answered={picked === null ? undefined : ""}>
      {options.map((option, index) => (
        <button
          key={option}
          type="button"
          aria-pressed={picked === index}
          onClick={() => setPicked(picked === index ? null : index)}
          className="mk-answer"
          data-marked={marked === index ? "" : undefined}
        >
          <span>{option}</span>
          {marked === index && markedLabel ? <span className="mk-answer__mark">{markedLabel}</span> : null}
        </button>
      ))}
    </div>
  );
}

// A guess on a scale, as the predictions game asks for numbers.
export function GuessSlider({ labelledBy, label, min, max, start, unit }: { labelledBy: string; label: string; min: number; max: number; start: number; unit: string }) {
  const [value, setValue] = useState(start);
  const id = useId();
  return (
    <div className="mk-slider">
      <output htmlFor={id} className="mk-slider__value" aria-live="polite">
        <span className="mk-slider__num">{value}</span> {unit}
      </output>
      <label htmlFor={id} className="mo-sr">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={5}
        value={value}
        aria-describedby={labelledBy}
        onChange={(event) => setValue(Number(event.target.value))}
        className="mk-slider__input"
      />
      <div className="mk-slider__ends" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
