# Scroll primitives

Shared by the public site and the invitation (redesign plan §5). Import `./motion.css` once in the surface that uses them.

- `<Scrub range="enter|through|pin">` writes `--p` (0…1) on itself. Children style themselves from `--p` in CSS. Always read it as `var(--p, 1)`: without JS, before hydration and under reduced motion the value is 1 (final, readable state).
- `<Pinned lengthVh={280}>` is a tall track with a sticky 100svh stage; `--p` runs while the stage is pinned. Under reduced motion the element gets `data-still`, the track collapses and the stage stops sticking: style `[data-still]` so every step is visible at once.
- `<ScrubWords text source="p|hold|progress" from to>` reveals words with scroll. `source="hold"` reads a scroll scene's `--seq-hold`, `progress` its `--seq-progress`.
- Windows: put `--from` / `--to` on an element with `.mo-win` (gives `--q`) or `.mo-settle` (fade and settle).
- `--x-dir` gives horizontal travel in reading order (−1 LTR, 1 RTL).

Rules: animate only `opacity`, `transform`, `clip-path`, `filter` on small text. One `Scrub` per section, not per element. Controls (buttons, inputs) never move with scroll once they are reachable. Pins stay ≤ 300 vh unless the content needs more.
