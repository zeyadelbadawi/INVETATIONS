# Security requirements — binding on the build

Date: 2026-11-15. Source: design-level security review of the technical design (rev 2), 45 findings (1 critical, 15 high, 23 medium, 6 low). Every change below is accepted and **overrides the technical design where they differ**. "Verify" = platform behaviour to confirm during the build.

## 1. The findings that changed the design

| ID | Problem | Change |
|---|---|---|
| A1 (critical) | Hosts are `authenticated` and could write tables directly through Supabase's REST API — publishing without paying, raising caps, editing scores | `authenticated` is read-only everywhere except `events.content` and `events.theme`. Every other write goes through a server action behind one `requireEventAccess(eventId, capability)` gate |
| A2 | The guest API runs on the service key with no database backstop against cross-event access | Identity (event, invitation, player) comes only from the session. Composite `(event_id, id)` keys and foreign keys make cross-event references fail in Postgres. The service key is reachable only through a `guestDb(session)` wrapper that scopes every query |
| V1 | The cached public page would expose home address, family names and photos to anyone with or guessing the slug | Content is split: **public** (names, date, city, opening) and **guest-only** (exact address, map, gallery, families, programme, recap names and media), the latter served by the guest API after a session or passcode. Slugs always end in 6 random characters and are never reused |
| V2 | Guest photos appearing immediately to every link holder — a serious harm risk for women's photos | Photos are **pending until a host or moderator approves**, on every link kind. Wall media is visible only to joined, approved players. Hosts can choose "visible to hosts only". Signed read URLs live ≤ 10 minutes |
| S1 | A stateless signed cookie cannot be revoked | Server-side `guest_sessions`; the cookie is an opaque 256-bit token, hashed at rest, checked on every request |
| R1 | The reveal answer could be inferred from ciphertext length or stored early as game truth | Fixed-length padded plaintext, AAD-bound AES-256-GCM with a dedicated key and `key_version`; gender-dependent scoring is derived from the reveal at release time only |
| R2 | 500 phones hitting an uncached reveal endpoint at zero | After release the answer is written to the public live payload and served from the CDN-cached endpoint |
| O1 | Staff accounts without MFA | TOTP mandatory for staff; every staff action checks `aal2` on the server |
| O2 / O3 | Agent tooling and preview deployments near production secrets | Separate Supabase project for dev/preview; production secrets only in the production environment; agent sessions never get production credentials; `.claude/` and `docs/` excluded from deploys |
| C1 | Draft content rendered to staff could carry script | Draft is schema-parsed on every read; `theme` stores ids, never CSS; the boot script is a constant; the preview iframe is sandboxed |
| C2 | Direct uploads skip the browser downscale, leaving GPS EXIF and arbitrary bytes | Quarantine bucket → server-side verify and re-encode → clean bucket with server-set content type |
| P1 | Entitlements read from an editable `plan_id` | The order snapshots event, plan and amount; only settlement sets the event's plan, in one transaction |
| S2 | 4-digit rejoin code brute-forceable | 6 digits, HMAC with pepper in a table hosts cannot read, lockout per target player |
| A3 / A4 | Staff grants too broad; claim link is a bearer token to ownership | Grants carry capabilities (no reveal, exports, deletion, members, payments); phones masked from staff; owner emailed on grant; claim link bound to the customer's verified email |

## 2. Design rules

**Sessions and links**
1. Guest cookie: opaque 256-bit token; SHA-256 in `guest_sessions(token_hash, event_id, invitation_id, player_id, created_at, last_seen_at, revoked_at)`; name `__Host-g_<eventShortId>`; `Secure; HttpOnly; SameSite=Lax; Path=/`; expires at event end + 30 days. Each request checks session, invitation and player revocation.
2. Link codes travel in the URL **fragment** (`/l/[slug]#code`, `/k#code`): never sent to servers, logs or preview crawlers. The page reads it, POSTs it, then clears it with `history.replaceState`. Fragment survival in WhatsApp/Instagram/Facebook browsers is checked in the Phase 0 device spike; fallback is path codes with log scrubbing.
3. `POST /api/guest/session` checks `Origin`; if a session for that event already exists under a different invitation, the page asks before switching.
4. Every guest mutation: POST + JSON + `Origin` equals the app origin. No state change on GET. All `/api/guest/*` and link pages send `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`.
5. Rejoin: 6-digit code, HMAC in `player_secrets`, 5 failures → 15-minute lock on that player, host can reset.
6. Names are normalised (NFC; control, bidi-override and zero-width characters stripped; length cap). Hosts can rename, remove or merge players.

**Authorization**
7. RLS: `anon` nothing. `authenticated` select-only on own events' rows plus column-granted `UPDATE (content, theme)` on `events`. No policies on `orders`, `payments`, `reveals`, `game_secrets`, `player_secrets`, `guest_sessions`, `staff_*`, `jobs`, `rate_limits`, `audit_log`.
8. Migration zero revokes default grants from `anon` and `PUBLIC` and alters default privileges. No views in exposed schemas; `team_scores` is a plain table. No storage policies for API roles; no Realtime publication.
9. Helper functions live in a `private` schema, `security definer`, `set search_path = ''`, execute revoked from `public` and `anon`.
10. Composite keys: every event-scoped table has `unique (event_id, id)` and children reference `(event_id, parent_id)`.
11. Authorization is checked inside every server action, route handler and data-access function — never only in `proxy.ts`.
12. Moderation is one server action; staff takedown sets `removed_by_staff_at`, which hosts cannot clear.
13. `audit_log` rejects update and delete by trigger; actor comes from the verified session.

**Content**
14. No customer or guest HTML/CSS anywhere. Links parsed with `new URL()` and a scheme allow-list at write and at render. Map locations are stored as latitude, longitude and label; the server builds the map URL.
15. The server never fetches a URL supplied by a customer or guest. Preview images are uploaded, re-encoded assets.
16. Editor preview: iframe `sandbox="allow-scripts"`, both sides check `source` and origin, explicit target origin. `frame-ancestors 'self'` on `/preview/*`, `'none'` elsewhere.
17. CSP: strict nonce policy on dashboard, admin and link pages. On the cached invitation: `default-src 'self'`, explicit media/storage hosts, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`, no third-party script hosts; inline scripts by hash where the framework allows, otherwise a recorded `'unsafe-inline'` exception (verify Next 16 options). Plus HSTS, `nosniff`, `Permissions-Policy` (microphone self only).
18. Exports are real XLSX with string cells; CSV values starting with `= + - @` are prefixed. Imports are parsed in the browser; the server validates rows and caps counts.
19. Share cards carry the open link (only if the host enabled it, with approval forced on) or the plain slug URL — never a group or personal code.
20. Recap names and media come from the guest API; the public shell shows team totals only.
21. A "report this page" link on every invitation goes to the staff queue.

**Games**
22. Game config holds no truth; truth is written straight to `game_secrets`. No correct answers or per-option quiz tallies while a quiz is open.
23. `game_answers(game_id, player_id, question_id)` unique, insert-only; the server stamps timings; timed quizzes serve one question at a time.
24. `score_events` has `unique (player_id, reason, ref)`; team scores are only ever recomputed from the ledger. A team's "active" players are approved players with at least one scored entry.
25. Name-only join cannot be Sybil-proof. No prizes of real value depend on scores at launch; hosts get a suspicious-players view.

**Reveal**
26. Padded 256-byte plaintext; AAD = reveal id ‖ event id ‖ key version; fresh random 96-bit nonce per seal; dedicated key held only in the production environment.
27. Release is one SQL statement on database time (`update … where reveal_at <= now() and revealed_at is null returning …`); decryption happens only if it returns a row. It does not depend on cron. Pre-release responses never touch the ciphertext.
28. Release is irreversible. Rehearsal uses dummy data on a separate path. Moderators and staff cannot start a reveal.
29. Keeper page is write-only, bound to the first device that opens it, locked when the countdown starts. Audit rows and logs never contain the value.

**Media**
30. Two buckets: `quarantine` (signed uploads, ~2 MB limit, MIME allow-list, no upsert) and `media` (written only by the processing job, server-set content type). Images are re-encoded with metadata stripped and a pixel limit; audio containers are validated. SVG, GIF, HEIC, PDF rejected. Quarantine objects older than an hour are swept. User media is never served from the app origin.
31. Caps per event and per invitation are enforced when the upload URL is issued.

**Payments**
32. Orders snapshot `event_id`, `plan_id`, `amount_egp`. One paid order per event. Publish re-checks inside a transaction.
33. Webhook: HMAC per the gateway's scheme with constant-time compare; require success, live mode, matching amount and currency; unique `provider_ref`; the browser return URL grants nothing.
34. Manual approval needs a unique transfer reference and the amount seen on the statement; approver cannot approve an event they created or hold a grant on. `refunded` and `disputed` states exist.

**Platform**
35. Rate-limit keys: session/player → invitation → event; IP only before a session exists, with high ceilings (a wedding hall shares one IP). Per-target counters for rejoin and passcode.
36. Jobs: cron route authenticated by bearer secret (constant-time), `FOR UPDATE SKIP LOCKED`, handler allow-list, payloads carry ids only, `unique (kind, ref)`, max attempts then dead-letter.
37. Host accounts: email confirmation required, CAPTCHA on signup and reset, redirect targets from an allow-list of relative paths, server uses verified claims.
38. Passcodes: ≥ 6 characters, slow hash, per-event throttle; the live endpoint returns only phase and time for gated events without the passcode cookie.
39. `/api/live/[slug]` payload has a strict schema with numbers and team ids only — no names; query strings are rejected; unknown slugs are cached as 404.
40. Logs and error tracking never record cookies, link codes or request bodies.
41. Retention: guest phones deleted 90 days after the event; RSVP answers and sessions at 12 months; guest media at 12 months; deletion propagates to backups.

## 3. Phase gates

Each phase is done only when these pass as automated tests.

| Phase | Must prove |
|---|---|
| 0 | Publishable key without a session reads nothing on any table, RPC or bucket. Host A cannot read or write host B's rows. A host cannot write any column except `events.content/theme`. Cross-event child insert fails. Helpers are not callable as RPC. Service-key module never reaches a client bundle. Rate limiter does not throttle 500 requests from one IP as one. Poison job does not block the queue; cron without the secret gets 401 |
| 1 | Revoked invitation or session → 401 on the next request. One event's cookie grants nothing on another. Cross-origin session POST rejected. Shell HTML is byte-identical with and without cookies and contains no guest-only content. Preview-crawler GET creates nothing |
| 2 | Access matrix over every server action (owner, moderator, other host, staff with/without/expired grant). XSS payloads in every field render inert in preview, invitation, dashboard and back office. Link-scheme bypasses rejected. Publish without a paid order fails; concurrent publish/refund race is safe. Export formula injection neutralised |
| 3 | No truth in any public game output while open. Concurrent double-submit yields one answer and one score event. Recomputed ledger equals `team_scores`. 6th wrong rejoin code locks. Photos are pending by default. Upload pipeline rejects HTML-as-image, SVG, polyglot, pixel bomb, oversized; GPS EXIF is gone from output |
| 4 | With a known marker as the answer, no response, HTML, cache, log, audit row or content contains it before `reveal_at`. Ciphertext length is identical for all answers. Release uses database time under a skewed app clock. Keeper page never returns the value and refuses a second device. 500 clients from one IP through the countdown: no 429s |
| 5 | Question banks are data only. No host-entered gender truth. Corporate roster off by default; small tallies suppressed |
| 6 | Grant capabilities and expiry on database time. Claim link is email-bound and single-use under a race. Forged, replayed, wrong-amount, pending and test-mode webhooks all rejected. Audit table rejects update and delete. No analytics on `/i`, `/l`, `/k` |
| 8 | External penetration test, restore drill, key-rotation drill, incident runbook, retention jobs verified |

## 4. Needs the owner or a lawyer

**Legal (Egyptian counsel needed — none of this is confirmed):**
- Personal Data Protection Law 151/2020: our role (controller / processor), licence and DPO obligations, lawful basis and notice for guests' phone numbers uploaded by hosts, cross-border hosting (Supabase, Vercel, R2 are outside Egypt), children's and pregnancy data, breach-notification timelines, requests from guests who are not our customers.
- Anti-Cyber Crime Law 175/2018: whether we count as a service provider with log-retention duties, and our duty when a guest uploads photos of others without consent.
- Prize draws (already flagged).

**Owner:**
1. Separate domain for invitations vs the app (isolates the app's reputation if an invitation is abused for phishing).
2. Who reconciles manual payment approvals against the wallet/bank statement, and what happens to a published event on refund or dispute.
3. Paid hosting tiers may be needed for minute-level cron, point-in-time recovery and firewall rate rules (verify each).
4. Custom domains (Release 2) break the single-domain cookie model and need their own review before being promised.

Decisions already taken on the owner's behalf (changeable): random slug suffix; photos pending by default; address and gallery behind a session; reveal can be started any time with a 60-second lobby and is irreversible; staff never see guest phone numbers and the customer is emailed whenever staff get access; retention periods as in rule 41.
