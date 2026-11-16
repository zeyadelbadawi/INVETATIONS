import type { Metadata } from "next";
import { connection } from "next/server";
import { Keeper } from "@/features/invite/entry/Keeper";

export const metadata: Metadata = { title: "أمين السر" };

// Rendered per request, never from a prerendered shell: the strict
// Content-Security-Policy (src/proxy.ts) puts a fresh nonce on every script,
// which a shell built ahead of time cannot carry (security rule 17, review F10).
export const instant = false;

// Secret keeper. The same page for everyone; the code is in the URL fragment and only the browser sees it.
export default async function KeeperPage() {
  await connection();
  return <Keeper />;
}
