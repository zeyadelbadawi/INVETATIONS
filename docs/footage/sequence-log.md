# Sequence log

Every generation job: what, model, settings, credits. Balance checked before and after.

## 2026-11-16 — keyframes (approved by the owner: 8 frames at 2K, 520 credits)

Magnific project "Lamma — opening scenes". Model Nano Banana 2.1, 16:9, 2K, 65 credits each (quoted by Magnific before running). Balance before: 11,959.

| Scene | Frame | Notes |
|---|---|---|
| wedding.doors | end | Clean. Mashrabiya light sits in the centre band; names need a wash. |
| wedding.doors | start (end frame as reference) | Clean. Door design differs a little from the end frame; check for morphing in the shot. |
| wedding.table | end | Clean. Dark upper hall is a good text area. |
| wedding.table | start (end frame as reference) | Clean; seal has a floral pattern, no letters. |
| reveal.box | end | Clean, strictly neutral palette. |
| reveal.box | start (end frame as reference) | Clean, neutral. Angle change is small; the move will be gentle. |
| corporate.stage | end | Clean; blank screen is the text area. |
| corporate.stage | start (end frame as reference) | **Rejected: a red EXIT sign (lettering) on the right wall.** Balconies don't match the end frame. Needs one regeneration. |

Spent: 520 credits.

Video quote (Magnific, Kling 3.0, 10 s, no sound): 1080p = 900 credits, 4K = 3,800 credits per shot.

## 2026-11-20 — corporate start frame and the three shots

Balance before: 4,150 (about 7,300 had been spent outside this work since 2026-11-16).

| Job | Model / settings | Credits | Result |
|---|---|---|---|
| corporate.stage start frame (regenerated) | Nano Banana 2.1, 2K, end frame as reference | 65 | Clean: no signs, walls match the end frame |
| wedding.doors shot | Kling 3.0, 1080p, 10 s, no sound, start + end frame | 900 | Clean; even forward move (mean change 8.1, max 11.3) |
| reveal.box shot | same | 900 | Clean, neutral palette throughout; very gentle move (mean 0.45) |
| corporate.stage shot | same | 900 | Clean. The owner rejected the look (reads as a theatre, not a corporate venue) after it was queued; there was no cancel, and the owner chose to use it as is and spend nothing more. |

Spent: 2,765. The owner asked for no further Magnific spending.

Encoded with `tools/sequences/build-video.mjs` (ease-in 0.06, ease-out 0.12, focal centre) into `public/media/drafts/<id>/`:
- wedding.doors at desktop CRF 30 / mobile CRF 32 (foliage detail; CRF 24/26 gave a 5.7 MB phone file): desktop 5.69 MB, mobile 2.81 MB.
- reveal.box at 24/26: desktop 3.34 MB, mobile 1.79 MB.
- corporate.stage at 24/26: desktop 4.23 MB, mobile 1.97 MB.

Served from the app itself (no media CDN yet). The source is 1928×1072 at 1080p, so the phone 4:5 crop is upscaled from about 858 px wide.

## 2026-11-21 — Photos for the demos and the marketing site

- Approved by the owner: 3 sheets, 435 credits (balance before: 503).
- Model: Google Nano Banana 2.1, 4K, 1:1, each sheet a 3×3 grid of nine photos, cut locally (no paid split): 27 photos of ~1340 px.
- Sheet 1: wedding details (rings, henna bouquet, reception table, garden walk, cake, cufflinks, zaffa drums, veil at the doors, sparklers).
- Sheet 2: gender reveal (baby shoes, balloons, cake, gift box, nursery) and corporate (audience, coffee break, speaker, trophies).
- Sheet 3: guests at celebrations with phones and the marketing set (phone at table, garden family, toast, phone with lanterns, grandmother with phone, hall raising hands, kids with balloons, laptop with jasmine, dancing).
- Demos: uploaded through the content-image pipeline with `tools/demo/upload-demo-photos.ts` (wedding 9, gender reveal 5, corporate 4) and set as each demo's gallery and link preview.
- Marketing: 13 photos in `public/marketing/photos` at 1200 and 640 px.
