"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import type { SavedStatus } from "@/lib/search/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const STATUSES: { value: SavedStatus; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "contacted", label: "Contacted" },
  { value: "offer_made", label: "Offer made" },
  { value: "passed", label: "Passed" },
];

export function StatusAndNotes({ propertyId, saved, notes }: {
  propertyId: string;
  saved: Tables<"saved_properties"> | null;
  notes: Tables<"notes">[];
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [status, setStatus] = useState<SavedStatus | "">((saved?.status as SavedStatus) ?? "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function changeStatus(next: SavedStatus | "") {
    const prev = status;
    setStatus(next);
    const { error } = next
      ? await supabase.from("saved_properties").upsert({ property_id: propertyId, status: next }, { onConflict: "user_id,property_id" })
      : await supabase.from("saved_properties").delete().eq("property_id", propertyId);
    if (error) { setStatus(prev); toast.error("Couldn't update your status"); return; }
    toast.success(next ? `Marked as ${STATUSES.find((s) => s.value === next)?.label}` : "Removed from My List");
    router.refresh();
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("notes").insert({ property_id: propertyId, body: body.trim() });
    setBusy(false);
    if (error) { toast.error("Couldn't save the note"); return; }
    setBody("");
    // A note implies interest: make sure it's on My List
    if (!status) await changeStatus("interested");
    else router.refresh();
  }

  async function deleteNote(id: string) {
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) toast.error("Couldn't delete the note");
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="my-status" className="text-sm font-medium">My status</label>
        <select id="my-status" value={status} onChange={(e) => changeStatus(e.target.value as SavedStatus | "")}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">Not on My List</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <form onSubmit={addNote} className="space-y-2">
        <label htmlFor="new-note" className="text-sm font-medium">Notes</label>
        <Textarea id="new-note" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={10000}
          placeholder="Called the county, drove by, offer details…" />
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>Add note</Button>
      </form>
      {notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="group rounded-lg border bg-background p-3 text-sm">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
                <button type="button" onClick={() => deleteNote(n.id)} aria-label="Delete note"
                  className="rounded p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="size-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
