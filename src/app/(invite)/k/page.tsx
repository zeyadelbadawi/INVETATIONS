import type { Metadata } from "next";
import { Keeper } from "@/features/invite/entry/Keeper";

export const metadata: Metadata = { title: "أمين السر" };

// Secret keeper. A static shell; the code is in the URL fragment and only the browser sees it.
export default function KeeperPage() {
  return <Keeper />;
}
