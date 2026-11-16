"use client";

import { useState, useTransition } from "react";
import type { Locale } from "@/i18n/config";
import type { AdminResult } from "../lib/errors";
import { adminMessages } from "../messages";

export type Feedback = { tone: "success" | "danger"; text: string } | null;

// Runs an admin action and turns its result into a message for the person.
export function useAdminAction(lang: Locale) {
  const t = adminMessages(lang);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  function act<T extends object>(action: () => Promise<AdminResult<T>>, success?: (result: { ok: true } & T) => string | null) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false as const, error: "unknown" as const }));
      if (!result.ok) {
        setFeedback({ tone: "danger", text: t.errors[result.error] ?? t.errors.unknown });
        return;
      }
      const text = success?.(result) ?? null;
      if (text) setFeedback({ tone: "success", text });
    });
  }

  return { act, pending, feedback, setFeedback };
}
