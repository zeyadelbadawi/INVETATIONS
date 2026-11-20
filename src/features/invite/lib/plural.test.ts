import { describe, expect, it } from "vitest";
import { arCount, arWord, countNumber, enCount } from "./plural";
import { getMessages } from "../messages";

const points = { one: "نقطة واحدة", two: "نقطتين", few: "نقط", many: "نقطة" };

describe("Arabic counting", () => {
  it("uses the one, two, few and many forms", () => {
    expect(arCount(1, points)).toBe("نقطة واحدة");
    expect(arCount(2, points)).toBe("نقطتين");
    expect(arCount(5, points)).toBe("5 نقط");
    expect(arCount(10, points)).toBe("10 نقط");
    expect(arCount(11, points)).toBe("11 نقطة");
    expect(arCount(100, points)).toBe("100 نقطة");
  });

  it("labels under a lone number take the plural for 2 to 10", () => {
    const minutes = { single: "دقيقة", plural: "دقايق" };
    expect(arWord(1, minutes)).toBe("دقيقة");
    expect(arWord(2, minutes)).toBe("دقايق");
    expect(arWord(5, minutes)).toBe("دقايق");
    expect(arWord(44, minutes)).toBe("دقيقة");
  });

  it("keeps fractions to one place", () => {
    expect(countNumber(6.6667)).toBe("6.7");
    expect(countNumber(6)).toBe("6");
  });
});

describe("guest copy", () => {
  it("counts players, votes and party sizes in proper Arabic", () => {
    const ar = getMessages("ar");
    expect(ar.play.players(0)).toBe("مفيش لاعبين لسه");
    expect(ar.play.players(6)).toBe("6 لاعبين");
    expect(ar.play.players(12)).toBe("12 لاعب");
    expect(ar.play.playersWithYou(1)).toBe("إنت أول واحد فيه");
    expect(ar.games.votes(2)).toBe("صوتين");
    expect(ar.rsvp.summary(3, 0)).toBe("عدد الأفراد: 3 أفراد");
    expect(ar.blocks.minutes(5)).toBe("دقايق");
  });

  it("counts in English", () => {
    expect(enCount(1, "point", "points")).toBe("1 point");
    expect(getMessages("en").common.points(3)).toBe("3 points");
  });
});
