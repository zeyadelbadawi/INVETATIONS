"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Notice } from "@/components/ui/card";

const FlashContext = createContext<(text: string) => void>(() => undefined);

// A confirmation that outlives the row it came from: approving an order or
// marking it refunded refreshes the page and the row disappears, so the
// message is held here, above the list, until dismissed.
export function FlashProvider({ dismissLabel, children }: { dismissLabel: string; children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <FlashContext value={setText}>
      <div aria-live="polite" className="empty:hidden">
        {text ? (
          <Notice tone="success" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="min-w-0">{text}</span>
            <button
              type="button"
              onClick={() => setText(null)}
              className="min-h-11 rounded-control px-2 text-sm font-medium underline underline-offset-4 sm:min-h-9"
            >
              {dismissLabel}
            </button>
          </Notice>
        ) : null}
      </div>
      {children}
    </FlashContext>
  );
}

export function useFlash(): (text: string) => void {
  return useContext(FlashContext);
}
