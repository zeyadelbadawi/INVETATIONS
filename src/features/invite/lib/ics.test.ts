import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText } from "./ics";

const BS = String.fromCharCode(92); // one backslash

describe("ICS text escaping (RFC 5545 §3.3.11)", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeIcsText("a;b")).toBe(`a${BS};b`);
    expect(escapeIcsText(`Hall 2, Floor 3; Gate${BS}B\nNile St`)).toBe(`Hall 2${BS}, Floor 3${BS}; Gate${BS}${BS}B${BS}nNile St`);
  });

  it("keeps a semicolon in a location from splitting the property", () => {
    const ics = buildIcs(
      {
        uid: "x@lamma",
        title: "Sara; Omar",
        description: "",
        location: "Cairo; Zamalek",
        start: "2026-12-31T17:30:00Z",
        end: null,
        timeZone: "Africa/Cairo",
        url: "https://example.test/i/x",
      },
      new Date("2026-11-16T00:00:00Z"),
    );
    expect(ics).toContain(`SUMMARY:Sara${BS}; Omar\r\n`);
    expect(ics).toContain(`LOCATION:Cairo${BS}; Zamalek\r\n`);
  });
});
