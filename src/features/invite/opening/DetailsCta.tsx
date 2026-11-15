"use client";

import { useEffect, useState } from "react";

// The always-there way past the opening scene (launch scope §4). It is a plain
// in-page link, so it works before hydration; it steps aside once the guest is
// in the details.
export function DetailsCta({ label }: { label: string }) {
  const [away, setAway] = useState(false);
  useEffect(() => {
    const scene = document.getElementById("opening");
    if (!scene || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => setAway(!entries[entries.length - 1].isIntersecting), { rootMargin: "-25% 0px 0px 0px" });
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);
  return (
    <a className="inv-cta" href="#details" data-away={away ? "true" : "false"} tabIndex={away ? -1 : 0} aria-hidden={away}>
      {label}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14M6 13l6 6 6-6" />
      </svg>
    </a>
  );
}
