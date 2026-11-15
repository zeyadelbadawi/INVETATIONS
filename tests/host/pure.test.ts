// Host-side helpers that need no database.
import { describe, expect, it } from "vitest";
import { safeNext } from "@/features/host/lib/redirect";
import { csvCell, toCsv } from "@/features/host/lib/csv";
import { hashPasscode, verifyPasscode } from "@/features/host/lib/passcode";
import { normalisePhone, slugBase } from "@/features/host/lib/text";
import { isoToZoned, zonedToIso } from "@/features/host/lib/time";
import { parseGuestLines } from "@/features/host/lib/bulk";

describe("next redirect validation", () => {
  it("accepts relative paths inside the signed-in area of the same locale", () => {
    expect(safeNext("/ar/app", "ar")).toBe("/ar/app");
    expect(safeNext("/ar/app/events/123/edit", "ar")).toBe("/ar/app/events/123/edit");
    expect(safeNext("/en/app/new?kind=wedding", "en")).toBe("/en/app/new?kind=wedding");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    for (const bad of [
      "https://evil.example/ar/app",
      "http://evil.example",
      "//evil.example/ar/app",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "/ar/app//evil.example",
      "/ar/app/../../admin",
      "/ar/app/..%2f..%2fadmin/../x",
      "/ar/application",
      "/ar/app@evil.example",
      "/ar/app\n/x",
      "/ar/app#//evil.example",
      "/ar/admin",
      "/ar/login",
      "",
      " /ar/app",
    ]) {
      expect(safeNext(bad, "ar"), bad).toBe("/ar/app");
    }
  });

  it("rejects another locale's area and non-strings", () => {
    expect(safeNext("/en/app/events", "ar")).toBe("/ar/app");
    expect(safeNext(undefined, "en")).toBe("/en/app");
    expect(safeNext(["/ar/app"], "ar")).toBe("/ar/app");
    expect(safeNext(`/ar/app/${"a".repeat(600)}`, "ar")).toBe("/ar/app");
  });
});

describe("CSV export", () => {
  it("neutralises cells a spreadsheet would evaluate", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+201001234567")).toBe("'+201001234567");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("\rcmd")).toBe("\"'\rcmd\"");
  });

  it("leaves ordinary text alone and quotes separators", () => {
    expect(csvCell("Ahmed & family")).toBe("Ahmed & family");
    expect(csvCell("أحمد وأسرته")).toBe("أحمد وأسرته");
    expect(csvCell("a,b")).toBe("\"a,b\"");
    expect(csvCell(4)).toBe("4");
    expect(csvCell(null)).toBe("");
    expect(toCsv([["a", "=1"], ["b", 2]])).toBe("a,'=1\r\nb,2\r\n");
  });
});

describe("passcode hashing", () => {
  it("round-trips and rejects the wrong passcode", async () => {
    const stored = await hashPasscode("farah2026");
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPasscode("farah2026", stored)).toBe(true);
    expect(await verifyPasscode("farah2027", stored)).toBe(false);
    expect(await verifyPasscode("", stored)).toBe(false);
  });

  it("salts every hash and refuses short passcodes and malformed hashes", async () => {
    expect(await hashPasscode("same-passcode")).not.toBe(await hashPasscode("same-passcode"));
    await expect(hashPasscode("12345")).rejects.toThrow();
    expect(await verifyPasscode("anything", null)).toBe(false);
    expect(await verifyPasscode("anything", "plain-text")).toBe(false);
    expect(await verifyPasscode("anything", "scrypt$1073741824$8$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
  });
});

describe("phones and slugs", () => {
  it("normalises Egyptian and international numbers to E.164", () => {
    expect(normalisePhone("01001234567")).toBe("+201001234567");
    expect(normalisePhone("010 0123 4567")).toBe("+201001234567");
    expect(normalisePhone("٠١٠٠١٢٣٤٥٦٧")).toBe("+201001234567");
    expect(normalisePhone("+20 100 123 4567")).toBe("+201001234567");
    expect(normalisePhone("00201001234567")).toBe("+201001234567");
    expect(normalisePhone("201001234567")).toBe("+201001234567");
    expect(normalisePhone("+966501234567")).toBe("+966501234567");
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("=cmd")).toBeNull();
    expect(normalisePhone("")).toBeNull();
  });

  it("builds an ASCII slug base and falls back to the kind", () => {
    expect(slugBase("Sara & Omar's Wedding!", "wedding")).toBe("sara-omar-s-wedding");
    expect(slugBase("فرح سارة وعمر", "wedding")).toBe("wedding");
    expect(slugBase("بيبي", "gender_reveal")).toBe("gender-reveal");
    expect(slugBase("Café Été", "corporate")).toBe("cafe-ete");
    expect(slugBase("x".repeat(90), "wedding").length).toBeLessThanOrEqual(40);
  });
});

describe("event time in a timezone", () => {
  it("converts wall time to an instant and back", () => {
    // Cairo is UTC+2 in December.
    expect(zonedToIso("2026-12-31T19:30", "Africa/Cairo")).toBe("2026-12-31T17:30:00.000Z");
    expect(isoToZoned("2026-12-31T17:30:00.000Z", "Africa/Cairo")).toBe("2026-12-31T19:30");
    expect(zonedToIso("2026-07-01T12:00", "America/New_York")).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedToIso("not a date", "Africa/Cairo")).toBeNull();
    expect(isoToZoned(null, "Africa/Cairo")).toBe("");
  });
});

describe("pasted guest list", () => {
  it("reads name, phone and party size with Latin or Arabic separators", () => {
    const parsed = parseGuestLines("Ahmed & family, 01001234567, 4\nمنى حسن، ٠١١١٢٣٤٥٦٧٨، ٢\n\nOmar\nHoda, 3", 50);
    expect(parsed.badLines).toEqual([]);
    expect(parsed.rows).toEqual([
      { label: "Ahmed & family", phone: "+201001234567", size: 4 },
      { label: "منى حسن", phone: "+201112345678", size: 2 },
      { label: "Omar", phone: null, size: 1 },
      { label: "Hoda", phone: null, size: 3 },
    ]);
  });

  it("reports the lines it cannot read instead of guessing", () => {
    const parsed = parseGuestLines("Good, 01001234567, 2\n, 01001234567, 2\nBad phone, 12345678901234567890, 2\nToo big, 01001234567, 99\nExtra, 01001234567, 2, more", 50);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.badLines).toEqual([2, 3, 4, 5]);
  });
});
