import type { ReactNode } from "react";

type Props = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  badge?: string;
  children: ReactNode;
};

// Label above, control, hint, then the error with its recovery text. The control should carry
// aria-describedby={`${htmlFor}-hint`} / `${htmlFor}-error` when those exist.
export function Field({ label, htmlFor, hint, error, badge, children }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-sm font-medium text-fg">
        <span>{label}</span>
        {badge ? <span className="text-sm font-normal text-muted">({badge})</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
