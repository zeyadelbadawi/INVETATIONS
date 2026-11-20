import type { Block, BlockType, EventContent } from "@/content/schema";
import { contentSchema } from "@/content/schema";
import type { EventKind, Palette, Template } from "./types";

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

const centered = (sceneId: string) => (field: string, role: "eyebrow" | "title" | "subtitle", y: number, from: number, to: number) => ({
  field,
  scene: sceneId,
  role,
  appear: { on: "hold" as const, from, to },
  position: { desktop: { x: 50, y, width: 60 }, mobile: { x: 50, y, width: 84 } },
  align: "center" as const,
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
      centered(doorsScene.id)("eyebrow", "eyebrow", 34, 0, 0.3),
      centered(doorsScene.id)("partner_one", "title", 46, 0.1, 0.45),
      centered(doorsScene.id)("partner_two", "title", 58, 0.2, 0.55),
      centered(doorsScene.id)("date_line", "subtitle", 70, 0.35, 0.7),
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
      centered(boxScene.id)("eyebrow", "eyebrow", 38, 0, 0.3),
      centered(boxScene.id)("parents", "title", 52, 0.1, 0.45),
      centered(boxScene.id)("date_line", "subtitle", 66, 0.3, 0.65),
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
      centered(stageScene.id)("company", "eyebrow", 38, 0, 0.3),
      centered(stageScene.id)("title", "title", 52, 0.1, 0.45),
      centered(stageScene.id)("date_line", "subtitle", 66, 0.3, 0.65),
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
