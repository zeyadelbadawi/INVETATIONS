import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { splitForPublish, type Block, type EventContent } from "../../src/content/schema";
import { getTemplate, initialContent } from "../../src/templates/registry";

process.loadEnvFile(".env.local");

export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const SHOTS = path.join(__dirname, "__screenshots__");
export const shot = (name: string) => path.join(SHOTS, `${name}.png`);

// A marker that must never appear in the public shell: it lives in the guest-only location block.
export const SENTINEL = "SENTINEL-ADDRESS-7781";

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function newCode(length = 22): string {
  return Array.from(randomBytes(length), (byte) => BASE62[byte % BASE62.length]).join("");
}
export function hashForDb(value: string): string {
  return `\\x${createHash("sha256").update(value).digest("hex")}`;
}

type Kind = "wedding" | "gender_reveal" | "corporate";
const TEMPLATE: Record<Kind, string> = { wedding: "wedding-draft", gender_reveal: "reveal-draft", corporate: "corporate-draft" };
const L = (ar: string, en: string) => ({ ar, en });

export function sampleContent(kind: Kind, opts: { arabicOnly?: boolean } = {}): EventContent {
  const template = getTemplate(TEMPLATE[kind], 1)!;
  const content = initialContent(template);
  const starts = new Date(Date.now() + 40 * 86_400_000);
  starts.setUTCHours(17, 0, 0, 0);
  const T = (ar: string, en: string) => (opts.arabicOnly ? L(ar, "") : L(ar, en));

  if (kind === "wedding") {
    content.fields = {
      eyebrow: T("نتشرف بدعوتكم لحضور زفاف", "Together with their families"),
      partner_one: T("ياسمين", "Yasmine"),
      partner_two: T("عمر", "Omar"),
      date_line: T("الجمعة 25 ديسمبر", "Friday 25 December"),
    };
  } else if (kind === "gender_reveal") {
    content.fields = { eyebrow: T("ولد ولا بنت؟", "Boy or girl?"), parents: T("سارة وكريم", "Sara & Karim"), date_line: T("استنونا يوم الجمعة", "Join us on Friday") };
  } else {
    content.fields = { company: T("شركة النيل", "Nile Co."), title: T("الحفل السنوي", "Annual Gala"), date_line: T("الخميس 17 ديسمبر", "Thursday 17 December") };
  }

  content.blocks = content.blocks.map((block): Block => {
    switch (block.type) {
      case "details":
        return { ...block, startsAt: starts.toISOString(), doorsAt: new Date(starts.getTime() - 3_600_000).toISOString(), venue: T("قاعة اللوتس", "Lotus Hall"), city: T("القاهرة الجديدة", "New Cairo") };
      case "quote":
        return { ...block, enabled: true, body: T("ومن آياته أن خلق لكم من أنفسكم أزواجاً لتسكنوا إليها", "And of His signs is that He created for you mates"), source: T("سورة الروم", "Ar-Rum 21") };
      case "story":
        return { ...block, enabled: true, title: T("حكايتنا", "Our story"), body: T("اتقابلنا في الجامعة من سبع سنين.\nومن يومها وإحنا مع بعض.", "We met at university seven years ago.\nWe have been together since.") };
      case "families":
        return {
          ...block,
          sides: [
            { id: "side0001", title: T("أهل العروسة", "Bride's family"), names: T("أ. محمود السيد\nم. هالة فؤاد", "Mr Mahmoud El-Sayed\nEng. Hala Fouad") },
            { id: "side0002", title: T("أهل العريس", "Groom's family"), names: T("د. خالد منصور\nأ. منى عادل", "Dr Khaled Mansour\nMrs Mona Adel") },
          ],
        };
      case "programme":
        return {
          ...block,
          title: T("برنامج اليوم", "Programme"),
          items: [
            { id: "prog0001", time: "7:00", title: T("استقبال الضيوف", "Guests arrive"), note: T("عصاير وشربات", "Juice and sharbat") },
            { id: "prog0002", time: "8:00", title: T("الزفة", "Zaffa"), note: L("", "") },
            { id: "prog0003", time: "9:30", title: T("العشا", "Dinner"), note: L("", "") },
          ],
        };
      case "location":
        return { ...block, label: T("قاعة اللوتس", "Lotus Hall"), address: T(`${SENTINEL} شارع التسعين، التجمع الخامس`, `${SENTINEL} 90th Street, Fifth Settlement`), lat: 30.0131, lng: 31.4913, parking: T("ركن مجاني عند البوابة 2", "Free parking at gate 2") };
      case "dress_code":
        return { ...block, enabled: true, note: T("رسمي — يفضّل ألوان هادية", "Formal, soft colours preferred"), colors: ["#b5552d", "#ecd9c6", "#2f7d5b"] };
      case "notes":
        return { ...block, enabled: true, title: T("خد بالك", "Good to know"), items: [{ id: "note0001", body: T("الحفل للكبار فقط", "Adults only, please") }, { id: "note0002", body: T("ممنوع التصوير أثناء كتب الكتاب", "No photos during the ceremony") }] };
      case "faq":
        return { ...block, enabled: true, items: [{ id: "faq00001", question: T("فيه ركن؟", "Is there parking?"), answer: T("أيوه، مجاني.", "Yes, free of charge.") }] };
      case "people":
        return { ...block, title: T("المتحدثون", "Speakers"), items: [{ id: "ppl00001", name: T("د. ليلى حسن", "Dr Laila Hassan"), role: T("الرئيس التنفيذي", "Chief Executive"), photo: null }] };
      case "contact":
        return { ...block, name: T("فريق التنظيم", "Events team"), phone: "+201001234567", link: null };
      default:
        return block;
    }
  });
  return content;
}

export type Seeded = {
  id: string;
  slug: string;
  kind: Kind;
  teams: { id: string; key: string }[];
  codes: { personal: string; group: string; other: string };
  labels: { personal: string; group: string };
};

export async function seedEvent(kind: Kind, opts: { palette?: string; status?: string; arabicOnly?: boolean } = {}): Promise<Seeded> {
  const email = `e2e-${randomBytes(6).toString("hex")}@example.test`;
  const user = await admin.auth.admin.createUser({ email, password: randomBytes(12).toString("hex"), email_confirm: true });
  if (user.error) throw user.error;

  const content = sampleContent(kind, opts);
  const published = splitForPublish(content);
  const start = content.blocks.find((b) => b.type === "details");
  const startsAt = start && start.type === "details" ? start.startsAt : null;
  const slug = `e2e-${kind.replace("_", "-")}-${randomBytes(3).toString("hex")}`;
  const { data: event, error } = await admin
    .from("events")
    .insert({
      owner_id: user.data.user.id,
      kind,
      slug,
      template_id: TEMPLATE[kind],
      template_version: 1,
      status: opts.status ?? "published",
      plan_id: "premium",
      published_version: 1,
      content,
      published_content: { public: published.public, guest: published.guest, order: published.order },
      theme: opts.palette ? { palette: opts.palette } : {},
      starts_at: startsAt,
      ends_at: startsAt ? new Date(new Date(startsAt).getTime() + 5 * 3_600_000).toISOString() : null,
    })
    .select("id, slug")
    .single();
  if (error || !event) throw error ?? new Error("event insert failed");

  const template = getTemplate(TEMPLATE[kind], 1)!;
  const { data: teams, error: teamError } = await admin
    .from("teams")
    .insert(template.teams.map((team, position) => ({ event_id: event.id, key: team.key, name_ar: team.name.ar, name_en: team.name.en, color: team.color, position })))
    .select("id, key");
  if (teamError || !teams) throw teamError ?? new Error("teams insert failed");
  await admin.from("live_state").insert({ event_id: event.id });

  const codes = { personal: newCode(), group: newCode(), other: newCode() };
  const labels = { personal: "عيلة الأستاذ أحمد", group: "أصحاب الجامعة" };
  const { error: invitationError } = await admin.from("invitations").insert([
    { event_id: event.id, kind: "personal", label: labels.personal, pax_cap: 4, max_players: 10, code_hash: hashForDb(codes.personal) },
    { event_id: event.id, kind: "group", label: labels.group, pax_cap: 1, max_players: 50, code_hash: hashForDb(codes.group) },
    { event_id: event.id, kind: "group", label: "زمايل الشغل", pax_cap: 1, max_players: 50, code_hash: hashForDb(codes.other) },
  ]);
  if (invitationError) throw invitationError;
  return { id: event.id, slug: event.slug, kind, teams, codes, labels };
}

export async function setScores(event: Seeded, scores: Record<string, [number, number]>): Promise<void> {
  const rows = event.teams.filter((team) => scores[team.key]).map((team) => ({ team_id: team.id, event_id: event.id, score: scores[team.key][0], active_players: scores[team.key][1] }));
  const { error } = await admin.from("team_scores").upsert(rows);
  if (error) throw error;
}

// Waits until the monogram splash has let go of the page.
export async function splashGone(page: Page): Promise<void> {
  await page.waitForFunction(() => !["hold", "leaving"].includes(document.documentElement.getAttribute("data-splash") ?? ""), undefined, { timeout: 30_000 });
}

export async function enterWithLink(page: Page, event: Seeded, code: string): Promise<void> {
  await page.goto(`/l/${event.slug}#${code}`);
  await page.waitForURL(new RegExp(`/i/${event.slug}/(ar|en)$`));
  await splashGone(page);
}

// Jumps past the opening scene the way a guest would: the always-visible button.
export async function skipOpening(page: Page): Promise<void> {
  await page.locator(".inv-cta").click();
  await page.waitForFunction(() => (document.getElementById("details")?.getBoundingClientRect().top ?? 9999) < 200);
}

export async function scrollTo(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.waitForTimeout(350);
}
