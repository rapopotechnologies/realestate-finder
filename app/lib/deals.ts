// The deal pipeline (My List): stages, strategies and what can be logged on a deal.
// Values match the check constraints in the crm_phase1 migration.

import type { Tables } from "@/lib/supabase/types";
import { money } from "@/lib/format";

export type Stage = "interested" | "contacted" | "offer_made" | "under_contract" | "closed" | "passed";
export type Strategy = "undecided" | "wholesale" | "flip" | "brrrr" | "rental";
export type EventKind = "offer" | "call" | "text" | "email" | "letter" | "visit";
export type DealEvent = Tables<"deal_events">;

export const STAGES: { value: Stage; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "contacted", label: "Contacted" },
  { value: "offer_made", label: "Offer made" },
  { value: "under_contract", label: "Under contract" },
  { value: "closed", label: "Closed" },
  { value: "passed", label: "Passed" },
];

export const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: "undecided", label: "Undecided" },
  { value: "wholesale", label: "Wholesale" },
  { value: "flip", label: "Flip" },
  { value: "brrrr", label: "BRRRR" },
  { value: "rental", label: "Rental" },
];

export const CONTACT_KINDS: { value: Exclude<EventKind, "offer">; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "letter", label: "Letter" },
  { value: "visit", label: "Visit" },
];

export const OUTCOMES: { value: string; label: string }[] = [
  { value: "reached", label: "Reached them" },
  { value: "no_answer", label: "No answer" },
  { value: "voicemail", label: "Left voicemail" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "sent", label: "Sent" },
];

export const OFFER_TO: { value: string; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "agent", label: "Agent / broker" },
  { value: "auction", label: "At auction" },
  { value: "other", label: "Other" },
];

export const RESPONSES: { value: string; label: string }[] = [
  { value: "pending", label: "Waiting to hear" },
  { value: "countered", label: "Countered" },
  { value: "rejected", label: "Rejected" },
  { value: "accepted", label: "Accepted" },
  { value: "withdrawn", label: "Withdrawn" },
];

export const labelOf = (list: { value: string; label: string }[], value: string | null | undefined) =>
  list.find((x) => x.value === value)?.label ?? value ?? "";

/** Most recent offer among a deal's events (events may be in any order) */
export function latestOffer(events: Pick<DealEvent, "kind" | "occurred_at" | "offer_amount" | "offer_response" | "counter_amount">[]) {
  return events.filter((e) => e.kind === "offer").sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0] ?? null;
}

/** "Offered $45,000 · countered $60,000" */
export function offerSummary(e: Pick<DealEvent, "offer_amount" | "offer_response" | "counter_amount">) {
  const response = e.offer_response === "countered" && e.counter_amount != null
    ? `countered ${money(e.counter_amount)}`
    : e.offer_response && e.offer_response !== "pending" ? labelOf(RESPONSES, e.offer_response).toLowerCase() : null;
  return [`Offered ${money(e.offer_amount)}`, response].filter(Boolean).join(" · ");
}

/** Follow-up date relative to today: overdue, today, or upcoming */
export function followUpState(date: string | null | undefined): "overdue" | "today" | "upcoming" | null {
  if (!date) return null;
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  return date < today ? "overdue" : date === today ? "today" : "upcoming";
}
