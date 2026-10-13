"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Mail, Phone, Search } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/types";
import { longDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

const OWNER_TYPES: Record<string, string> = {
  individual: "Individual", llc: "LLC", corporation: "Company", trust: "Trust", estate: "Estate", government: "Government", other: "Other",
};

export function OwnerPanel({ propertyId, owner, homestead, lastSaleDate, contacts, lookupEnabled }: {
  propertyId: string;
  owner: Tables<"owners"> | null;
  homestead: boolean | null;
  lastSaleDate: string | null;
  contacts: Tables<"contacts">[];
  lookupEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!owner) {
    return <p className="text-sm text-muted-foreground">No owner on record yet. Public tax records for this parcel haven&apos;t been matched.</p>;
  }

  const years = lastSaleDate ? Math.max(0, Math.floor((Date.now() - new Date(lastSaleDate).getTime()) / (365.25 * 86_400_000))) : null;
  const flags = [
    owner.owner_type && OWNER_TYPES[owner.owner_type],
    owner.absentee ? "Absentee owner" : owner.absentee === false ? "Owner-occupied address" : null,
    owner.out_of_state ? "Out-of-state owner" : null,
    homestead ? "Homestead" : null,
    years != null ? `Owned ${years} yr${years === 1 ? "" : "s"}` : null,
  ].filter(Boolean) as string[];
  const mailing = [owner.mailing_address, [owner.mailing_city, owner.mailing_state].filter(Boolean).join(", "), owner.mailing_zip]
    .filter(Boolean).join(" ").trim();

  async function lookup() {
    setBusy(true);
    const r = await fetch("/api/skip-trace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(j.error ?? "Lookup failed"); return; }
    toast.success(j.found ? `Found ${j.found} contact detail${j.found === 1 ? "" : "s"}` : "No phone or email found");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-lg font-semibold">{owner.name}</p>
        {mailing && <p className="text-sm text-muted-foreground">Mailing: {mailing}</p>}
        <p className="mt-1 text-xs text-muted-foreground">From public tax records ({owner.source.replace("fl_dor_nal:", "Florida DOR tax roll ").replace("lake_pa", "Lake County Property Appraiser")})</p>
      </div>
      {flags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Owner details">
          {flags.map((f) => <li key={f} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">{f}</li>)}
        </ul>
      )}

      {contacts.length > 0 && (
        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">Contact info</p>
          <ul className="mt-2 space-y-1 text-sm">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                {c.phone ? <Phone className="size-3.5 text-muted-foreground" aria-hidden /> : <Mail className="size-3.5 text-muted-foreground" aria-hidden />}
                <span>{c.phone ?? c.email}</span>
                <span className="text-xs text-muted-foreground">· {c.source}, {longDate(c.retrieved_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <Button variant="outline" onClick={lookup} disabled={busy || !lookupEnabled}>
          {busy ? <Loader2 className="animate-spin" /> : <Search />} Find contact info
        </Button>
        {!lookupEnabled && <p className="text-xs text-muted-foreground">Contact lookup (skip tracing) isn&apos;t turned on for this app yet.</p>}
        <p className="flex gap-2 rounded-lg bg-deed-soft p-3 text-xs text-foreground">
          <AlertTriangle className="size-4 shrink-0 text-deed" aria-hidden />
          Before calling or texting, check the number against the federal Do Not Call Registry and Florida&apos;s Do Not Call list,
          and follow the TCPA and Florida Telephone Solicitation Act rules on calls, texts and autodialers.
        </p>
      </div>
    </div>
  );
}
