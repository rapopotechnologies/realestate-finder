"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_INPUTS, brrrr, flip, rental, wholesale, type CalcInputs } from "@/lib/calc";
import { STRATEGIES, type Strategy } from "@/lib/deals";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tab = Exclude<Strategy, "undecided">;
type Field = keyof CalcInputs;

/** Median winning bid ÷ opening bid in this county (auction_price_multiple RPC) */
export interface PriceMultiple { sales: number; median: number; p25: number; p75: number; since: string }

const FIELDS: Record<Field, { label: string; unit: "$" | "%" | "mo" | "yr"; hint?: string }> = {
  arv: { label: "After-repair value", unit: "$" },
  price: { label: "Purchase price", unit: "$" },
  repairs: { label: "Repairs", unit: "$" },
  buyCostsPct: { label: "Buying costs", unit: "%", hint: "of price: title, recording, doc stamps" },
  sellCostsPct: { label: "Selling costs", unit: "%", hint: "of ARV: agent and closing" },
  holdMonths: { label: "Months held", unit: "mo" },
  holdingMonthly: { label: "Holding costs / month", unit: "$", hint: "taxes, insurance, utilities" },
  maoPct: { label: "Max offer rule", unit: "%", hint: "of ARV, before repairs" },
  assignmentFee: { label: "Your assignment fee", unit: "$" },
  rentMonthly: { label: "Rent / month", unit: "$" },
  expensesMonthly: { label: "Expenses / month", unit: "$", hint: "taxes, insurance, management, repairs, vacancy" },
  refiLtvPct: { label: "Refinance at", unit: "%", hint: "of ARV" },
  ratePct: { label: "Interest rate", unit: "%" },
  termYears: { label: "Loan term", unit: "yr" },
};

const TAB_FIELDS: Record<Tab, Field[]> = {
  wholesale: ["arv", "repairs", "maoPct", "assignmentFee"],
  flip: ["arv", "price", "repairs", "buyCostsPct", "sellCostsPct", "holdMonths", "holdingMonthly"],
  brrrr: ["arv", "price", "repairs", "buyCostsPct", "holdMonths", "holdingMonthly", "refiLtvPct", "ratePct", "termYears", "rentMonthly", "expensesMonthly"],
  rental: ["arv", "price", "repairs", "buyCostsPct", "rentMonthly", "expensesMonthly"],
};

const percent = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);

export function DealCalculator({ propertyId, onList, strategy, savedInputs, countyValue, price, source, multiple, countyName }: {
  propertyId: string;
  /** numbers are kept only for deals on My List */
  onList: boolean;
  strategy: Strategy | null;
  savedInputs: Partial<CalcInputs> | null;
  countyValue: number | null;
  /** opening bid (tax deed) or list price (HUD) */
  price: number | null;
  source: "tax_deed" | "hud" | null;
  multiple: PriceMultiple | null;
  countyName: string | null;
}) {
  // A tax deed sells well above its opening bid: start from what this county's auctions actually close at
  const expectedBid = source === "tax_deed" && price && multiple ? Math.round((price * multiple.median) / 100) * 100 : null;
  const [inputs, setInputs] = useState<CalcInputs>({
    ...DEFAULT_INPUTS, arv: countyValue ?? 0, price: expectedBid ?? price ?? 0, ...savedInputs,
  });
  const [tab, setTab] = useState<Tab>(strategy && strategy !== "undecided" ? strategy : "flip");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const edited = useRef(false);

  // Picking a strategy in "Your deal" opens its calculator
  useEffect(() => {
    if (strategy && strategy !== "undecided") setTab(strategy);
  }, [strategy]);

  // Keep the numbers with the deal, a moment after the last keystroke
  useEffect(() => {
    if (!edited.current || !onList) return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      const { error } = await createSupabaseBrowserClient().from("saved_properties")
        .update({ calc: inputs as unknown as Record<string, number> }).eq("property_id", propertyId);
      setSaveState(error ? "error" : "saved");
    }, 800);
    return () => clearTimeout(t);
  }, [inputs, onList, propertyId]);

  function set(field: Field, raw: string) {
    edited.current = true;
    setInputs((i) => ({ ...i, [field]: raw === "" ? 0 : Number(raw) }));
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Strategy" className="grid grid-cols-4 rounded-lg bg-secondary p-1 text-sm">
        {STRATEGIES.filter((s): s is { value: Tab; label: string } => s.value !== "undecided").map((s) => (
          <button key={s.value} type="button" role="tab" aria-selected={tab === s.value} onClick={() => setTab(s.value)}
            className={cn("rounded-md py-1.5 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === s.value ? "bg-card shadow-sm" : "text-muted-foreground")}>
            {s.label}
          </button>
        ))}
      </div>

      {expectedBid && multiple && tab !== "wholesale" && (
        <p className="rounded-lg bg-deed-soft p-3 text-xs text-deed">
          Purchase price starts at the expected winning bid, {money(expectedBid)}: the opening bid × {multiple.median}, the median of{" "}
          {multiple.sales} third-party sales in {countyName ?? "this"} County since {new Date(`${multiple.since}T12:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })}{" "}
          (middle half {multiple.p25}–{multiple.p75}×).
        </p>
      )}

      <Results tab={tab} inputs={inputs} />

      <div className="grid gap-3 sm:grid-cols-2">
        {TAB_FIELDS[tab].map((f) => (
          <NumberField key={f} id={`calc-${f}`} {...FIELDS[f]} value={inputs[f]} onChange={(v) => set(f, v)} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {countyValue != null && <>After-repair value starts at the county value ({money(countyValue)}), which often runs below market. </>}
        Assumes a cash purchase. Estimates, not advice.{" "}
        {!onList ? "Save to My List to keep these numbers." : saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved with this deal." : saveState === "error" ? "Couldn't save; check your connection." : ""}
      </p>
    </div>
  );
}

function Results({ tab, inputs }: { tab: Tab; inputs: CalcInputs }) {
  // Without rent, cash flow is just the costs: ask for the number instead of showing a scary negative
  const noRent = inputs.rentMonthly === 0;
  const rows: [string, string, "gain" | "alert" | null][] = (() => {
    if (tab === "wholesale") {
      const r = wholesale(inputs);
      return [["Max offer (MAO)", money(r.mao), null], ["Offer to seller", money(r.offer), r.offer > 0 ? null : "alert"]];
    }
    if (tab === "flip") {
      const r = flip(inputs);
      return [["Profit", money(r.profit), r.profit >= 0 ? "gain" : "alert"], ["Return on cash", percent(r.roi), null], ["Cash in", money(r.invested), null]];
    }
    if (tab === "brrrr") {
      const r = brrrr(inputs);
      return [
        [r.cashLeft > 0 ? "Cash left in deal" : "Cash back at refinance", money(Math.abs(r.cashLeft)), r.cashLeft > 0 ? null : "gain"],
        ["Cash flow / month", noRent ? "Add rent" : money(r.cashFlow), noRent ? null : r.cashFlow >= 0 ? "gain" : "alert"],
        ["Cash-on-cash", r.cashOnCash == null ? "All cash back" : noRent ? "—" : percent(r.cashOnCash), null],
      ];
    }
    const r = rental(inputs);
    return [
      ["Cash flow / month", noRent ? "Add rent" : money(r.cashFlow), noRent ? null : r.cashFlow >= 0 ? "gain" : "alert"],
      ["Cap rate", noRent ? "—" : percent(r.capRate), null],
      ["All-in cost", money(r.invested), null],
    ];
  })();
  return (
    <dl className={cn("grid gap-3", rows.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {rows.map(([label, value, tone]) => (
        <div key={label} className="flex flex-col-reverse rounded-lg border bg-background p-3">
          <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
          <dd className={cn("font-display text-xl font-semibold tabular-nums sm:text-2xl", tone === "gain" && "text-gain", tone === "alert" && "text-alert")}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function NumberField({ id, label, unit, hint, value, onChange }: {
  id: string; label: string; unit: "$" | "%" | "mo" | "yr"; hint?: string; value: number; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {unit === "$" && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground" aria-hidden>$</span>}
        <Input id={id} type="number" inputMode="decimal" min={0} step="any" value={value === 0 ? "" : value} placeholder="0"
          onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn("tabular-nums", unit === "$" ? "pl-7" : "pr-10")} />
        {unit !== "$" && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground" aria-hidden>{unit}</span>}
      </div>
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
