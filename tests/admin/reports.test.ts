// Back-office takedown queue: reported posts and posts pending for over a day,
// across events; never guest phone numbers.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { randomBytes } from "node:crypto";
import { admin, hash, makeEvent, makeHost } from "../db/helpers";
import type { AdminClient } from "@/lib/supabase/admin";
import { listReportedPosts } from "@/features/admin/lib/reports";
import { staffTakedown } from "@/features/control/lib";
import { makeStaff } from "./helpers";

const db = admin as unknown as AdminClient;

describe("reported posts queue", () => {
  it("lists reported and long-pending posts, hides fresh and taken-down ones", async () => {
    const host = await makeHost("report-host");
    const staff = await makeStaff("report-support", "support");
    const event = await makeEvent(host.id);
    const phone = "+201000000999";
    const { data: invitation } = await admin
      .from("invitations")
      .insert({ event_id: event.id, kind: "personal", label: "Family", phone, code_hash: hash(randomBytes(16).toString("hex")) })
      .select("id")
      .single();
    const { data: player } = await admin.from("players").insert({ event_id: event.id, invitation_id: invitation!.id, name: "Guest" }).select("id").single();
    const old = new Date(Date.now() - 26 * 3_600_000).toISOString();
    const now = new Date().toISOString();
    // Same keys on every row: a bulk insert fills missing columns with null.
    const post = (body: string, extra: { status: string; reported_count?: number; created_at?: string }) => ({
      event_id: event.id,
      player_id: player!.id,
      kind: "text",
      body,
      status: extra.status,
      reported_count: extra.reported_count ?? 0,
      created_at: extra.created_at ?? now,
    });
    const { data: posts } = await admin
      .from("wall_posts")
      .insert([
        post("reported", { status: "visible", reported_count: 2 }),
        post("old pending", { status: "pending", created_at: old }),
        post("fresh pending", { status: "pending" }),
        post("fine", { status: "visible" }),
        post("gone", { status: "visible", reported_count: 5 }),
      ])
      .select("id, body");
    expect(posts).toHaveLength(5);
    const id = (body: string) => posts!.find((p) => p.body === body)!.id;
    await staffTakedown(staff.id, id("gone"));

    const queue = (await listReportedPosts(db)).filter((p) => p.eventId === event.id);
    expect(queue.map((p) => p.body).sort()).toEqual(["old pending", "reported"]);
    expect(queue.find((p) => p.body === "reported")).toMatchObject({ reportedCount: 2, eventSlug: event.slug });
    expect(JSON.stringify(queue)).not.toContain(phone);
    expect(JSON.stringify(queue)).not.toContain(player!.id);
  });
});
