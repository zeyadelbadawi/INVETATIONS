# Project guide

Digital invitation / event-page platform (placeholder brand: Lamma / لَمّة). Arabic and English at equal weight, RTL-first. Launch sets: weddings, gender reveal, corporate.

## Read before changing anything
- `docs/product/2026-11-15-launch-scope.md` — what is in the launch (wins over the other product docs).
- `docs/product/2026-11-15-security-requirements.md` — **binding**. Overrides the technical design where they differ.
- `docs/product/2026-11-15-technical-design.md` — architecture and phases.
- `docs/playbooks/scroll-animation-playbook.md` — how scroll scenes are made and played. Footage generation has approval gates and costs credits: announce the cost and get approval first.
- `AGENTS.md` — this Next.js version (16.4, Cache Components) differs from older knowledge; read `node_modules/next/dist/docs/` before using an API you are not sure about.

## Rules that are easy to break
- Guests have no accounts and never reach the database. All guest reads/writes go through `src/app/api/guest/**` using `guestRead` / `guestWrite` (`src/lib/guest/route.ts`); identity comes only from the session.
- Hosts are read-only at the database (RLS) except `events.content` and `events.theme`. Every other host write is a server action that calls `requireEventAccess(eventId, capability)` first.
- `adminDb()` (service key) is server-only and bypasses RLS: authorise before using it, and always filter by `event_id`.
- The invitation page `/i/[slug]/[locale]` is a cached shell identical for every visitor. It must contain only public content; guest-only blocks (address, programme, families, people, contact, gallery) come from `/api/guest/[slug]/me`.
- Link codes travel in the URL fragment (`/l/<slug>#<code>`), are stored only as hashes, and never appear in share links.
- Customer and guest text is always rendered as text. `theme` stores ids, never colours or CSS. The server never fetches a customer-supplied URL.
- The reveal answer exists only as ciphertext until the database releases it (`reveal_release`, database time). Never log it, audit it or put it in content.
- Brand name, logo and colours live in `src/config/brand.ts` and the `--brand-*` tokens in `src/app/globals.css`. No raw brand colours in components.
- UI strings live in per-feature `messages.ts` files as `{ ar, en }`.
- With `cacheComponents`, the segment configs `dynamic`, `revalidate` and `runtime` are errors, `params` is a Promise, and anything reading cookies must render inside `<Suspense>`.

## Layout
- `src/app/(site)/[lang]/**` — marketing, auth, host dashboard (`app/`), back office (`admin/`).
- `src/app/(invite)/**` — guest pages: `/i` invitation, `/l` link entry, `/k` secret keeper, `/preview` editor preview.
- `src/app/api/**` — guest API, public live endpoint, cron, keeper.
- `src/content/schema.ts` — content and block schemas (single source of truth).
- `src/templates/**` — template contract and registry (templates are code, versioned).
- `src/scenes/**` — scroll-scene player. `src/play/**` — pure game modules and question banks.
- `src/lib/**` — server libraries (guest sessions, reveal, media, jobs, security).
- `src/features/**` — feature UI and server actions.
- `supabase/migrations/**` — schema; `tools/sequences/**` — scene encoder; `media/drafts/**` — draft scenes.

## Commands
```bash
pnpm exec supabase start          # local database (Docker)
pnpm exec supabase db reset       # reapply migrations
pnpm exec supabase gen types typescript --local --schema public > src/lib/db/types.ts
pnpm exec vitest run              # unit + integration tests (need the local database)
pnpm exec next typegen && pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm exec next build
node tools/sequences/build-video.mjs --input shot.mp4 --id brand.scene --out media/drafts --draft
```
Copy `.env.example` to `.env.local` first. Tests load `.env.local` themselves.
