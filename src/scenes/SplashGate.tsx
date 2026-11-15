"use client";

// The splash panel (playbook §7). It is in the server HTML, so it is there at the first paint;
// the CSS from `splashCss()` shows it only while the boot script's lock is on.

import { useRef, type CSSProperties, type ReactNode } from "react";
import { SPLASH_PANEL_ATTR } from "./boot-script";
import { useSplashGate, type SplashGateOptions, type SplashPhase } from "./use-splash-gate";

export type SplashRenderState = {
  /** 0..1 of the bytes the splash waits for. Also on the panel as `--splash-progress`. */
  progress: number;
  phase: SplashPhase;
  /** Same-session return: keep it brief. */
  quick: boolean;
};

export type SplashGateProps = SplashGateOptions & {
  /**
   * The splash visual: nodes, or a function of the gate's state (client components only).
   * Without children a minimal progress line is shown.
   */
  children?: ReactNode | ((state: SplashRenderState) => ReactNode);
  /** Accessible name of the panel. */
  label?: string;
  /** Text of the way out that appears when loading stalls. */
  continueLabel?: string;
  className?: string;
  continueClassName?: string;
};

const continueStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "12%",
  transform: "translateX(-50%)",
  padding: "0.75em 1.25em",
  background: "none",
  border: 0,
  color: "inherit",
  font: "inherit",
  textDecoration: "underline",
  cursor: "pointer",
};

function DefaultSplash({ progress }: { progress: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
      <div style={{ width: "min(40vw, 240px)", height: 2, background: "rgb(255 255 255 / 0.18)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            background: "currentColor",
            transformOrigin: "0 50%",
            transform: `scaleX(${progress})`,
            transition: "transform 300ms linear",
          }}
        />
      </div>
    </div>
  );
}

export function SplashGate({
  children,
  label = "Loading",
  continueLabel = "Continue without waiting",
  className,
  continueClassName,
  ...options
}: SplashGateProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const gate = useSplashGate(panelRef, options);
  if (gate.phase === "done") return null;

  const state: SplashRenderState = { progress: gate.progress, phase: gate.phase, quick: gate.quick };
  const panelStyle = {
    color: "#fff",
    opacity: gate.phase === "leaving" ? 0 : 1,
    transition: `opacity ${gate.exitMs}ms ease`,
    "--splash-progress": gate.progress,
  } as CSSProperties;

  return (
    <div
      ref={panelRef}
      {...{ [SPLASH_PANEL_ATTR]: "" }}
      data-phase={gate.phase}
      className={className}
      style={panelStyle}
    >
      {/* Its own element: a progressbar's children are hidden from assistive technology, and the way out must not be. */}
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(gate.progress * 100)} />
      {children === undefined ? <DefaultSplash progress={gate.progress} /> : typeof children === "function" ? children(state) : children}
      {gate.canContinue ? (
        <button type="button" className={continueClassName} style={continueClassName ? undefined : continueStyle} onClick={gate.continueNow}>
          {continueLabel}
        </button>
      ) : null}
    </div>
  );
}
