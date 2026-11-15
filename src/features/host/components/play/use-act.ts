"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Locale } from "@/i18n/config";
import { hostMessages } from "../../messages";

export type ActMessage = { tone: "success" | "danger"; text: string; issues?: string[] };

// Runs one of the control actions, shows what came of it and reloads the page's
// data. The actions throw when the caller is not allowed; that becomes a plain
// message here rather than an error screen.
export function useAct(lang: Locale) {
  const t = hostMessages(lang).play;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActMessage | null>(null);

  function act<T>(action: () => Promise<T>, done?: (result: T) => ActMessage | null | void) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        const next = done?.(result);
        if (next) setMessage(next);
        router.refresh();
      } catch {
        setMessage({ tone: "danger", text: t.failed });
      }
    });
  }

  return { act, pending, message, setMessage };
}

// The engine reports problems as { ok: false, issues }. Its wording is shown
// under a translated heading.
export function issuesOf(result: unknown): string[] | null {
  if (typeof result === "object" && result !== null && (result as { ok?: unknown }).ok === false) {
    const issues = (result as { issues?: unknown }).issues;
    return Array.isArray(issues) ? issues.filter((i): i is string => typeof i === "string").slice(0, 8) : [];
  }
  return null;
}
