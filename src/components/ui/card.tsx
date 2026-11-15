import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-line bg-raised p-4 sm:p-6 ${className}`} {...rest} />;
}

export function SectionHeading({ title, lead, id }: { title: string; lead?: string; id?: string }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="text-lg font-semibold text-fg">
        {title}
      </h2>
      {lead ? <p className="mt-1 text-sm text-muted">{lead}</p> : null}
    </div>
  );
}

type Tone = "info" | "success" | "danger";

const tones: Record<Tone, string> = {
  info: "border-line bg-surface text-fg",
  success: "border-secondary/40 bg-secondary/10 text-fg",
  danger: "border-danger/40 bg-danger/5 text-danger",
};

// Status text. Errors interrupt (role=alert); the rest are announced politely.
export function Notice({ tone = "info", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({ tone = "info", children }: { tone?: Tone | "highlight"; children: ReactNode }) {
  const cls =
    tone === "highlight" ? "border-highlight/50 bg-highlight/20 text-fg" : tone === "info" ? "border-line bg-surface text-muted" : tones[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
