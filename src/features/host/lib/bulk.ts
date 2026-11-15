import { latinDigits, normalisePhone } from "./text";

export type ParsedRow = { label: string; phone: string | null; size: number };
export type ParsedList = { rows: ParsedRow[]; badLines: number[] };

// Reads pasted lines of "name, phone, party size" in the browser. Commas
// (Latin or Arabic), semicolons and tabs separate the parts; phone and size
// are optional. The server validates every row again.
export function parseGuestLines(text: string, maxSize: number): ParsedList {
  const rows: ParsedRow[] = [];
  const badLines: number[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "") return;
    const parts = line.split(/[,،;\t]/).map((part) => part.trim());
    const label = parts[0] ?? "";
    let phoneText = parts[1] ?? "";
    let sizeText = parts[2] ?? "";
    // "Name, 4" — a short number in second place is the party size.
    if (sizeText === "" && /^[0-9٠-٩۰-۹]{1,3}$/.test(phoneText)) {
      sizeText = phoneText;
      phoneText = "";
    }
    const phone = phoneText === "" ? null : normalisePhone(phoneText);
    const size = sizeText === "" ? 1 : Number(latinDigits(sizeText));
    const ok =
      label.length > 0 &&
      label.length <= 120 &&
      parts.length <= 3 &&
      (phoneText === "" || phone !== null) &&
      Number.isInteger(size) &&
      size >= 1 &&
      size <= maxSize;
    if (ok) rows.push({ label, phone, size });
    else badLines.push(index + 1);
  });
  return { rows, badLines };
}
