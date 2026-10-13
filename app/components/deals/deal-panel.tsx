"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign, Mail, MapPin, MessageSquare, Phone, Send, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import {
  CONTACT_KINDS, OFFER_TO, OUTCOMES, RESPONSES, STAGES, STRATEGIES, followUpState, labelOf, latestOffer, offerSummary,
  type DealEvent, type EventKind, type Stage, type Strategy,
} from "@/lib/deals";
import { longDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Saved = Tables<"saved_properties">;
type Note = Tables<"notes">;
type LogMode = "offer" | "contact" | "note";

const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const today = () => new Date().toLocaleDateString("en-CA");
/** Logged for today: now (keeps the timeline in order); a past date: midday that day */
const loggedAt = (date: string) => (date === today() ? new Date() : new Date(`${date}T12:00:00`)).toISOString();
// Logging moves a deal forward, never back
const STAGE_AFTER: Partial<Record<EventKind, Stage>> = { offer: "offer_made", call: "contacted", text: "contacted", email: "contacted", letter: "contacted", visit: "contacted" };
const stageRank = (s: Stage) => STAGES.findIndex((x) => x.value === s);

const KIND_ICON: Record<EventKind | "note", typeof Phone> = {
  offer: CircleDollarSign, call: Phone, text: MessageSquare, email: Mail, letter: Send, visit: MapPin, note: StickyNote,
};

export function DealPanel({ propertyId, saved, events, notes }: {
  propertyId: string;
  saved: Saved | null;
  events: DealEvent[];
  notes: Note[];
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<LogMode>("offer");
  const [busy, setBusy] = useState(false);

  /** Create or update this deal's row on My List */
  async function saveDeal(patch: Partial<Pick<Saved, "status" | "strategy" | "next_follow_up">>) {
    const { error } = await supabase.from("saved_properties")
      .upsert({ property_id: propertyId, status: saved?.status ?? "interested", strategy: saved?.strategy ?? "undecided",
        next_follow_up: saved?.next_follow_up ?? null, ...patch }, { onConflict: "user_id,property_id" });
    if (error) throw error;
  }

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
      router.refresh();
    } catch {
      toast.error("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function logEvent(row: Omit<Tables<"deal_events">, "id" | "user_id" | "created_at" | "property_id">, followUp: string | null) {
    const { error } = await supabase.from("deal_events").insert({ ...row, property_id: propertyId });
    if (error) throw error;
    const next = STAGE_AFTER[row.kind as EventKind];
    const current = (saved?.status as Stage | undefined) ?? "interested";
    await saveDeal({
      status: next && stageRank(next) > stageRank(current) ? next : current,
      ...(followUp !== null ? { next_follow_up: followUp || null } : {}),
    });
  }

  const offer = latestOffer(events);
  const timeline = [
    ...events.map((e) => ({ at: e.occurred_at, key: `e-${e.id}`, event: e as DealEvent | null, note: null as Note | null })),
    ...notes.map((n) => ({ at: n.created_at, key: `n-${n.id}`, event: null, note: n })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const follow = followUpState(saved?.next_follow_up);

  return (
    <div className="space-y-5">
      {/* Stage, strategy, follow-up */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className="space-y-1.5">
          <Label htmlFor="deal-stage">Stage</Label>
          <select id="deal-stage" className={selectCls} value={saved?.status ?? ""} disabled={busy}
            onChange={(e) => run(async () => {
              if (e.target.value) return saveDeal({ status: e.target.value });
              const { error } = await supabase.from("saved_properties").delete().eq("property_id", propertyId);
              if (error) throw error;
            }, e.target.value ? `Moved to ${labelOf(STAGES, e.target.value)}` : "Removed from My List")}>
            <option value="">Not on My List</option>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deal-strategy">Strategy</Label>
          <select id="deal-strategy" className={selectCls} value={saved?.strategy ?? "undecided"} disabled={busy}
            onChange={(e) => run(() => saveDeal({ strategy: e.target.value as Strategy }))}>
            {STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="deal-follow-up">Follow up on</Label>
          <Input id="deal-follow-up" type="date" value={saved?.next_follow_up ?? ""} disabled={busy}
            className={cn(follow === "overdue" && "border-destructive text-destructive")}
            onChange={(e) => run(() => saveDeal({ next_follow_up: e.target.value || null }))} />
          {follow === "overdue" && <p className="text-xs text-destructive">Overdue</p>}
        </div>
      </div>

      {offer && (
        <div className="rounded-lg border border-plat/30 bg-accent p-3 text-sm" aria-live="polite">
          <p className="text-xs font-medium uppercase tracking-wide text-accent-foreground">Latest offer</p>
          <p className="mt-0.5 font-semibold">{offerSummary(offer)}</p>
          <p className="text-xs text-muted-foreground">{longDate(offer.occurred_at)}</p>
        </div>
      )}

      {/* Log something */}
      <div>
        <div role="tablist" aria-label="Log" className="grid grid-cols-3 rounded-lg bg-secondary p-1 text-sm">
          {(["offer", "contact", "note"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={cn("rounded-md py-1.5 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}>
              {m === "offer" ? "Offer" : m === "contact" ? "Contact" : "Note"}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {mode === "offer" && <OfferForm busy={busy} onSubmit={(row, followUp) => run(() => logEvent(row, followUp), "Offer logged")} />}
          {mode === "contact" && <ContactForm busy={busy} onSubmit={(row, followUp) => run(() => logEvent(row, followUp), "Logged")} />}
          {mode === "note" && <NoteForm busy={busy} onSubmit={(body) => run(async () => {
            const { error } = await supabase.from("notes").insert({ property_id: propertyId, body });
            if (error) throw error;
            if (!saved) await saveDeal({});
          }, "Note added")} />}
        </div>
      </div>

      {/* Timeline */}
      {timeline.length > 0 && (
        <ol className="space-y-2" aria-label="Deal history">
          {timeline.map(({ key, event, note }) => {
            const Icon = KIND_ICON[(event?.kind as EventKind) ?? "note"];
            return (
              <li key={key} className="rounded-lg border bg-background p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    {event ? <EventLine event={event} busy={busy}
                      onUpdate={(patch) => run(async () => {
                        const { error } = await supabase.from("deal_events").update(patch).eq("id", event.id);
                        if (error) throw error;
                      })} /> : <p className="whitespace-pre-wrap">{note!.body}</p>}
                    <time className="text-xs text-muted-foreground" dateTime={event?.occurred_at ?? note!.created_at}>
                      {new Date(event?.occurred_at ?? note!.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </time>
                  </div>
                  <button type="button" aria-label="Delete" disabled={busy}
                    onClick={() => run(async () => {
                      const { error } = event
                        ? await supabase.from("deal_events").delete().eq("id", event.id)
                        : await supabase.from("notes").delete().eq("id", note!.id);
                      if (error) throw error;
                    })}
                    className="rounded p-1 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function EventLine({ event, busy, onUpdate }: { event: DealEvent; busy: boolean; onUpdate: (patch: Partial<DealEvent>) => void }) {
  if (event.kind !== "offer") {
    return (
      <>
        <p className="font-medium">{labelOf(CONTACT_KINDS, event.kind)}{event.outcome ? ` · ${labelOf(OUTCOMES, event.outcome)}` : ""}</p>
        {event.body && <p className="whitespace-pre-wrap text-muted-foreground">{event.body}</p>}
      </>
    );
  }
  return (
    <>
      <p className="font-medium">{offerSummary(event)}{event.offer_to ? ` · to ${labelOf(OFFER_TO, event.offer_to).toLowerCase()}` : ""}</p>
      {event.offer_terms && <p className="whitespace-pre-wrap text-muted-foreground">{event.offer_terms}</p>}
      {/* Responses come in later: update them in place */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`resp-${event.id}`}>Response</label>
        <select id={`resp-${event.id}`} value={event.offer_response ?? "pending"} disabled={busy}
          onChange={(e) => onUpdate({ offer_response: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {RESPONSES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {event.offer_response === "countered" && (
          <Input aria-label="Counter amount" type="number" min={0} step={100} defaultValue={event.counter_amount ?? ""} disabled={busy}
            placeholder="Counter $" className="h-8 w-32 text-xs"
            onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== event.counter_amount) onUpdate({ counter_amount: v }); }} />
        )}
      </div>
    </>
  );
}

type EventRow = Omit<Tables<"deal_events">, "id" | "user_id" | "created_at" | "property_id">;

function OfferForm({ busy, onSubmit }: { busy: boolean; onSubmit: (row: EventRow, followUp: string | null) => void }) {
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("owner");
  const [terms, setTerms] = useState("");
  const [date, setDate] = useState(today());
  const [followUp, setFollowUp] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (!amount) return;
      onSubmit({ kind: "offer", occurred_at: loggedAt(date), offer_amount: Number(amount), offer_to: to,
        offer_terms: terms.trim() || null, offer_response: "pending", counter_amount: null, outcome: null, body: null }, followUp || null);
      setAmount(""); setTerms(""); setFollowUp("");
    }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="offer-amount">Amount</Label>
          <Input id="offer-amount" type="number" inputMode="numeric" min={0} step={100} required value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="45000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-to">To</Label>
          <select id="offer-to" className={selectCls} value={to} onChange={(e) => setTo(e.target.value)}>
            {OFFER_TO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="offer-terms">Terms (optional)</Label>
        <Textarea id="offer-terms" rows={2} maxLength={2000} value={terms} onChange={(e) => setTerms(e.target.value)}
          placeholder="Cash, 14-day close, as-is" />
      </div>
      <DateRow date={date} setDate={setDate} followUp={followUp} setFollowUp={setFollowUp} idPrefix="offer" />
      <Button type="submit" size="sm" disabled={busy || !amount}>Log offer</Button>
    </form>
  );
}

function ContactForm({ busy, onSubmit }: { busy: boolean; onSubmit: (row: EventRow, followUp: string | null) => void }) {
  const [kind, setKind] = useState("call");
  const [outcome, setOutcome] = useState("no_answer");
  const [body, setBody] = useState("");
  const [date, setDate] = useState(today());
  const [followUp, setFollowUp] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ kind, outcome, body: body.trim() || null, occurred_at: loggedAt(date),
        offer_amount: null, offer_to: null, offer_terms: null, offer_response: null, counter_amount: null }, followUp || null);
      setBody(""); setFollowUp("");
    }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="contact-kind">How</Label>
          <select id="contact-kind" className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)}>
            {CONTACT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-outcome">Result</Label>
          <select id="contact-outcome" className={selectCls} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-body">What happened (optional)</Label>
        <Textarea id="contact-body" rows={2} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Spoke with the daughter; owner passed in 2023" />
      </div>
      <DateRow date={date} setDate={setDate} followUp={followUp} setFollowUp={setFollowUp} idPrefix="contact" />
      <Button type="submit" size="sm" disabled={busy}>Log {labelOf(CONTACT_KINDS, kind).toLowerCase()}</Button>
    </form>
  );
}

function DateRow({ date, setDate, followUp, setFollowUp, idPrefix }: {
  date: string; setDate: (v: string) => void; followUp: string; setFollowUp: (v: string) => void; idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-date`}>Date</Label>
        <Input id={`${idPrefix}-date`} type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-follow`}>Follow up on</Label>
        <Input id={`${idPrefix}-follow`} type="date" min={today()} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
      </div>
    </div>
  );
}

function NoteForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: string) => void }) {
  const [body, setBody] = useState("");
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) { onSubmit(body.trim()); setBody(""); } }}>
      <Label htmlFor="new-note">Note</Label>
      <Textarea id="new-note" rows={3} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Drove by: roof tarped, looks vacant" />
      <Button type="submit" size="sm" disabled={busy || !body.trim()}>Add note</Button>
    </form>
  );
}
