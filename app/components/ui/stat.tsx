import { cn } from "@/lib/utils";

/** Big number (Fraunces) with a muted label. Render inside a <dl>. */
export function Stat({ value, label, className }: { value: React.ReactNode; label: React.ReactNode; className?: string }) {
  return (
    // Label after the number visually, but first for screen readers (dt before dd)
    <div className={cn("flex flex-col-reverse rounded-xl border bg-card p-4", className)}>
      <dt className="mt-1 text-xs leading-snug text-muted-foreground">{label}</dt>
      <dd className="font-display text-3xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
