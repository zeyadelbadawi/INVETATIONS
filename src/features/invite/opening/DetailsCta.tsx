"use client";

import { useEffect, useState } from "react";
import { useInvite } from "../guest/GuestContext";

// The always-there way past the opening scene (launch scope §4). It is a plain
// in-page link, so it works before hydration. It steps aside once the guest is
// past the opening, and whenever the reply or the footer is on screen, so it
// never covers them (WCAG 2.4.11). It promises a reply only to visitors who
// can actually send one.
export function DetailsCta({ label, publicLabel }: { label: string; publicLabel: string }) {
  const { status, me, event } = useInvite();
  const [pastOpening, setPastOpening] = useState(false);
  const [covering, setCovering] = useState(false);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observers: IntersectionObserver[] = [];
    const scene = document.getElementById("opening");
    if (scene) {
      const observer = new IntersectionObserver((entries) => setPastOpening(!entries[entries.length - 1].isIntersecting), { rootMargin: "-25% 0px 0px 0px" });
      observer.observe(scene);
      observers.push(observer);
    }
    // The reply and the footer: hidden while either reaches the bottom band.
    const visible = new Set<Element>();
    const ends = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      setCovering(visible.size > 0);
    });
    const watch = () => {
      for (const element of document.querySelectorAll("#rsvp, .inv-foot")) ends.observe(element);
    };
    watch();
    // The reply section arrives after the session check: watch for it.
    const body = document.getElementById("details");
    const mutations = body ? new MutationObserver(watch) : null;
    if (body && mutations) mutations.observe(body, { childList: true });
    return () => {
      observers.forEach((observer) => observer.disconnect());
      ends.disconnect();
      mutations?.disconnect();
    };
  }, []);

  const canReply = status === "ready" && me !== null && me.rsvpOpen && event.status === "published";
  const away = pastOpening || covering;
  return (
    <a className="inv-cta" href="#details" data-away={away ? "true" : "false"} tabIndex={away ? -1 : 0} aria-hidden={away}>
      <span>{canReply ? label : publicLabel}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14M6 13l6 6 6-6" />
      </svg>
    </a>
  );
}
