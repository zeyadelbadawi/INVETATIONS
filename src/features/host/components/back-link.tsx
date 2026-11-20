import type { Route } from "next";
import Link from "next/link";

// "Back to …" link above a page title. The arrow follows the reading direction.
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href as Route}
      className="-ms-1 inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-sm font-medium text-muted transition-colors duration-150 hover:text-fg sm:min-h-9"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M10 3.5 5.5 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}
