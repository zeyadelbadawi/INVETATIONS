import type { Messages } from "../messages";

// What a reveal style receives. Everything answer-dependent is in memory only
// until the guest opens it: nothing here is put in the DOM beforehand.
export type RevealStyleProps = {
  babies: { label: string; color: string }[];
  t: Messages["reveal"];
  onDone: () => void;
};
