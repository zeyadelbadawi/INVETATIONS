// Every price on the marketing site comes from here. Launch scope §5; the host
// dashboard reads the charged price from the `plans` table, so keep the two in step.
export const pricing = {
  essential: 350,
  premium: 750,
  doneForYou: 1000,
  essentialMaxGuests: 100,
  doneForYouRevisions: 2,
  doneForYouHours: 48,
  guestMediaMonths: 12,
} as const;

export type PlanId = "free" | "essential" | "premium";

// Western digits with grouping in both languages, as on the invitations.
export function egp(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount);
}
