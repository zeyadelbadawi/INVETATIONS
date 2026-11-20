import type { Block, BlockType, EventContent } from "@/content/schema";
import { contentSchema } from "@/content/schema";
import type { EventKind, OverlaySlot, Palette, Template } from "./types";

const L = (ar: string, en: string) => ({ ar, en });

const palettes: Palette[] = [
  {
    id: "sand",
    name: L("رملي", "Sand"),
    tokens: { ink: "#1d1a16", paper: "#f6efe4", accent: "#b5552d", accentSoft: "#ecd9c6", onAccent: "#ffffff" },
  },
  {
    id: "night",
    name: L("ليلي", "Night"),
    tokens: { ink: "#f3efe8", paper: "#14131a", accent: "#e9b44c", accentSoft: "#2a2733", onAccent: "#14131a" },
  },
  {
    id: "garden",
    name: L("حديقة", "Garden"),
    tokens: { ink: "#18231d", paper: "#f1f4ec", accent: "#2f7d5b", accentSoft: "#d5e3d3", onAccent: "#ffffff" },
  },
];

const fontPairs = [{ id: "classic", name: L("كلاسيكي", "Classic") }];

// Opening scenes generated and approved on 2026-11-20 (docs/footage/sequence-log.md).
// Template ids keep their original names so events already created still resolve.
const scene = (id: string) => ({ id, rev: 1, scrollVh: 260, holdVh: 80, gate: true }) as const;
const doorsScene = scene("wedding.doors");
const boxScene = scene("reveal.box");
const stageScene = scene("corporate.stage");

// One line of copy on the footage. Positions are percentages of the frame: the
// 16:9 desktop file and the 4:5 phone crop (the middle 45% of the same frame),
// chosen on the calm, dark parts of each scene's last frame. Phones show only
// x 21–79 of their crop, and the bottom ~12% of every screen belongs to the
// "Details" button, so nothing is placed there. Lines whose y values sit within
// 20 points of each other share one scrim (see OpeningScene).
type Place = [x: number, y: number, width: number];
const line = (sceneId: string) => (field: string, role: OverlaySlot["role"], hold: [number, number], desktop: Place, mobile: Place): OverlaySlot => ({
  field,
  scene: sceneId,
  role,
  appear: { on: "hold", from: hold[0], to: hold[1] },
  position: {
    desktop: { x: desktop[0], y: desktop[1], width: desktop[2] },
    mobile: { x: mobile[0], y: mobile[1], width: mobile[2] },
  },
  align: "center",
  maxLines: 2,
  wash: true,
});

const templates: Template[] = [
  {
    id: "wedding-draft",
    version: 1,
    kind: "wedding",
    name: L("زفاف — باب الجنينة", "Wedding — Garden doors"),
    description: L("ممر فوانيس لحد باب خشب منقوش بيتفتح على النور", "A lantern-lit path to carved doors opening onto warm light"),
    scenes: [doorsScene],
    fields: [
      { key: "eyebrow", label: L("سطر علوي", "Opening line"), maxLength: 80, required: false, placeholder: L("نتشرف بدعوتكم لحضور زفاف", "Together with their families") },
      { key: "partner_one", label: L("الاسم الأول", "First name"), maxLength: 40, required: true },
      { key: "partner_two", label: L("الاسم الثاني", "Second name"), maxLength: 40, required: true },
      { key: "date_line", label: L("سطر التاريخ", "Date line"), maxLength: 80, required: false },
    ],
    overlays: [
      // The lower, dark carved panels of the doors, under the lit lattice and above the steps.
      line(doorsScene.id)("eyebrow", "eyebrow", [0.02, 0.24], [50, 45.5, 50], [50, 47, 84]),
      line(doorsScene.id)("partner_one", "title", [0.1, 0.34], [50, 55.5, 60], [50, 56, 84]),
      line(doorsScene.id)("partner_two", "title", [0.2, 0.44], [50, 72, 60], [50, 69, 84]),
      line(doorsScene.id)("date_line", "subtitle", [0.48, 0.72], [50, 82.5, 50], [50, 78.5, 84]),
    ],
    splash: { kind: "initials", from: ["partner_one", "partner_two"] },
    blocks: [
      { type: "details", enabled: true },
      { type: "countdown", enabled: true },
      { type: "quote", enabled: false },
      { type: "story", enabled: false },
      { type: "families", enabled: true },
      { type: "programme", enabled: true },
      { type: "location", enabled: true },
      { type: "dress_code", enabled: false },
      { type: "notes", enabled: false },
      { type: "faq", enabled: false },
    ],
    palettes,
    fontPairs,
    teams: [
      { key: "groom", name: L("أهل العريس", "Groom's side"), color: "team-a" },
      { key: "bride", name: L("أهل العروسة", "Bride's side"), color: "team-b" },
      { key: "friends", name: L("الأصحاب", "Friends"), color: "team-c" },
    ],
    teamJoin: "pick",
  },
  {
    id: "reveal-draft",
    version: 1,
    kind: "gender_reveal",
    name: L("كشف نوع المولود — الصندوق المقفول", "Gender reveal — The sealed box"),
    description: L("صندوق هدية محايد بيبدأ النور يطلع منه، والإجابة بتظهر في وقتها بس", "A neutral gift box that starts to glow; the answer appears only at the reveal"),
    scenes: [boxScene],
    fields: [
      { key: "eyebrow", label: L("سطر علوي", "Opening line"), maxLength: 80, required: false, placeholder: L("ولد ولا بنت؟", "Boy or girl?") },
      { key: "parents", label: L("اسم الأب والأم", "Parents' names"), maxLength: 80, required: true },
      { key: "date_line", label: L("سطر التاريخ", "Date line"), maxLength: 80, required: false },
    ],
    overlays: [
      // The dark wall above the box. On phones the box fills the width, so the date drops under the table.
      line(boxScene.id)("eyebrow", "eyebrow", [0.02, 0.24], [50, 11.5, 40], [50, 15, 84]),
      line(boxScene.id)("parents", "title", [0.1, 0.36], [50, 20.5, 50], [50, 23, 84]),
      line(boxScene.id)("date_line", "subtitle", [0.46, 0.7], [50, 29.5, 40], [50, 87, 84]),
    ],
    splash: { kind: "initials", from: ["parents"] },
    blocks: [
      { type: "details", enabled: true },
      { type: "countdown", enabled: true },
      { type: "location", enabled: true },
      { type: "notes", enabled: false },
    ],
    palettes,
    fontPairs,
    teams: [
      { key: "boy", name: L("تيم ولد", "Team Boy"), color: "team-a" },
      { key: "girl", name: L("تيم بنت", "Team Girl"), color: "team-b" },
    ],
    teamJoin: "pick",
    reveal: { neutral: true, styles: ["balloon", "scratch"] },
  },
  {
    id: "corporate-draft",
    version: 1,
    kind: "corporate",
    name: L("فعالية شركات — القاعة", "Corporate event — The hall"),
    description: L("ممر القاعة لحد شاشة كبيرة عليها اسم شركتك", "Down the aisle to a wide screen with your company's name"),
    scenes: [stageScene],
    fields: [
      { key: "company", label: L("اسم الشركة", "Company"), maxLength: 60, required: true },
      { key: "title", label: L("اسم الفعالية", "Event title"), maxLength: 80, required: true },
      { key: "date_line", label: L("سطر التاريخ", "Date line"), maxLength: 80, required: false },
    ],
    overlays: [
      // The dark backdrop of the stage, between the spotlight and the haze.
      line(stageScene.id)("company", "eyebrow", [0.02, 0.24], [50, 20, 50], [50, 21, 84]),
      line(stageScene.id)("title", "title", [0.1, 0.36], [50, 31, 60], [50, 30.5, 84]),
      line(stageScene.id)("date_line", "subtitle", [0.46, 0.7], [50, 42, 50], [50, 40, 84]),
    ],
    splash: { kind: "initials", from: ["company"] },
    blocks: [
      { type: "details", enabled: true },
      { type: "countdown", enabled: true },
      { type: "programme", enabled: true },
      { type: "people", enabled: true },
      { type: "location", enabled: true },
      { type: "dress_code", enabled: false },
      { type: "contact", enabled: true },
      { type: "faq", enabled: false },
    ],
    palettes,
    fontPairs,
    teams: [
      { key: "house_a", name: L("الفريق الأول", "House One"), color: "team-a" },
      { key: "house_b", name: L("الفريق الثاني", "House Two"), color: "team-b" },
    ],
    teamJoin: "assigned",
  },
];

export function listTemplates(kind?: EventKind): Template[] {
  return kind ? templates.filter((t) => t.kind === kind) : templates;
}

export function getTemplate(id: string, version: number): Template | null {
  return templates.find((t) => t.id === id && t.version === version) ?? null;
}

export function getPalette(template: Template, id: string | undefined): Palette {
  return template.palettes.find((p) => p.id === id) ?? template.palettes[0];
}

function blockId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0");
}

const empty = { ar: "", en: "" };

// A new block with every field at its default, so the editor always has a complete object.
export function newBlock(type: BlockType, enabled = true): Block {
  const base = { id: blockId(), enabled };
  switch (type) {
    case "details":
      return { ...base, type, startsAt: null, doorsAt: null, venue: empty, city: empty };
    case "countdown":
      return { ...base, type };
    case "programme":
      return { ...base, type, title: empty, items: [] };
    case "location":
      return { ...base, type, label: empty, address: empty, lat: null, lng: null, parking: empty };
    case "story":
      return { ...base, type, title: empty, body: empty };
    case "families":
      return { ...base, type, sides: [] };
    case "gallery":
      return { ...base, type, images: [] };
    case "quote":
      return { ...base, type, body: empty, source: empty };
    case "dress_code":
      return { ...base, type, note: empty, colors: [] };
    case "notes":
      return { ...base, type, title: empty, items: [] };
    case "faq":
      return { ...base, type, items: [] };
    case "people":
      return { ...base, type, title: empty, items: [] };
    case "contact":
      return { ...base, type, name: empty, phone: null, link: null };
  }
}

export function initialContent(template: Template): EventContent {
  return contentSchema.parse({
    fields: Object.fromEntries(template.fields.map((f) => [f.key, empty])),
    blocks: template.blocks.map((b) => newBlock(b.type, b.enabled)),
  });
}
