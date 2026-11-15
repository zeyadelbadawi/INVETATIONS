# Launch scope — single source of truth

Date: 2026-11-15. Written after the independent plan review.
**This document decides what is in the launch.** Where the product plan (P1/P2/P3) or the experience design (Launch / Release 2) disagree with it, this document wins.

Calls made here without the owner are marked **(my call)** and listed again in §6.

## 1. Launch definition

Three occasion sets: **weddings** (wedding, engagement, katb kitab), **gender reveal**, **corporate lite**.

- Corporate lite = personalised invite, information blocks, RSVP, teams, staged teasers, polls, predictions, award voting, recap. Registration-with-approval, entry pass, badges, the draw, live quiz, stamps and Q&A are Release 2.
- Henna night as a separate women-only link is Release 2: it needs per-function visibility, and a private photo wall must not ship before access is truly per guest.

## 2. Feature matrix

W = weddings, G = gender reveal, C = corporate. ● launch, ○ Release 2, — not planned.

### Invitation
| Feature | W | G | C |
|---|---|---|---|
| Opening scroll scene (1 gating scene, optional 2nd) | ● | ● | ● |
| Monogram / logo splash | ● | ● | ● |
| Always-visible "Details / RSVP" jump button | ● | ● | ● |
| Still version (reduced motion, Save-Data, 2G, slow line) | ● | ● | ● |
| Guest's name on the opening | ● | ● | ● |
| Blocks: details, countdown, programme, map, add-to-calendar, dress code, notes, FAQ | ● | ● | ● |
| Blocks: story, families, gallery, Quran verse / quote | ● | — | — |
| Blocks: agenda with now/next, speakers and hosts, parking / gate, contact | — | — | ● |
| Arabic + English, guest-switchable | ● | ● | ● |
| Curated music library, tap to play | ● | ● | — |
| Customer-uploaded music | ○ | ○ | — |
| Custom slug, custom link-preview card, noindex, optional passcode | ● | ● | ● |
| Custom domain | ○ | ○ | ○ |

### Hosts
| Feature | W | G | C |
|---|---|---|---|
| Self-serve editor with live phone preview | ● | ● | ● |
| Done-for-you (staff build on the customer's event) | ● | ● | ● |
| Invitations list: add, paste, Excel/CSV import; groups and sides | ● | ● | ● |
| Group links (one link per family group / side / department) | ● | ● | ● |
| Personal links (one per household, pax cap) | ● | ● | ● |
| One-tap WhatsApp sending from the host's own number | ● | ● | ● |
| Printable QR for the event link | ● | ● | ● |
| RSVP (adults, children, custom questions), deadline, edits | ● | ● | ● |
| Dashboard: opens, replies, headcount, export | ● | ● | ● |
| Moderator role (one extra person) | ● | ● | ● |
| Full co-host roles | ○ | ○ | ○ |
| Automated WhatsApp (Business Platform) | ○ | ○ | ○ |
| Multi-function events with per-guest visibility | ○ | — | — |
| Seating, capacity / waitlist | ○ | — | ○ |
| QR entry pass and gate scanner | ○ | — | ○ |

### Play
| Feature | W | G | C |
|---|---|---|---|
| Join as a player (name only) | ● | ● | ● |
| Teams, roster, live score | ● | ● | ● |
| Team badge + share card | ● | ● | ● |
| Quiz (text and photo questions) | ● "who knows the couple", guess the baby photo | ● "who knows the parents" | ○ |
| Vote module (this-or-that, poll) | ● مين فيهم؟, couple's choices | ● name vote | ● pre-event polls, award voting |
| Predictions, settled by the host | ● | ● (incl. birth predictions) | ● |
| Clue cards + switch team once | — | ● | — |
| Staged teasers on a schedule | — | — | ● |
| Wishes wall: text and voice | ● | ● | ● (text only) |
| Guest photo upload + gallery | ● | ○ | ○ |
| Synchronised reveal with secret keeper, 2 reveal styles | — | ● | — |
| Winner / consolation cards | ● | ● | ● |
| Recap page | ● | ● | ● |
| Song requests with upvotes | ○ | — | — |
| Photo missions, live photo wall, big screen | ○ | ○ | ○ |
| Bingo, tap race, icebreaker, daily question | ○ | ○ | ○ |
| Live quiz rounds, Q&A, stamps, draw | — | — | ○ |
| Guest video | ○ | ○ | — |
| Who's-online room | — | ○ | — |

### Business
| Feature | Launch |
|---|---|
| Plans and entitlements enforced on the server | ● |
| Manual payment (InstaPay / wallet receipt) with staff approval | ● |
| Card / wallet gateway | ● when merchant credentials exist; built behind a flag |
| Back office: orders, done-for-you queue, takedowns, support notes | ● |
| Marketing site | ● |
| "Made with" attribution on recap and share cards | ● |
| Referral codes | ○ |
| Vendor accounts | ○ |

## 3. Templates and scenes at launch

- 4 templates: 2 wedding, 1 gender reveal, 1 corporate.
- **1 opening scene per template** (4 scenes to generate). A second scene per template is optional and comes after launch.
- Gender-reveal footage is **answer-neutral**: the same file for boy and girl. The colour is applied in HTML/canvas after the answer is released.

## 4. Deviation from the playbook (needs the owner's eye)

The playbook's splash gate waits for **every** scene before the page opens. For an invitation opened on mobile data from WhatsApp, that would mean many seconds on a monogram before date, venue and RSVP are reachable. **(my call)**:

- Only the **first** scene gates the splash. Any later scene shows its poster until ready.
- A "Details / RSVP" button is always on screen and jumps past the scene.
- Everything else in the playbook is followed as written.

## 5. Packages at launch (rebuilt from launch features)

| Package | Includes | Price |
|---|---|---|
| Free | Build and preview with a watermark; preview link works for the host only | 0 |
| Essential | Published invitation, all blocks, RSVP, group links, wishes wall (text), up to 100 guests | ~350 EGP |
| Premium | Essential + personal links with guest names, teams and all games, share cards, recap, voice wishes, guest photos, synchronised reveal, unlimited guests | ~750 EGP |
| Signature | Premium + priority support on the event day, a second opening scene when available, and Release 2 event-day features as they ship (entry pass, big screen) | ~1,500 EGP — **sold from Release 2**, not at launch |
| Done-for-you | Any package built by us: 2 revision rounds, 48-hour turnaround; the customer does the sending | + ~1,000 EGP |
| Corporate | Premium features with company branding; invoice issued | quoted per event |

Gender reveal uses Essential / Premium. All prices remain hypotheses to validate.

## 6. Calls made without the owner

1. Corporate ships as "lite" (§1).
2. First-scene-only gate and a persistent Details/RSVP button (§4).
3. Invitations (a household or group) are separate from players (a person on a phone). A forwarded family link lets each family member join and play as themselves.
4. Group links are first-class; personal links are the Premium path.
5. "Link never expires" means the page. Guest media is kept 12 months, with download offered before removal. No guest video at launch.
6. Moderation: uploads from invited guests appear immediately with report/remove; uploads from open-link guests wait for approval. A moderator role exists at launch. The henna private wall waits for Release 2.
7. Music at launch is a curated, licensed library only.
8. Rosters show first names to joined players for weddings and reveals; off by default for corporate; hosts can switch it off anywhere. Hosts can also switch off sharing prompts (evil-eye sensitivity around pregnancy).
9. Host sign-in is email + Google at launch; phone sign-in later.
10. Live features run on short polling at launch; WebSockets come later.
11. Signature is not sold until its features exist.
