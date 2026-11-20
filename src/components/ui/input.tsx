import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// 16px text so phones never zoom into a field.
export const controlClass =
  "block w-full min-h-11 rounded-control border border-line bg-raised px-3 py-2 text-base text-fg " +
  "transition-[border-color] duration-150 hover:border-fg/30 focus:border-fg/60 " +
  "placeholder:text-muted/80 aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClass} ${className}`} {...rest} />;
}

export function Textarea({ className = "", rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`${controlClass} leading-relaxed ${className}`} {...rest} />;
}

export function Select({ className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} ${className}`} {...rest} />;
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; hint?: string };

// A whole-row tap target for an on/off choice.
export function Checkbox({ label, hint, className = "", ...rest }: CheckboxProps) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-start gap-3 py-3 ${className}`}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-fg" {...rest} />
      <span>
        <span className="block text-base text-fg">{label}</span>
        {hint ? <span className="mt-0.5 block text-sm text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

// Radio styled as a choice row: the native control stays visible so the selection is never only a colour.
export const choiceClass =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-line bg-raised p-3 " +
  "transition-[border-color,box-shadow] duration-150 hover:border-fg/30 " +
  "has-[:checked]:border-fg has-[:checked]:shadow-[inset_0_0_0_1px_var(--text)] " +
  "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2";
