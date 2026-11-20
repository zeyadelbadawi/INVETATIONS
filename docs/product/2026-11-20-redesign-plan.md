# Redesign plan — the whole UI and UX

Date: 2026-11-20. Owner request: the site and the product look generic; only the first section moves. Redo the full UI and UX, scroll-animated and cinematic from start to end of the public site, keep the three generated videos as they are, and **nothing may look AI-made** (binding rule, §2).

Footage is fixed: `wedding.doors`, `reveal.box`, `corporate.stage` (no new generation, no Magnific spend).
Security requirements and the launch scope still win over anything here. Brand stays swappable: `src/config/brand.ts` + `--brand-*` tokens only.

## 1. Visual thesis

**"The night of the event."** The public site is one walk through a celebration at night: the garden path to the doors, the sealed box, the hall. Darkness and warm practical light come from the footage itself; the interface takes its colour from the lanterns in the frames, not from a palette trend. Type does the heavy lifting; there is no decoration that does not come from the footage or carry information.

What we stop doing (seen on the current site): cream page + terracotta accent, dot-chips and floating pills on a fan of phones, "• label" eyebrows above every heading, identical cards with a coloured top bar, a three-dot timeline, the same fade-up on every block, star/dot dividers between invitation blocks, small flat white text laid directly on busy footage.

## 2. Binding rule — no AI look (skills: `no-ai-design-slop`, `audit-ai-design-slop`)

Every component, section and state passes the removal test before it ships. Banned unless a named job justifies it in review:

- Dot badges, status pills without live data, pulsing dots, chips floating over images.
- Eyebrow labels above headings (tracked caps or "• kicker" lines). Hierarchy comes from size, weight and placement.
- Icon tiles above feature headings; icon + heading + text card grids; bento grids.
- Cards inside cards; a card for every paragraph; a coloured stripe on a card edge; border + diffuse shadow on the same edge.
- Gradient text, radial glows with no light source, glass panels, decorative grids or noise.
- Fake proof: invented numbers, testimonials, logos, avatars, ratings, "trusted by".
- Identical entrance animation on every block; marquees; typing cursors; bounce easing on UI; scale-on-hover images.
- Default landing sequence for its own sake (hero → logos → features → testimonials → FAQ → CTA). Sections follow the product story.
- Em-dash cadence and slogan pairs in copy ("not X — Y"). Copy names a verb and an object.
- Pills for anything that is not a real tag, filter or status.

Allowed and expected: real product screens, real question-bank content, honest "sample" labels, asymmetry, large type, full-bleed footage, one strong motion idea per section.

## 3. Tokens

Brand tokens (swap point) in `src/app/globals.css`:

| Token | Value | Role |
|---|---|---|
| `--brand-night` | `#0e0c11` | Base surface of the public site and invitation splash |
| `--brand-dusk` | `#1a1720` | Raised surfaces on dark (forms, panels) |
| `--brand-bone` | `#ece5d8` | Text on dark (never a page background) |
| `--brand-lantern` | `#e7a74a` | The one accent: primary actions, live values, focus on dark |
| `--brand-ash` | `#9a9187` | Secondary text on dark (≥ 4.5:1 on night) |
| `--brand-slate` | `#7f93bd` | Secondary accent taken from the blue-hour sky: links on dark, info |

App surfaces (dashboard, editor, admin) use a light neutral system derived from the same tokens: `--app-bg #f3f3f1` (cool neutral, not cream), `--app-raised #ffffff`, `--app-ink #141218`, `--app-line #e2e1dd`, `--app-muted #5f5b63`, accent = lantern darkened for contrast on white (`#a8641a`) for links/selected, primary buttons ink-filled.

Legacy aliases (`--brand-ink`, `--brand-paper`, `--brand-primary`, `--brand-secondary`, `--brand-highlight`) stay mapped to the new values so nothing breaks, then are removed from components as they are touched.

Radii: 6 px controls, 12 px panels, full round only for avatars and the team bar. Shadows: one elevation step for menus and dialogs only. Spacing: 4-pt scale; marketing sections vary their padding by content.

## 4. Type

- **Display (public site, AR + EN):** Alexandria (variable, Arabic + Latin, one family so both languages carry equal weight). Weights 300 for very large lines (≥ 64 px), 700–800 for headlines. Tracking −0.01 em ≥ 24 px; Arabic gets 0.
- **UI and body:** IBM Plex Sans Arabic (already the platform face), 400/500/600, body 1rem/1.6 (1.0625rem on marketing), measure ≤ 65 ch.
- **Invitation names:** stay on each template's font pair (Aref Ruqaa / Gloock) — that is the product, not the site.
- Role scale (fluid with `clamp`): display-xl 3.5→9 rem/1.0, display 2.5→5.5 rem/1.05, h2 1.75→3 rem/1.15, h3 1.25→1.5 rem/1.3, body, small 0.875 rem, caption 0.8125 rem. Tabular numerals on prices, countdowns, scores.
- `text-wrap: balance` on headings, `pretty` on paragraphs. No all-caps. No eyebrow lines.

## 5. Motion system (skills: `cinematic-gsap-lenis-motion-system`, `scroll-scrubbed-visual-sequence`, `scroll-scrubbed-word-reveal`, `gsap-*`, `design-motion-principles`)

One engine: Lenis + GSAP ScrollTrigger through the existing `MotionProvider` (playbook). Motion explains: chronology (before → day → after), causality (join a team → bar moves), space (walking toward the doors), reveal (box → answer). Every effect is **scrubbed by scroll** on the public site, so it reverses when scrolling up.

Primitives in `src/features/motion/` (new, shared by marketing and invitation):

- `useScrub(ref, { start, end })` → writes `--p` (0…1) on the element; all visuals are CSS reading `--p`. One ScrollTrigger per section, no per-letter tweens.
- `<Pinned heightVh>` → sticky stage of N viewports with `--p`; children compute their own windows with `calc()`.
- `<ScrubWords>` → word-by-word reveal by scroll (accessible: full sentence in one text node for AT; split spans `aria-hidden`).
- `<ScrubImage>` → image scale/position by `--p` (poster stills from the scenes).
- Static guarantees: **without JS the default is `--p: 1`** (final state, everything readable); `prefers-reduced-motion` keeps `--p: 1`, removes pinning (`position: static`) and shows the final frame of each scene; keyboard focus inside a pinned stage scrolls it into the readable window.
- Budgets: ≤ 6 ScrollTriggers per page section group, transforms/opacity/clip-path only, no layout animation, `will-change` only during active pin. Long pins capped at 300 vh so the visitor is never trapped.

## 6. Public site

### 6.1 Header and footer
Header: wordmark at the start, three links (occasions, how it works, prices), language switch, "login" as text, one primary button. Transparent over footage, solid night after the first scene (scrubbed, no jump). Mobile: full-screen menu sheet, large type links, focus-trapped. Footer: plain columns on night, no icon tiles.

### 6.2 Home — the walk (AR copy first, EN equal)
1. **Scene I — `wedding.doors` (gate + splash).** During the approach two short lines scrub in and out over the darker centre band with a real scrim (radial darkening behind text, not a glow). On the hold: display-xl headline, one sentence, primary + secondary action. This is the only splash.
2. **What the guest gets — pinned phone sequence (DOM, 280 vh).** One real phone screen (existing product screenshots) that changes as you scroll: opening → details & RSVP → pick a team → live scoreboard. Beside it (below it on phones) the matching sentence replaces the previous one; a thin progress rail on the edge shows where you are. No floating chips.
3. **Scene II — `reveal.box`.** During the turn: "ولد ولا بنت؟" scrubbed word by word. On the hold: the two team words slide in from both sides and a tug-of-war bar fills by scroll; one line states the truth: the answer is sealed until the moment, even from us.
4. **Games — horizontal pinned track.** Vertical scroll moves a row of four full-height panels (quiz, vote, predictions, clues). Each panel shows a real question from the bank and its answer buttons as they render in the product, plus one line on how it plays. Different compositions per panel, same type system.
5. **Scene III — `corporate.stage`.** Copy for companies scrubbed over the approach; on the hold a short list of what companies get, revealed line by line.
6. **One link, before / during / after.** A single line draws across the section by scroll; three stops light up as the line reaches them, each with its two or three concrete items.
7. **Privacy.** A manifesto paragraph revealed word by word (`ScrubWords`): who sees the address, codes in the link, nothing sold. Plain text, large.
8. **Two ways to make it.** Split screen (do it yourself / we make it for you); the divider moves with scroll, the side in focus grows. Each side ends with its own action.
9. **Prices.** Three plans as a typographic comparison table (not three cards), the recommended plan marked by a heading row and its difference in words. Link to full pricing.
10. **Questions.** `<details>` list, generous spacing, no boxes.
11. **Finale.** The doors' last frame full-bleed, scaled back slowly with scroll as the closing shot; headline + primary action.

### 6.3 How it works
Pinned five-step story: the editor screens advance by scroll beside the step text (same `Pinned` primitive), ending with publish → share link.

### 6.4 Pricing
Comparison table with sticky plan header on desktop, stacked plan sections on phones; paid add-ons and done-for-you as plain rows; FAQ for billing. Background: the stage's last frame, heavily darkened, scaled by scroll at the top only.

### 6.5 Auth (login, signup, claim)
Split screen: the form on night at the start side, a still from the doors scene at the other side (phones: a short still band on top). Inputs 16 px, labels above, errors inline with recovery text.

## 7. Invitation (guest pages)

- **Text over footage (the complaint):** a real scrim per slot — a soft dark ellipse behind the copy band that grows with `--seq-hold` — plus a two-layer text shadow tuned to the frames. Names become much larger (clamp 3.5→8 rem, fit-scaling kept for long names), set on two lines with a hairline between them that draws on the hold. Eyebrow (greeting) and date line move to the UI face at weight 500, size up to 1.125 rem, no tracking. Each line enters on its own window of the hold (eyebrow → names → line → date), scrubbed so scrolling back reverses it.
- **After the scene:** the body continues on the template palette but each block gets a motion that explains it, by CSS scroll-driven animation (`animation-timeline: view()`, wrapped in `@supports` so other browsers show the static final state): countdown digits settle in, programme time line draws and passed items light up, gallery photos move at two depths, map card slides from the side. RSVP, join and game controls never move.
- Remove the star/dot dividers between blocks; spacing and the template's display face separate sections.
- Splash monogram, reveal, games: restyled with the new type roles; behaviour unchanged.
- Cached-shell rule unchanged: all of this is static CSS/JS in the shell; guest-only blocks still come from `/me`.

## 8. App surfaces (dashboard, editor, admin, control)

No scroll theatrics here (they slow work; UX heuristic: efficiency of use). New light neutral system (§3), ink sidebar/top bar, clear active states, consistent buttons (primary ink, secondary outline, destructive red with confirm), tables with tabular numbers, empty states that point to the next action, inline errors with recovery. Motion: 150–200 ms state transitions only (panel open, toast, saved). Remove pills that are not statuses; statuses keep text + colour.

## 9. Phases and ownership

1. **Foundation (lead):** tokens, fonts, motion primitives, shared button/link styles, marketing shell with `MotionProvider`.
2. **In parallel, by folder ownership:**
   - A — public site: `src/features/marketing/**`, `src/app/(site)/[lang]/{page,pricing,how-it-works}`, marketing e2e.
   - B — invitation: `src/features/invite/**`, `src/templates/registry.ts` overlay positions, invite e2e screenshots.
   - C — app surfaces + auth: `src/features/{host,admin,control}/**`, `src/components/ui/**`, auth pages.
3. **Reviews:** UI — `web-design-guidelines`, `design-critique`, `audit-ai-design-slop`, `accessibility`; UX — `ux-heuristics`. Every finding fixed or answered.
4. **Verify:** typecheck, lint, vitest, invite + marketing e2e, build, Playwright screenshots desktop/phone, reduced motion, no-JS, keyboard; deploy to Vercel.

## 10. Acceptance

- Every public section moves with scroll and reverses; none is a plain static block.
- Text over footage passes 4.5:1 on its worst frame (measured on the poster and last frame).
- No item from §2 survives the audit.
- Reduced motion and no-JS show complete, readable pages; keyboard reaches every action; no horizontal scroll at 360 px.
- Home LCP is the first scene poster; mobile video download ≤ 7 MB total, scenes II and III start loading only when near.
- Existing tests stay green (vitest, invite e2e, marketing e2e updated for the new structure).

## 11. Revision after the plan review (2026-11-20) — these lines override the sections above

**Player and loading**
- The player queues every scene on the page in order, right after the first paint. That is accepted: scene I first, then II and III in sequence. Phones download 2.81 + 1.79 + 1.97 = 6.57 MB, which is inside the 7 MB budget. "Load only when near" is dropped.
- Posters are the first frame. Last-frame stills (`last.avif` / `last.webp`) are now pulled from the existing mp4s, with no new footage, and listed as `poster.last` in each manifest. The still version of a scene (reduced motion, STATIC/LOW tier) shows the last frame under the copy in its final state. Closing shots and auth/pricing backdrops use these stills. `build-video.mjs` produces them from now on.
- The home page is **not gated**. The first scene's poster is the LCP image and scrubbing starts when the video is ready. Invitations keep their splash gate.
- Pins use native `position: sticky` only. There is no GSAP `pin`. Variable names: video scenes keep `--seq-progress` / `--seq-hold`, and non-video sections use `--p` from `src/features/motion`.
- Without JS, `--p` falls back to 1, so content is never hidden. The rule is that nothing in the **first viewport** of any page is scrubbed, apart from what sits inside a scene. That avoids the snap when JS takes over.

**Palette, sampled from the frames** (values recorded in `globals.css`)
- night `#0a0d0c` (green-black of the garden and the hall), dusk `#151917`, bone `#efe4d3` (box ribbon highlight), ash `#98a19b` (stone), lantern `#cc8d35` (lantern flame, saturated pixels of the doors and the hall), twilight `#93a2ad` (blue-hour sky).
- Contrast on night: bone 15.5, ash 7.4, lantern 6.9, twilight 7.5. Lantern on light needs `--accent-ink #8a5419` (6.2:1 on white).

**Type:** Alexandria is for display only. Body and UI stay on IBM Plex Sans Arabic. Contrast comes from size and weight: display 700–800 against body 400, with no light display weights under 64 px. Aref Ruqaa and Gloock leave the marketing pages and stay only inside invitation screenshots and templates.

**Cut from the plan, because each still reads as a template:** the three-stop line in "before/during/after", the progress rail beside the phone, the moving split divider, gallery parallax, the slow zoom-out finale, the stacked text-shadow on the invitation, and scroll-scrubbed countdown digits.

**Word-by-word reveal appears once on the whole site:** the scene II question. Every other section uses a different motion idea that fits what it says:
- Scene I hold: the copy is set *inside the doorway* of the last frame (on desktop the headline sits in the lit gap, with the action under it on the path). It is not a generic centred hero block.
- Guest sequence (pinned): the phone screen changes by scroll, and the sentence beside it is swapped. No rail.
- Scene II: the question is revealed word by word. On the hold, the two team names come in from opposite sides and the bar fills.
- Games: a horizontal track. Its direction follows the reading order (`--x-dir`); keyboard focus inside a panel scrolls that panel into view.
- Scene III: the list for companies, line by line, over the hold.
- Before/during/after: three columns of real items. Each column slides in from the reading-start side as it enters (CSS `view()`, not pinned).
- Privacy: one statement, large and static, next to a real screen of the link-entry page. **No manifesto reveal.**
- Two ways to make it: two plain blocks side by side. The "we make it" block carries the box's last frame as a quiet image. They enter with the same `view()` slide as the three columns.
- **Prices and questions are static by design**, because reference content stays still (ux-heuristics, design-motion-principles).
- Finale: the doors' last frame, full-bleed and still, with the headline and action in the doorway. No zoom.

**Scroll budget:** home is at most about 14 screens on a phone and 12 on desktop. The pinned/scene lengths are scene I 260+80 vh, the guest sequence 240 vh, scene II 220+60 vh, the games track 240 vh and scene III 200+60 vh. Everything else flows normally.

**RTL:** every horizontal move uses `--x-dir` or logical properties (`inset-inline-start`). Slide-ins come from the reading-start side.

**Header over footage:** a solid band of night at 0.0 alpha with a short gradient scrim (night → transparent) under it while over a scene, and solid night after the first scene. It is the same element throughout and changes only its background opacity by `--p`. There is no brightness detection.

**Invitation:** a real scrim per copy band (a soft dark ellipse that grows with `--seq-hold`) and **no text shadows**. The countdown keeps its own clock motion and is not scrubbed. The `view()` animations attach only to blocks in the cached shell, and to `/me` blocks after they are inserted. They live inside `@supports (animation-timeline: view())` and are turned off under reduced motion.

**Screenshots:** marketing screenshots are re-captured after the invitation work, in both languages, including a team-pick screen. Phase A builds with the current images and swaps them at the end.

**Budgets:** initial JS on the home page stays under 180 KB gzipped (GSAP and Lenis are already loaded lazily). The phone ring is 18 frames, and the player's observer frees far scenes.
