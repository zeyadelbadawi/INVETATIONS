// Builds the SQL that creates the three public demo invitations (one per
// occasion), using the product's own templates, content schema, publish split
// and question banks — the same shapes the editor and publish flow write.
//
//   npx -y tsx tools/demo/build-demo-sql.ts <owner-user-id> > demo.sql
//
// Prints the SQL to stdout and the demo links (with their public codes) to stderr.
// The demo links are public on purpose: their codes are shown on the marketing site.

import { createHash, randomBytes } from "node:crypto";
import { contentSchema, splitForPublish, type Block, type EventContent } from "@/content/schema";
import { getTemplate, initialContent } from "@/templates/registry";
import { starterGames } from "@/play/banks";
import { openGame } from "@/play/registry";

type Kind = "wedding" | "gender_reveal" | "corporate";
const L = (ar: string, en: string) => ({ ar, en });
const owner = process.argv[2];
if (!owner || !/^[0-9a-f-]{36}$/.test(owner)) throw new Error("usage: build-demo-sql.ts <owner-user-id>");

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const newCode = () => Array.from(randomBytes(22), (b) => BASE62[b % BASE62.length]).join("");
const hashHex = (v: string) => createHash("sha256").update(v).digest("hex");
const q = (v: unknown) => `'${(typeof v === "string" ? v : JSON.stringify(v)).replace(/'/g, "''")}'`;

const DEMOS: { kind: Kind; slug: string; template: string; startsAt: string; occasion: "wedding" | "gender_reveal" | "corporate" }[] = [
  { kind: "wedding", slug: "demo-wedding", template: "wedding-draft", startsAt: "2027-02-12T17:00:00.000Z", occasion: "wedding" },
  { kind: "gender_reveal", slug: "demo-gender-reveal", template: "reveal-draft", startsAt: "2027-01-22T16:00:00.000Z", occasion: "gender_reveal" },
  { kind: "corporate", slug: "demo-corporate", template: "corporate-draft", startsAt: "2027-03-04T15:00:00.000Z", occasion: "corporate" },
];

function content(kind: Kind, template: string, startsAt: string): EventContent {
  const c = initialContent(getTemplate(template, 1)!);
  const starts = new Date(startsAt);
  const doors = new Date(starts.getTime() - 3_600_000).toISOString();
  if (kind === "wedding") {
    c.fields = { eyebrow: L("بكل الحب ندعوكم لحضور زفاف", "Together with their families"), partner_one: L("ليلى", "Laila"), partner_two: L("آدم", "Adam"), date_line: L("الجمعة 12 فبراير", "Friday 12 February") };
  } else if (kind === "gender_reveal") {
    c.fields = { eyebrow: L("ولد ولا بنت؟", "Boy or girl?"), parents: L("مريم ويوسف", "Mariam & Youssef"), date_line: L("الجمعة 22 يناير", "Friday 22 January") };
  } else {
    c.fields = { company: L("لَمّة", "Lamma"), title: L("الملتقى السنوي", "Annual Gathering"), date_line: L("الخميس 4 مارس", "Thursday 4 March") };
  }
  const venue = kind === "corporate" ? L("قاعة المؤتمرات الكبرى", "Grand Conference Hall") : L("قاعة الياسمين", "Jasmine Hall");
  c.blocks = c.blocks.map((block): Block => {
    switch (block.type) {
      case "details":
        return { ...block, startsAt, doorsAt: doors, venue, city: L("القاهرة الجديدة", "New Cairo") };
      case "quote":
        return kind === "wedding" ? { ...block, enabled: true, body: L("ومن آياته أن خلق لكم من أنفسكم أزواجاً لتسكنوا إليها", "And of His signs is that He created for you mates, that you may find tranquillity in them"), source: L("سورة الروم", "Ar-Rum 21") } : block;
      case "story":
        return kind === "wedding" ? { ...block, enabled: true, title: L("حكايتنا", "Our story"), body: L("اتقابلنا في ورشة رسم في الزمالك من خمس سنين.\nومن ساعتها وإحنا بنرسم كل حاجة سوا.", "We met at a drawing workshop in Zamalek five years ago.\nWe have been drawing everything together since.") } : block;
      case "families":
        return { ...block, sides: [
          { id: "side0001", title: L("أهل العروسة", "Bride's family"), names: L("م. هشام فؤاد\nأ. نادية سليم", "Eng. Hisham Fouad\nMrs Nadia Selim") },
          { id: "side0002", title: L("أهل العريس", "Groom's family"), names: L("د. طارق منصور\nأ. سلمى عادل", "Dr Tarek Mansour\nMrs Salma Adel") },
        ] };
      case "programme":
        return kind === "corporate"
          ? { ...block, title: L("برنامج اليوم", "Programme"), items: [
              { id: "prog0001", time: "5:00", title: L("التسجيل والاستقبال", "Registration"), note: L("قهوة وتعارف", "Coffee and introductions") },
              { id: "prog0002", time: "6:00", title: L("كلمة الافتتاح", "Opening talk"), note: L("", "") },
              { id: "prog0003", time: "7:00", title: L("مسابقة الأقسام وتوزيع الجوائز", "Department quiz and awards"), note: L("", "") },
              { id: "prog0004", time: "8:30", title: L("العشا", "Dinner"), note: L("", "") },
            ] }
          : { ...block, title: L("برنامج الليلة", "Tonight"), items: [
              { id: "prog0001", time: "7:00", title: L("استقبال الضيوف", "Guests arrive"), note: L("عصاير وشربات", "Juice and sharbat") },
              { id: "prog0002", time: "8:00", title: L("الزفة", "Zaffa"), note: L("", "") },
              { id: "prog0003", time: "9:30", title: L("العشا", "Dinner"), note: L("", "") },
            ] };
      case "location":
        return { ...block, label: venue, address: L("طريق التسعين الشمالي، التجمع الخامس", "North 90th Road, Fifth Settlement"), lat: 30.0287, lng: 31.4689, parking: L("ركن مجاني عند البوابة 2", "Free parking at gate 2") };
      case "people":
        return { ...block, title: L("المتحدثون", "Speakers"), items: [
          { id: "ppl00001", name: L("د. ليلى حسن", "Dr Laila Hassan"), role: L("المديرة التنفيذية", "Chief Executive"), photo: null },
          { id: "ppl00002", name: L("م. كريم سامي", "Eng. Karim Samy"), role: L("مدير المنتج", "Head of Product"), photo: null },
        ] };
      case "contact":
        return { ...block, name: L("فريق التنظيم", "Events team"), phone: "+201069942554", link: null };
      default:
        return block;
    }
  });
  return contentSchema.parse(c);
}

// Starter polls ship with placeholders the host fills in ("الاسم ١", "المرشّح ١" …).
// The demo fills them with real choices so nothing reads as a template.
const FILL: Record<string, [string, string][]> = {
  girl: [["ليلى", "Laila"], ["فريدة", "Farida"], ["نور", "Nour"], ["سلمى", "Salma"]],
  boy: [["آدم", "Adam"], ["يونس", "Younis"], ["زين", "Zein"], ["عمر", "Omar"]],
  nominee: [["منى من الحسابات", "Mona, Finance"], ["كريم من المبيعات", "Karim, Sales"], ["هبة من الموارد البشرية", "Heba, People"], ["أحمد من التقنية", "Ahmed, Technology"]],
  topic: [["خطة السنة الجاية", "Next year's plan"], ["تجربة العملاء", "Customer experience"], ["الشغل من البيت", "Working from home"], ["التدريب والتطوير", "Training and growth"]],
};
const DIGITS = "١٢٣٤";
function fillPlaceholders(config: unknown): unknown {
  const c = JSON.parse(JSON.stringify(config)) as { questions?: { id: string; options?: { label: { ar: string; en: string } }[] }[] };
  for (const question of c.questions ?? []) {
    for (const option of question.options ?? []) {
      const m = /^(الاسم|المرشّح|الموضوع) ([١٢٣٤])$/.exec(option.label.ar);
      if (!m) continue;
      const list = m[1] === "الاسم" ? (question.id.includes("boy") ? FILL.boy : FILL.girl) : m[1] === "المرشّح" ? FILL.nominee : FILL.topic;
      const [ar, en] = list[DIGITS.indexOf(m[2])];
      option.label = { ar, en };
    }
  }
  return c;
}

const out: string[] = ["begin;"];
const links: string[] = [];
for (const demo of DEMOS) {
  const c = content(demo.kind, demo.template, demo.startsAt);
  const p = splitForPublish(c);
  const template = getTemplate(demo.template, 1)!;
  const code = newCode();
  const ends = new Date(new Date(demo.startsAt).getTime() + 5 * 3_600_000).toISOString();
  // Demo safety: no visitor names in rosters, photos seen only by the host, open link without approval.
  const settings = { rosterVisible: false, sharingEnabled: true, openLinkApproval: false, photosHostOnly: true, rsvpDeadline: null, lockTeams: false };
  out.push(`with e as (
  insert into public.events (owner_id, kind, slug, status, template_id, template_version, plan_id, published_version, content, published_content, theme, settings, default_locale, starts_at, ends_at)
  values (${q(owner)}, ${q(demo.kind)}, ${q(demo.slug)}, 'published', ${q(demo.template)}, 1, 'premium', 1, ${q(c)}::jsonb,
          ${q({ public: p.public, guest: p.guest, order: p.order })}::jsonb, '{}'::jsonb, ${q(settings)}::jsonb, 'ar', ${q(demo.startsAt)}, ${q(ends)})
  returning id
), t as (
  insert into public.teams (event_id, key, name_ar, name_en, color, position)
  select e.id, x.key, x.name_ar, x.name_en, x.color, x.position from e, (values ${template.teams
    .map((team, i) => `(${q(team.key)}, ${q(team.name.ar)}, ${q(team.name.en)}, ${q(team.color)}, ${i})`)
    .join(", ")}) as x(key, name_ar, name_en, color, position)
  returning 1
), l as (
  insert into public.live_state (event_id) select id from e returning 1
), i as (
  insert into public.invitations (event_id, kind, label, pax_cap, max_players, code_hash)
  select id, 'open', ${q("ديمو — اللينك العام")}, 1, 2000, decode(${q(hashHex(code))}, 'hex') from e returning 1
)
insert into public.games (event_id, kind, config, position, state)
select e.id, g.kind, g.config::jsonb, g.position, g.state from e, (values ${starterGames(demo.occasion)
    .map((g, i) => {
      const bound = openGame(g.kind, g.config);
      // Games that score against the host's answers stay hidden: the demo has no host answering.
      const state = bound && !bound.needsTruthOnSubmit ? "open" : "hidden";
      return `(${q(g.kind)}, ${q(fillPlaceholders(g.config))}, ${i}, ${q(state)})`;
    })
    .join(", ")}) as g(kind, config, position, state);`);
  links.push(`${demo.kind}: /l/${demo.slug}#${code}`);
}
out.push("commit;");
console.log(out.join("\n"));
console.error(links.join("\n"));
