// Normalises a display name typed by a guest or host (security rule 6):
// NFC, no control / bidi-override / zero-width characters, collapsed spaces.
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g;

export function normaliseName(input: string, maxLength = 40): string {
  const cleaned = input.normalize("NFC").replace(FORBIDDEN, "").replace(/\s+/g, " ").trim();
  return Array.from(cleaned).slice(0, maxLength).join("");
}

// Loose comparison key used to flag look-alike names (e.g. someone joining as the bride).
export function nameKey(input: string): string {
  return normaliseName(input)
    .toLowerCase()
    .replace(/[ً-ٟـ]/g, "") // Arabic diacritics and tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, "");
}
