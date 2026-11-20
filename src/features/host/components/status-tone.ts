// How an event status reads in the UI: live in accent, stopped in red, waiting underlined, the rest muted.
export function statusTone(status: string): "success" | "danger" | "highlight" | "info" {
  if (status === "published") return "success";
  if (status === "cancelled") return "danger";
  if (status === "postponed") return "highlight";
  return "info";
}
