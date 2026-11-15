# Technical design — v1 (revision 2)

Date: 2026-11-15. Revised after the independent plan review. Scope is exactly `2026-11-15-launch-scope.md`.

## 1. Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 App Router, TypeScript strict |
| Styling | Tailwind CSS 4; every colour and font is a CSS-variable token |
| Motion | GSAP ScrollTrigger + Lenis after first paint; scene player per the playbook |
| Data | Supabase Postgres + Auth (hosts and staff only) + Storage |
| Live | Short polling of a cacheable endpoint (§7). No WebSockets at launch |
| Jobs | `jobs` table in Postgres, drained by a scheduled route (`/api/cron/jobs`, every minute) and after relevant writes |
| Email | Transactional provider over SMTP for auth and receipts (provider to be chosen and verified; Supabase's built-in mailer is for development only) |
| Scene media | Cloudflare R2 + CDN, revision folders; committed draft scenes for local and CI |
| Guest media | Supabase Storage (private bucket) behind a `MediaStore` interface, so it can move to R2 without touching callers |
| Rate limiting | Postgres-backed fixed-window counters behind a `RateLimiter` interface (swappable for Redis) |
| i18n | `ar` and `en`, equal weight, RTL-first |
| Validation | Zod at every server boundary |
| Tests | Vitest, Playwright |
| Monitoring | Error tracking and uptime checks (provider chosen at deploy time) |
| Hosting | Vercel assumed; nothing depends on it |

## 2. Routes

| Surface | Routes | Who |
|---|---|---|
| Marketing | `/[locale]`, `/[locale]/pricing`, `/[locale]/templates` | Public |
| Auth | `/[locale]/login`, `/[locale]/signup` | Hosts |
| Dashboard | `/[locale]/app`, `/[locale]/app/events/[id]/{edit,invitations,play,wall,settings}` | Hosts |
| Editor preview | `/preview/[eventId]` (iframe target, draft content over `postMessage`) | Signed-in host of that event |
| Invitation | `/i/[slug]/[locale]` | Everyone with the link |
| Link entry | `/l/[code]` → sets up the session, then redirects to the invitation | Guests |
| Secret keeper | `/k/[code]` | One trusted person |
| Back office | `/[locale]/admin/…` | Staff |
| Guest API | `/api/guest/*` | Invitation pages |
| Public live API | `/api/live/[slug]` | Invitation pages (cacheable) |
| Webhooks | `/api/webhooks/payments` | Gateway |
| Cron | `/api/cron/jobs` | Scheduler (shared-secret header) |

## 3. Caching and personalisation

- `/i/[slug]/[locale]` is the same HTML for every visitor of that event, locale and published version, so it is cacheable. It contains nothing personal.
- Personalisation arrives after load from `GET /api/guest/me` (session cookie): the guest's display name, their invitation, their player, their team. The name on the opening is filled into a reserved slot.
- Locale order when a guest arrives through `/l/[code]`: invitation's locale → `Accept-Language` → event default. The switcher is a plain link to the other locale's URL.
- If the host filled only one language, the other falls back to it and the switcher is hidden.
- Dates show event-local time (`Africa/Cairo` by default, stored as an IANA zone) and, when the viewer's zone differs, their local time underneath. Calendar files carry the TZID.
- Passcode-protected events: the passcode gate is part of the cached shell; content is fetched after the passcode is accepted. Link-preview metadata (title, image chosen by the host) is always served.

## 4. Trust model

**Hosts** sign in with Supabase Auth (email + password, Google). They reach rows through RLS. The moderator role is an `event_members` row with `role = 'moderator'` (can hide wall posts, nothing else).

**Staff** have a row in `staff_roles`. Back-office actions run on the server after a role check and are written to `audit_log`. Done-for-you: staff create the event on the customer's behalf (or the customer creates it and requests the service), and a row in `staff_grants (event_id, staff_id, expires_at)` lets that staff member edit that event through the same server actions hosts use; the grant is created from the back office by an admin, expires after 14 days, and is audited. If the customer has no account yet, the event is owned by a holding account and transferred through a single-use claim link.

**Guests have no account and never reach the database.** The `anon` role has no table privileges. Everything goes through server routes, which resolve the session, validate with Zod, check event state and entitlements, rate-limit, then write with the service key (server-only module, never bundled for the client).

### Invitations, players and sessions

- An **invitation** is a party the host invited: a household ("Ahmed & family", pax 4), a group ("bride's university friends"), or the open link. It owns the RSVP.
- A **player** is one person on one device who joined the fun: a name, a team, entries, points. Players are created on join and belong to an invitation.
- Link kinds, all carried as `/l/[code]`:
  - **Personal** — one household; shows the name; RSVP answers for the party; any number of household members up to `pax_cap` can each join as a player.
  - **Group** — many people; each enters a name to join; RSVP is per player; capped by a host-set limit.
  - **Open** — the event's general link; like a group link but players wait for host approval before uploads appear or points count, if the host turns approval on.
- `code` is random (128 bits, base62). Only its SHA-256 is stored. The host can revoke and reissue.
- `/l/[code]` is a route handler: it never renders content. On `GET` it returns a tiny page that immediately `POST`s to `/api/guest/session` (so link-preview crawlers, which don't run it, never create sessions or count as opens), which sets a signed, http-only, `SameSite=Lax` cookie scoped to that event and redirects to `/i/[slug]/[locale]`. The code therefore never stays in the address bar or in a shareable URL.
- Share cards and "invite others" use the event's **open or group join link**, never a personal code.
- A player who changes browser (in-app browser → Chrome) can re-claim their player by opening their link again and choosing their name; personal links allow it directly, group/open links require the 4-digit rejoin code shown when they first joined.
- "Opened" is recorded on session creation, never on `GET`.

## 5. Data model

Every table: `id uuid`, `created_at`; RLS enabled; event-scoped tables carry `event_id`.

| Table | Purpose / key columns |
|---|---|
| `profiles` | Host profile, locale |
| `staff_roles` | `support`, `designer`, `admin` |
| `staff_grants` | Time-boxed staff access to one event |
| `events` | `owner_id`, `kind`, `slug`, `status` (draft, published, postponed, cancelled, ended, archived), `template_id`, `template_version`, `content jsonb` (draft), `published_content jsonb`, `published_version int`, `theme jsonb`, `settings jsonb`, `starts_at`, `ends_at`, `timezone`, `plan_id`, `passcode_hash` |
| `event_members` | `role` (owner, moderator) |
| `plans` | Price, entitlements jsonb (`max_guests`, `games`, `personal_links`, `voice`, `photos`, `reveal`, `watermark`) |
| `templates` | Versioned template data (§6); staff-managed |
| `invitations` | `label`, `kind` (personal, group, open), `side`, `pax_cap`, `phone`, `code_hash`, `locale`, `opened_at`, `revoked_at` |
| `players` | `invitation_id`, `name`, `team_id`, `approved`, `rejoin_code_hash`, `team_switched_at` |
| `rsvps` | `invitation_id` (+ `player_id` on group/open links), `status`, `adults`, `children`, `answers jsonb`, `updated_at` |
| `teams` | `name_ar`, `name_en`, `color`, `join_mode` (pick, assigned) |
| `games` | `kind` (quiz, vote, prediction, clues), `config jsonb`, `answer_key jsonb` (never selected by guest routes while open), `state` (hidden, open, closed, settled), `opens_at`, `closes_at`, `position` |
| `game_entries` | `game_id`, `player_id`, `payload jsonb`, `score`; unique (`game_id`, `player_id`) |
| `score_events` | Append-only: `player_id`, `team_id` at the time, `points`, `reason`, `ref` |
| `team_scores` | Materialised per team by the scoring job; read by the live endpoint |
| `wall_posts` | `player_id`, `kind` (text, voice, photo), `text`, `media_id`, `status` (visible, pending, hidden), `reported_count` |
| `media` | `path`, `mime`, `bytes`, `width`, `height`, `duration`, `state` (uploaded, processed, rejected) |
| `reveals` | `keeper_code_hash`, `sealed_at`, `answer_ciphertext`, `reveal_at`, `revealed_at`, `style` |
| `live_state` | `phase`, `public_payload jsonb`, `version int` |
| `orders`, `payments` | `plan_id`, `amount_egp` (server-computed), `provider`, `provider_ref` unique, `status`, `receipt_media_id` |
| `jobs` | `kind`, `payload`, `run_at`, `attempts`, `state` |
| `rate_limits` | `key`, `window_start`, `count` |
| `audit_log` | Append-only: actor, action, target, metadata |

**RLS.**
- `anon`: nothing.
- `authenticated`: event-scoped rows where `is_event_owner(event_id)`; moderators get `select` on `wall_posts`/`players` and `update(status)` on `wall_posts` only; `templates` and `plans` read where published; own `profiles`.
- No `authenticated` policies on `reveals`, `staff_roles`, `staff_grants`, `payments`, `jobs`, `rate_limits`, `audit_log`, or the `answer_key` column (kept in a separate `game_secrets` table so column-level leaks are impossible).
- Host-side writes that must respect entitlements (publish, add invitations beyond the cap, enable a game) go through server actions, not direct table writes; RLS allows only the safe columns to be edited directly.

**Lifecycle.** Hosts publish, postpone and cancel. A job moves `published → ended` 24 hours after `ends_at`. Postponed and cancelled events show a calm notice and close RSVP and games. RSVP can be edited until the host's deadline; `adults + children` cannot exceed `pax_cap`.

## 6. Templates and the editor

```ts
type Template = {
  id: string; version: number; kind: EventKind;
  name: { ar: string; en: string };
  scenes: { id: string; rev: number; scrollVh: number; holdVh: number; leadVh?: number; gate: boolean }[];
  fields: FieldDef[];          // key, type (text | date | image | choice), label, maxLength, required, perLocale
  overlays: OverlaySlot[];     // field, scene, progress range, final-state style
                               // position + size per variant ("desktop" 16:9, "mobile" 4:5) and per direction (rtl, ltr)
                               // fit: { maxLines, minScale } so long Arabic names shrink instead of overflowing
                               // wash: optional dark wash behind the text
  splash: { kind: "initials" | "logo"; animation: "mask-reveal" };
  blocks: BlockDef[];          // type, default on/off, default order
  palettes: Palette[];         // tokens for overlays, blocks and splash — footage is not recoloured
  fontPairs: { ar: string; en: string }[];
  music: string[];             // ids from the curated library
  reveal?: { neutral: true; styles: ("balloon" | "scratch")[] };
};
```

- A published event pins `template_id` + `template_version`; template updates never change a live invitation.
- `events.content` holds draft values; **Publish** validates against `fields`, checks entitlement and payment, then copies to `published_content` and bumps `published_version`. Editing after publish changes only the draft until the host republishes. The slug is fixed once published.
- The editor is a form panel beside an iframe of `/preview/[eventId]`, which renders the real invitation component and receives the draft over `postMessage` (origin-checked). The iframe owns its own scroll, `lvh` and splash, so the player behaves as it will for guests.
- Customers edit text, choose a palette and font pair, fill photo slots, toggle and reorder blocks, and pick music. Nothing else.
- All customer text is rendered as text. No customer HTML, CSS or script. Links: `https`, `tel`, `mailto` only; map links must be on known map hosts.
- The splash monogram is the initials (or company logo) revealed with a mask animation — no per-letter path drawing.
- The free tier's preview link works only for the signed-in host and carries a watermark.

## 7. Play engine

**Modules at launch:** quiz (text and image questions), vote (this-or-that, poll), prediction, clues. Each implements:

```ts
interface GameModule<Config, Entry, Truth> {
  configSchema: ZodType<Config>; entrySchema: ZodType<Entry>;
  publicConfig(config: Config): unknown;            // strips anything secret
  scoreOnSubmit?(config: Config, entry: Entry, truth: Truth): number;   // quiz
  scoreOnSettle?(config: Config, entry: Entry, truth: Truth): number;   // prediction
  tally(config: Config, entries: Entry[]): unknown; // public aggregate
}
```

- Answer keys live in `game_secrets` and are read only inside scoring code on the server.
- Question banks ship as data in both languages; hosts pick from them or write their own.
- Timed quizzes have an untimed setting (accessibility; older guests).

**Scoring.** Every scoring action inserts a `score_events` row. Team score = the average of the team's top *N* players, where *N* = the smallest team's active-player count, clamped to 3–15. This keeps big families from winning on size and stops casual joiners from dragging a team down. A job recomputes `team_scores` after writes (debounced to once per few seconds per event). Points earned stay with the team the player was on at the time. In the reveal's clue game a player may switch team once, before the countdown starts.

**Teams.** Weddings: groom's side, bride's side, friends — pre-filled from the invitation's `side`, changeable by the player unless the host locks it. Gender reveal: player picks. Corporate: host assigns by invitation group (department) or the server deals players into balanced houses.

**Live.** `GET /api/live/[slug]` returns `{ version, phase, serverNow, revealAt?, scores, tallies }` — public-safe by construction, no cookies, cached at the CDN for 2 seconds per event, so a 500-guest hall costs about one origin request every two seconds. Clients poll every 5 seconds normally and every second inside a countdown. `serverNow` in milliseconds comes from a separate uncached `GET /api/time`, corrected for round-trip, to align countdowns.

**Synchronised reveal.**
1. The host creates the keeper link. The keeper opens `/k/[code]` and submits the answer. It is stored as ciphertext (AES-256-GCM, key in server environment). The keeper may correct it until the countdown starts; each seal is audited. Hosts and staff see only "sealed".
2. The host starts the reveal. The server sets `reveal_at = now() + lead` with a **minimum lead of 60 seconds** (the countdown lobby), so every polling client learns it in time. The host can cancel during the lobby. If nothing is sealed, the reveal cannot start.
3. The answer is released only by `GET /api/guest/reveal`, which returns it if and only if `now() >= reveal_at`; otherwise it returns the milliseconds remaining and the client retries with jitter. At zero the server also decrypts once and moves the result into `published_content`, bumping the version (which purges the cached page).
4. Footage is answer-neutral. The colour is drawn in HTML/canvas after step 3. Before zero the answer is in no page, API response, URL, image, file name or cache key.
5. Twins: the answer is a list. Postpone/cancel: the host can close the event quietly at any point; predictions close with it.

**Share cards.** Drawn on the client in a `<canvas>` (the browser shapes Arabic correctly), exported as PNG and shared with the Web Share API (image + text + join link), with "save image" and "copy link" as fallbacks. Cards contain first name, team and score only. Hosts can switch sharing off per event.

**Recap.** A section of the invitation that appears when the event ends: final scores, winners, wall highlights.

## 8. Scenes

As in the playbook — sticky `lvh` stage, WebCodecs engine with video fallback, walk, device tiers, still version, manifests with timing and decode index, inline boot script — with the deviation recorded in the launch scope: only scenes marked `gate: true` (the first) hold the splash; later scenes show posters until ready; a "Details / RSVP" button is always visible.

- **Phase 0 includes a device spike**: the player on real mid-range Android and iPhone inside WhatsApp's, Instagram's and Facebook's in-app browsers, checking WebCodecs, memory, cookies, Web Share and microphone recording. Results decide the tier rules before any template is built.
- One real template is built end to end before the editor is finalised. Development and CI use a synthetic draft scene through the same encoder until then.
- Footage generation follows the playbook's approval gates.

## 9. Media

- Images are downscaled in the browser before upload (long edge 1600 px, JPEG/WebP, ~400 KB) which also drops EXIF. Voice notes are capped at 60 seconds.
- Upload flow: guest API issues a short-lived signed upload URL for a server-chosen path → client uploads → client calls `complete` → a job verifies the real type from the bytes, re-encodes images, records dimensions/duration and flips `media.state`. Unverified media is never served.
- Reads use signed URLs issued by the server after the visibility check.
- Quotas per plan (per player and per event). Retention: guest media 12 months after the event, with a download offered first; the page stays.
- No guest video at launch. Voice is stored as recorded (webm/opus or mp4/aac) and played with a format the device supports; transcoding is deferred.

## 10. Payments and entitlements

- `plans.entitlements` is the only source of what an event may do; every gated server action checks it.
- The amount is computed on the server from `plan_id`. The client never states a price or that it paid.
- Manual transfer: receipt uploaded to private storage → staff approve in the back office (audited) → `payments.status = 'paid'`.
- Gateway (working assumption: Paymob): hosted checkout; webhook verified by HMAC, idempotent on `provider_ref`. Built behind a flag; finished when credentials exist.
- Publishing requires a paid plan. Before paying, the host has the watermarked private preview and can send themselves a test link that works only while they are signed in.

## 11. Operations

- Moderation: reported posts go to the moderator and, past a threshold, hide automatically. Staff can take down anything from the back office.
- Backups: database point-in-time recovery on the hosted project; storage objects and scene masters copied to a second bucket on a schedule.
- Load test before launch: 500 simulated guests on one event through a reveal.
- Support channel is WhatsApp; back office keeps notes per event.

## 12. Performance budgets

- Invitation: initial JS ≤ 180 KB; poster is the LCP image; one gating scene of about 3 MB on phones.
- Live endpoint: CDN-cached; origin cost independent of audience size.
- Guest API writes are single-row inserts plus a ledger row.

## 13. Phases

| # | Phase | Outcome |
|---|---|---|
| 0 | Foundation | Repo, tooling, CI, tokens + brand config, i18n + RTL, local Supabase, schema + RLS + policy tests, auth, plans/entitlements seed, rate limiter, jobs runner |
| 1 | Invitation core | Template contract, invitation shell (cached) + `/api/guest/me`, link entry and sessions, blocks, scene player with a draft scene, splash, still version, device-spike build |
| 2 | Hosts | Dashboard, event creation, editor with iframe preview, invitations (add/import/links), WhatsApp sending, RSVP, publish with entitlements, manual payment + back-office approval |
| 3 | Play | Players and join, teams, ledger + scoring job, quiz / vote / prediction / clues, wishes wall (text, voice, photo) with moderation, share cards, recap |
| 4 | Live | Live endpoint + time sync, reveal with secret keeper, two reveal styles, winner cards |
| 5 | Occasion packs | Wedding, gender-reveal and corporate packs: blocks, team presets, question banks (ar/en), corporate teasers, award voting |
| 6 | Business | Marketing site, pricing, done-for-you desk and staff grants, gateway adapter behind a flag, attribution |
| 7 | Footage | Scene plans ⛔, generation ⛔, encoding, upload, four templates |
| 8 | Hardening | e2e suite, load test, accessibility pass, performance pass, code security review, real-device checks |

Accessibility is part of every phase, not only 8. Phase 7 runs alongside 2–6 once scene plans are approved.
