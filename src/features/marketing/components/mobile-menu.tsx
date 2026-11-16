"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Props = {
  openLabel: string;
  closeLabel: string;
  navLabel: string;
  links: { href: Route; label: string }[];
  children?: ReactNode;
};

// Disclosure menu for phones: the button toggles a panel under the header.
// Escape closes it and returns focus to the button; opening moves focus to the first link.
export function MobileMenu({ openLabel, closeLabel, navLabel, links, children }: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    }
    const desktop = window.matchMedia("(min-width: 768px)");
    const onWide = () => desktop.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    desktop.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      desktop.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-11 items-center justify-center rounded-full text-paper hover:bg-paper/10 md:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
        </svg>
      </button>
      <div
        ref={panel}
        id={id}
        hidden={!open}
        className="mk-menu absolute inset-x-0 top-full border-b border-[var(--mk-ink-line)] bg-ink px-4 pb-6 pt-2 shadow-2xl md:hidden"
      >
        <nav aria-label={navLabel}>
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href} className="border-b border-[var(--mk-ink-line)] last:border-0">
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-13 items-center text-lg font-medium text-paper"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </>
  );
}
