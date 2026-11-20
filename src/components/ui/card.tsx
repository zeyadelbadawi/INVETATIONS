import type { HTMLAttributes, ReactNode } from "react";

// A raised panel. Use it to group controls that act together, not around every paragraph.
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-panel border border-line bg-raised p-4 sm:p-6 ${className}`} {...rest} />;
}

export function SectionHeading({ title, lead, id, action }: { title: string; lead?: string; id?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 max-w-prose">
        <h2 id={id} className="text-lg font-semibold leading-snug text-fg">
          {title}
        </h2>
        {lead ? <p className="mt-1 text-sm text-muted">{lead}</p> : null}
      </div>
      {action}
    </div>
  );
}

// A titled group of a working page: the title and its explanation at the start,
// the controls in one panel beside it on wide screens, below it on phones.
export function FormSection({
  title,
  lead,
  id,
  aside,
  children,
  bare = false,
}: {
  title: ReactNode;
  lead?: ReactNode;
  id?: string;
  aside?: ReactNode;
  children: ReactNode;
  // Content that brings its own structure (a table, a list) skips the panel padding.
  bare?: boolean;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[17rem_minmax(0,1fr)]">
      <div className="lg:pt-1">
        <h2 id={id} className="text-lg font-semibold leading-snug text-fg">
          {title}
        </h2>
        {lead ? <p className="mt-1 text-sm text-muted">{lead}</p> : null}
        {aside ? <div className="mt-3">{aside}</div> : null}
      </div>
      <div className={`min-w-0 rounded-panel border border-line bg-raised ${bare ? "overflow-hidden" : "p-4 sm:p-6"}`}>{children}</div>
    </section>
  );
}

// A page title with its one primary action on the same line.
export function PageTitle({ title, lead, action }: { title: ReactNode; lead?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight text-fg sm:text-[1.75rem]">{title}</h1>
        {lead ? <p className="mt-1.5 max-w-prose text-muted">{lead}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "info" | "success" | "danger";

const tones: Record<Tone, string> = {
  info: "border-line bg-raised text-fg",
  success: "border-primary/50 bg-primary/10 text-fg",
  danger: "border-danger/40 bg-danger/[0.06] text-danger",
};

// Status text. Errors interrupt (role=alert); the rest are announced politely.
export function Notice({ tone = "info", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0 rounded-control border px-4 py-3 text-sm leading-relaxed ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

// A state in words, coloured by meaning. No pill, no dot: the word carries it.
// success = live or done (accent ink), highlight = needs attention, danger = stopped or wrong.
export function Badge({ tone = "info", children }: { tone?: Tone | "highlight"; children: ReactNode }) {
  const cls =
    tone === "success"
      ? "text-accent-ink"
      : tone === "danger"
        ? "text-danger"
        : tone === "highlight"
          ? "text-fg underline decoration-primary decoration-2 underline-offset-4"
          : "text-muted";
  return <span className={`inline-block whitespace-nowrap text-sm font-medium ${cls}`}>{children}</span>;
}

// A row of label/value pairs, for summaries.
export function Facts({ items, className = "" }: { items: { label: string; value: ReactNode; wide?: boolean }[]; className?: string }) {
  return (
    <dl className={`grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3 ${className}`}>
      {items.map((item) => (
        <div key={item.label} className={item.wide ? "sm:col-span-2" : undefined}>
          <dt className="text-muted">{item.label}</dt>
          <dd className="mt-0.5 font-medium text-fg tabular-nums [overflow-wrap:anywhere]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
