// Counting words. Arabic has a separate form for one, two, three to ten and
// eleven and up ("نقطة واحدة", "نقطتين", "3 نقط", "11 نقطة"); Intl.PluralRules
// knows which applies to a number, the words come from the caller.

const arRules = new Intl.PluralRules("ar");
const enRules = new Intl.PluralRules("en");

// Whole numbers stay whole; a fraction (a share of points) is shown to one place.
export function countNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// one / two: the whole phrase, without the digit. few (3–10) and many (11+, also
// 0 and fractions): the noun that follows the digit.
export type ArForms = { one: string; two: string; few: string; many: string };

export function arCount(n: number, forms: ArForms): string {
  switch (arRules.select(n)) {
    case "one":
      return forms.one;
    case "two":
      return forms.two;
    case "few":
      return `${countNumber(n)} ${forms.few}`;
    default:
      return `${countNumber(n)} ${forms.many}`;
  }
}

// The word alone, for a label under a number shown on its own (the countdown).
export function arWord(n: number, forms: { single: string; plural: string }): string {
  const category = arRules.select(n);
  return category === "few" || category === "two" ? forms.plural : forms.single;
}

export function enCount(n: number, one: string, other: string): string {
  return `${countNumber(n)} ${enRules.select(n) === "one" ? one : other}`;
}

export function enWord(n: number, one: string, other: string): string {
  return enRules.select(n) === "one" ? one : other;
}
