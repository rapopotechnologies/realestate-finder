"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function SaveButton({ propertyId, saved: initial, className, label }: {
  propertyId: string;
  saved: boolean;
  className?: string;
  label?: string;
}) {
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !saved;
    setSaved(next);
    const supabase = createSupabaseBrowserClient();
    const { error } = next
      ? await supabase.from("saved_properties").upsert({ property_id: propertyId }, { onConflict: "user_id,property_id", ignoreDuplicates: true })
      : await supabase.from("saved_properties").delete().eq("property_id", propertyId);
    setBusy(false);
    if (error) {
      setSaved(!next);
      toast.error("Couldn't update My List. Try again.");
    } else if (next) {
      toast.success("Saved to My List");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Remove from My List" : "Save to My List"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-white/90 p-2 text-foreground shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Heart className={cn("size-4", saved && "fill-rose-500 text-rose-500")} aria-hidden />
      {label && <span className="pr-1 text-sm font-medium">{saved ? "Saved" : label}</span>}
    </button>
  );
}
