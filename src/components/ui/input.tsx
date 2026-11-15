import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const controlClass =
  "block w-full min-h-11 rounded-xl border border-line bg-raised px-3 py-2 text-base text-fg " +
  "placeholder:text-muted/70 aria-[invalid=true]:border-danger disabled:opacity-60";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClass} ${className}`} {...rest} />;
}

export function Textarea({ className = "", rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`${controlClass} ${className}`} {...rest} />;
}

export function Select({ className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} ${className}`} {...rest} />;
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; hint?: string };

// A whole-row tap target for an on/off choice.
export function Checkbox({ label, hint, className = "", ...rest }: CheckboxProps) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-start gap-3 py-2 ${className}`}>
      <input type="checkbox" className="mt-1 size-5 shrink-0 accent-secondary" {...rest} />
      <span>
        <span className="block text-base text-fg">{label}</span>
        {hint ? <span className="block text-sm text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
