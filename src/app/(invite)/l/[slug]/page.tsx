import { Suspense } from "react";
import { LinkEntry } from "@/features/invite/entry/LinkEntry";

// Link entry. The server sends the same static shell for every link and does
// nothing else: the code is in the URL fragment and only the browser sees it.
export default function LinkEntryPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <LinkEntry />
    </Suspense>
  );
}
