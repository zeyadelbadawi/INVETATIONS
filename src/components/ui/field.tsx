import type { ReactNode } from "react";

type Props = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  badge?: string;
  children: ReactNode;
};

// Label, control, hint and error in one stack. The control should carry
// aria-describedby={`${htmlFor}-hint`} / `${htmlFor}-error` when those exist.
export function Field({ label, htmlFor, hint, error, badge, children }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-sm font-medium text-fg">
        <span>{label}</span>
        {badge ? <span className="text-xs font-normal text-muted">{badge}</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
