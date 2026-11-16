# Scene plan — launch templates (Phase 7) ⛔ awaiting approval

Date: 2026-11-16. Method: `docs/playbooks/scroll-animation-playbook.md`. Nothing is generated until the owner approves this plan and the cost of each job.

## Constraints from the product

- **One opening scene per template** at launch (launch scope §3), 16:9 source → desktop 16:9 + phone 4:5 crop. The scene gates the splash; budget ≈ 3 MB per scene on phones.
- **No text, letters, numbers, logos, screens with content or readable faces in the footage** (playbook rule 2). Names, dates and logos are HTML overlays from the template, so one scene serves every customer.
- **Every scene must leave a calm, darker centre band** (about 30–65% of the height) for the names, because overlays sit centred on both the 16:9 and the 4:5 crop.
- **The gender-reveal footage is answer-neutral**: no pink, no blue, nothing that hints at either result. The colour is applied in HTML after the database releases the answer (security R1).
- **No people as subjects** (no faces); hands at most.
- **Contrasting moves** across templates so they don't read as "the same idea".

## Shared style block (in every prompt)

```
Low-key cinematic editorial photography, warm practical light, rich blacks, fine film grain,
35mm lens unless stated, shallow depth of field, Egyptian contemporary interior details
(brass, carved wood, mashrabiya patterns, jasmine), a thin blade of warm gold light crossing
the frame at about 50 degrees as a recurring motif. The centre band of the frame, from 30% to
65% of the height, stays calm, darker and uncluttered to hold headline text.
Absolutely no text, letters, numbers, logos, labels, signs, screens with content or readable
faces anywhere in the image.
```

## The four scenes

| Template | Scene id | Story beat | Start frame | End frame | Camera move | Copy over it |
|---|---|---|---|---|---|---|
| Wedding — Garden doors | `wedding.doors` | "You're invited in" | Blue hour, a garden path lined with brass lanterns, tall carved wooden doors far ahead, slightly ajar | The doors fill the frame, warm light spilling through the gap, jasmine on the frame | **Approach**: slow dolly forward along the path, 10 s; the whole picture expands from the centre | Opening line at the start; names and date line in the hold |
| Wedding — The table | `wedding.table` | "The night is ready" | Close-up of an unmarked wax-sealed envelope on ivory linen beside a jasmine sprig and a lit candle | Wide view of a long reception table set for a night celebration — candles, roses, brass — in a dim hall | **Reveal**: pull back and rise, 10 s; nothing appears from nowhere | Names on the hold, over the darker upper part of the hall |
| Gender reveal — The sealed box | `reveal.box` | "Who's inside?" | A softly lit room, a large ivory gift box tied with an ivory ribbon on a low table, cream and gold balloons drifting behind | The box centred and closer, a warm neutral glow leaking from under the lid | **Turn + push**: slow 30° orbit ending in a gentle push-in, 10 s | Opening line ("ولد ولا بنت؟") at the start; parents' names in the hold. Pink/blue appear only in the HTML reveal |
| Corporate — The stage | `corporate.stage` | "Take your seat" | An empty modern venue entrance, soft haze, warm uplights, rows of chairs beyond | The stage centred, a large **blank, dark** screen behind it, low haze, a single warm spotlight | **Approach**: glide from the entrance down the aisle to the stage, 10 s | Company name, event title and date over the blank screen area in the hold |

Scroll settings for all four: lead 0 vh, move 260 vh, hold 80 vh, `gate: true` (the only gating scene on the page).

## Generation steps per scene (playbook §3.2)

1. End frame first (the hero picture) — Nano Banana 2.1, 2K, 16:9.
2. Start frame from the end frame as the reference ("the same place, from …") — Nano Banana 2.1, 2K.
3. Review both frames with the owner (contact sheet) ⛔.
4. Shot from start to end — Kling 3.0 with start + end frame, mode 4K, 10 s, **sound off**.
5. Review the shot: no lettering, even motion, right direction, no morphing, room for copy ⛔.
6. Encode with `tools/sequences/build-video.mjs` (desktop + 4:5 mobile, GOP 6, no B-frames, timing curve, decode index), upload to R2 in a revision folder, point the template at it.

## Cost estimate (to be confirmed by the tool's own estimate before every job)

Unit prices are the ones recorded in the playbook for 2026; the live quote may differ.

| Item | Unit | Per scene, no retries | Per scene, realistic (2 frame retries, 1 shot retry) |
|---|---|---|---|
| Keyframes, Nano Banana 2.1 2K | 2 credits | 2 frames = 4 | 4 frames = 8 |
| Shot, Kling 3.0 4K 10 s | 60 credits | 1 shot = 60 | 2 shots = 120 |
| **Scene total** | | **64** | **128** |
| **Four scenes** | | **256** | **512** |

**Current balance: 0.25 credits** — a top-up is needed before anything can run. Failed jobs are usually refunded; the balance is checked before and after each job and logged in `docs/footage/sequence-log.md`.

## Decisions for the owner

1. Approve the four scene ideas (or change any of them).
2. Approve a budget ceiling (suggested: 520 credits for all four, including retries).
3. Top up the Higgsfield account.
