import { connection } from "next/server";
import { Suspense } from "react";
import { LinkEntry } from "@/features/invite/entry/LinkEntry";

// Rendered per request, never from a prerendered shell: the strict
// Content-Security-Policy (src/proxy.ts) puts a fresh nonce on every script,
// which a shell built ahead of time cannot carry (security rule 17, review F10).
export const instant = false;

// Link entry. The server sends the same page for every link and does nothing
// else: the code is in the URL fragment and only the browser sees it.
export default async function LinkEntryPage() {
  await connection();
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <LinkEntry />
    </Suspense>
  );
}
