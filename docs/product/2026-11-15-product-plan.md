# Product plan — event invitation & event-website platform

Date: 2026-11-15. Status: **draft for approval**. Nothing is built until this is approved.
Inputs: `docs/research/2026-11-15-market-research.md`, `docs/playbooks/scroll-animation-playbook.md`.

Items marked **(my call)** are proposals made without your input — correct any of them.

---

## 1. What we are building

A platform where anyone with an occasion gets one link that is the invitation, the event website, the guest manager, the event-day companion and the memory album. Sold two ways from the same product: the customer builds it (self-serve) or we build it for them (done-for-you).

**Decided by you:** both self-serve and done-for-you; cinematic scroll scenes built with the playbook method; aim to be clearly the strongest product in Egypt and the region.

## 2. How we win

Feature count alone will not do it — Mithaq already has a long list. A buyer comparing us to the others should see four differences within ten seconds, and a fifth that works on its own:

1. **An experience nobody else can produce.** Every competitor ships a flat page with an envelope video. We ship a camera move through a scene, scrubbed by the scroll, with the couple's names as live text on top.
2. **The link lives through the whole occasion.** Before: invitation and RSVP. During: live schedule, photo wall, find-your-seat, stream. After: album, thank-you notes, memories. Competitors' links die or go stale after the date.
3. **Page + guest operations in one product.** Egypt sells pages without guest tools; the Gulf sells WhatsApp/QR tools without pages. We do both.
4. **Every occasion has its own mechanic.** A gender reveal that actually reveals, a sebou that feels like a sebou — not a wedding template with a different title.
5. **Each invitation sells the next one.** A wedding link is opened by 200–500 guests; a discreet "made with ⟨brand⟩" on the closing screen plus a referral discount is our main acquisition channel. Vendors (halls, planners, photographers) are the second.

Supporting it: public EGP prices, automated checkout, a link that never expires, and a registered company behind it — all of which are weak spots for the current players.

## 3. Why the playbook method fits this product

- **One scene, unlimited customers.** Rule 2 of the playbook (no text in the footage; every word is HTML over the video) is exactly what a template product needs. We generate a scene once per template; names, dates, colours and languages are overlays. Generation cost is paid per template, not per customer.
- **RTL and bilingual for free**, because the copy is HTML.
- **The splash gate becomes the invitation's opening.** The loader is the couple's monogram being drawn while the scene downloads — the wait is part of the reveal.
- **The still version covers weak phones.** Reduced motion, Save-Data and 2G get posters with the same copy. Important: most guests open the link on mid-range Android from WhatsApp.
- **Budget per invitation (my call):** 1 opening scene + at most 2 more, phone variant about 3 MB each (playbook figure), so an invitation stays under ~9 MB of video on a phone.

Constraints this puts on the design:
- The editor edits **overlays and blocks**, not footage: text, fonts from a curated set, palette, photo slots, section order, music. This is less free-form than Mithaq's drag-anything editor, and that is deliberate — the result cannot be made ugly.
- A template = scene pack (videos, posters, manifests) + overlay schema (which fields sit where, in % of the frame) + block set + palette options.
- Must be tested inside WhatsApp's in-app browser and Instagram/Facebook webviews on Android and iOS before we commit to a template pipeline (WebCodecs path and the video fallback).

## 4. Occasions

| Occasion | Signature scene idea | Signature mechanic |
|---|---|---|
| Wedding / katb kitab / engagement / henna | Approach to a venue door that opens; ring box; wax-sealed envelope on a table | One link, several functions, per-guest visibility; groom-side / bride-side |
| Gender reveal | A sealed box / dark room that fills with colour | Guests vote, live tally, synchronised reveal for everyone at the same moment |
| Sebou | Cradle, candles, traditional sebou table | Baby name reveal, wishes for the baby, time capsule |
| Birthday | Table with cake, lights dim | Blow the candles (mic), wish jar, group gift |
| Graduation | Stage, cap toss | Class wall, photo wall |
| Corporate | Venue approach, stage curtain | Registration with approval, agenda, speakers, QR badges |

Launch set **(decided):** weddings, gender reveal and corporate events. Sebou, birthday and graduation follow on the same engine.

The guest experience must be entertaining, not just informative — teams, games, competition, live moments. The mechanics for each set are specified in `2026-11-15-experience-design.md`.

## 5. Full feature set

Priority: **P1** = launch, **P2** = second release, **P3** = later.

### 5.1 Invitation experience
- P1 Cinematic scroll scenes per template (playbook player, splash gate, still fallback).
- P1 Monogram splash as the opening; tap-to-play music with trim; skip-intro.
- P1 Guest's name on the opening via per-guest link ("Dear Ahmed & family").
- P1 Blocks: details, countdown, programme, story, families, gallery, dress code, map (Google Maps), add-to-calendar, Quran verse / quote, notes for guests, FAQ.
- P1 Arabic + English, switchable by the guest; RTL-first.
- P1 Custom slug, custom WhatsApp link-preview card, hidden from search engines, optional passcode.
- P2 Marks tracked to the footage (names engraved on the door, initials on the seal) per template.
- P2 Custom domain.
- P3 Bespoke scene generated for one customer (their venue, their theme) — done-for-you only.

### 5.2 Editor and creation
- P1 Self-serve editor: pick template → fill fields → live phone preview → publish. Edits stay open for life.
- P1 "Play as guest" preview and a test send to your own phone before paying.
- P1 Pay at publish (build free, preview free).
- P1 Done-for-you: our staff build in the same editor on the customer's account, from a short brief form + WhatsApp. Same product, a service fee on top.
- P2 AI text: invitation wording in Egyptian dialect, formal Arabic or English, in several tones.
- P2 Switch template without losing data.
- P2 Co-hosts (bride, groom, a parent) with roles.

### 5.3 Guests and RSVP
- P1 Guest list: add manually, import from Excel/CSV or phone contacts; groups, sides (groom/bride), tags.
- P1 Per-guest link with pax cap; RSVP with companions, children, custom questions (meal, song request).
- P1 Greetings wall; guest voice greetings; guest photo upload by QR without an app, with host approval.
- P1 Dashboard: opens, replies, expected headcount, who hasn't opened, who hasn't answered; Excel export.
- P2 Multi-function events with per-function RSVP and per-guest visibility.
- P2 Capacity, waitlist, replacement invitations when someone declines.
- P2 Seating/table assignment.

### 5.4 Sending
- P1 One-tap personal sending: the dashboard lists guests, each with a button that opens the host's own WhatsApp with the personalised message and link pre-filled. Free, no API, comes from a number the guest knows.
- P1 Printable QR cards (per event and per guest).
- P2 Automated WhatsApp sending through the official Business Platform: delivered/read status, reminders to non-responders only, thank-you after the event. Paid per message — see §8.
- P3 SMS fallback.

### 5.5 Event day (live mode)
- P2 The link switches state on the day: "now" in the programme, directions, live photo wall for a venue screen, find-your-seat.
- P2 QR entry pass: issued on acceptance, single-use, duplicate alert; browser-based gate scanner with several gate accounts; live arrivals counter.
- P3 Live-stream embed with replay for relatives abroad.
- P3 Games: "who knows the couple" quiz with leaderboard, playlist voting.

### 5.6 After the event
- P2 Memory page: album (guest + photographer uploads), voice greetings, wishes; ZIP download.
- P2 Thank-you messages to those who attended.
- P3 Photographer handoff with selfie face search.
- P3 Time capsule: messages that unlock on the anniversary / child's birthday.

### 5.7 Gifts
- P2 No2ta: the hosts' InstaPay address / wallet number / QR shown on the page, plus a **private ledger** for the hosts of who gave what. We display details and record; we do not process the money (see §8).
- P2 Wishlist with reserve-to-avoid-duplicates.
- P3 Group gift for birthdays.

### 5.8 Occasion mechanics
- P1 Gender reveal: vote, live tally, host-triggered or timed synchronised reveal, replay afterwards.
- P2 Sebou: name reveal, wishes for the baby.
- P2 Birthday: candles, wish jar.
- P3 Corporate: registration with approval, agenda, speakers, QR badges, cohost roles, brand colours and logo, CSV export.

### 5.9 Platform and business
- P1 Automated checkout through a local gateway (cards, wallets, Fawry), plus manual InstaPay with receipt upload as a fallback.
- P1 Public prices in EGP; link never expires.
- P1 Admin back-office: orders, done-for-you queue, template management, support inbox.
- P1 Closing-screen attribution + referral code for guests.
- P2 Vendor accounts for halls, planners and photographers: reseller pricing, their logo on the closing screen, monthly subscription.
- P3 White-label for large venues; Gulf currencies and payment methods.

## 6. Packaging and pricing (my call — hypothesis to validate)

Market context: mainstream in Egypt is 200–450 EGP one-time, upper band 499–1,000, done-for-you VIP ~5,000. Nobody in the region sells a monthly subscription to the end customer.

| Package | For | Includes | Price idea |
|---|---|---|---|
| Free | Trying it | Build and preview, watermark, no publishing | 0 |
| Essential | Small occasions | 1 scene, core blocks, RSVP, 100 guests | ~350 EGP |
| Premium | Most weddings | Full scenes, per-guest links, guest media, memory page, unlimited guests | ~750 EGP |
| Signature | Big weddings | Premium + event-day mode, QR check-in, multi-function, custom domain | ~1,500 EGP |
| Done-for-you | Anyone who won't build it | Any package, built by us | + ~1,000 EGP |
| Bespoke | High end | A scene generated for the customer | from ~7,500 EGP |
| Add-ons | — | Automated WhatsApp per guest, printed QR/NFC cards, extra functions | metered |
| Vendor plan | Halls, planners, photographers | Reseller pricing, branding | monthly |

We price above the mainstream on purpose: the experience is the reason. All numbers need a real check against Mithaq's prices (hidden behind sign-up) and a few customer conversations.

## 7. Tech approach (my call)

- **App:** Next.js App Router (TypeScript strict), Tailwind, GSAP ScrollTrigger + Lenis, Playwright — the stack the playbook was built on.
- **Data / auth / storage:** Supabase (Postgres with row-level security per event, auth, storage for guest uploads).
- **Scene media:** Cloudflare R2 behind a CDN, revision folders, as in the playbook.
- **Generation:** Higgsfield / Magnific connectors, with the playbook's approval gates and cost announcements.
- **Shape:** one Next.js app with three surfaces — marketing site, dashboard/editor, public invitation renderer (`/i/<slug>`, per-guest token in the URL). Invitations are rendered on the server so the copy is HTML and the page works without JS.
- **Template contract:** scene manifests + overlay schema + block list, stored as data, so new templates need no code changes to the renderer.

## 8. Risks and things to verify

| Item | What we know | Action |
|---|---|---|
| WhatsApp Business Platform cost for Egypt | Third-party figures only, and they disagree: marketing template ~$0.077–0.097 per message, utility ~$0.004–0.010. An invitation may be classed as marketing. | Read Meta's official rate card and confirm the category before pricing the add-on. This is why P1 uses one-tap personal sending. |
| Payment gateway fees | Paymob listed at 2.5–2.75% by third parties; no official per-method schedule found. | Get a quote from Paymob (and one alternative) before choosing. |
| InstaPay for merchants | No public merchant API found; a merchant release is reported as pending. | Keep manual InstaPay + receipt as fallback. |
| Money gifts | Processing gifts would make us a payments intermediary. | Display details and keep a ledger only; no processing. |
| In-app browsers | The scene player has not been tested in WhatsApp/Instagram webviews. | Spike on real devices before building templates. |
| Template production cost and time | Each scene needs generation, review, encoding, overlay mapping. | Measure on the first template; it sets how many templates we can launch with. |
| Guest uploads | Photos and voice notes from the public. | Host approval by default, size limits, automatic flagging later. |
| Personal data | Guest names and phone numbers. | Minimum data, per-event isolation, deletion on request; review Egypt's data-protection requirements. |
| Mithaq pricing | Hidden behind sign-up. | Sign up and read it. |

## 9. Roadmap

**Phase 0 — foundation and proof**
Brand name and visual direction; one template end to end (scene plan ⛔, generation ⛔, encode, player, overlays); device spike in WhatsApp/Instagram browsers; gateway and WhatsApp cost answers.

**Phase 1 — launch**
All P1 items. 4–6 templates across wedding family and gender reveal. Marketing site built with the same scene method. Done-for-you desk running.

**Phase 2 — the lead**
Event-day mode, QR check-in, memory page, no2ta ledger, automated WhatsApp, multi-function events, sebou and birthday, AI text, vendor accounts.

**Phase 3 — expansion**
Corporate, live stream, face search, time capsule, bespoke scenes at scale, white-label, Gulf.

## 10. Approaches considered

1. **Scene-template platform (chosen).** Cinematic scenes as reusable templates, constrained editor, guest operations added in layers. Hardest to copy, matches the method you already use, fixed generation cost per template.
2. **Free-form page builder like Mithaq, with more features.** Faster to reach parity, but we would be competing on feature count against someone with a head start, and flat pages look like everyone else's.
3. **Guest-operations first (Gulf model), page later.** Proven revenue per guest, but depends on WhatsApp API costs we have not verified and has no visual wow — it is the opposite of what you asked for.

## 11. Decisions

Settled (2026-11-15):
- Plan and P1 list approved.
- Launch sets: weddings, gender reveal, corporate events. (Catered gatherings dropped.)
- Fun-first guest experience (see the experience design doc).
- Arabic brand; Arabic and English at equal weight.
- Pricing direction approved as proposed in §6.
- Brand name, logo and palette are placeholders (Lamma / لَمّة) behind tokens and one config file; the real ones are swapped in at the end.

Still open:
- The verification items in §8.
- Legal advice on prize draws before any public (non-private) draw feature.
