import { CheckCircle2, Clock, CircleSlash } from "lucide-react";
import type { Coverage } from "@/lib/search/types";

/** "Tax deeds: tracked" / "Tracking starts tomorrow" / "Not yet supported in this county", plus HUD */
export function CoverageBadge({ coverage }: { coverage: Coverage | null }) {
  if (!coverage || coverage.counties.length === 0) return null;
  const statuses = coverage.counties.map((c) => c.status);
  const unsupported = coverage.counties.filter((c) => c.status === "unsupported");
  let taxDeed: { icon: typeof CheckCircle2; text: string; tone: string };
  if (statuses.every((s) => s === "tracked")) taxDeed = { icon: CheckCircle2, text: "Tax deeds: tracked", tone: "text-gain" };
  else if (statuses.includes("starting")) taxDeed = { icon: Clock, text: "Tax deeds: tracking starts tomorrow", tone: "text-deed" };
  else if (statuses.includes("tracked")) taxDeed = { icon: CheckCircle2, text: "Tax deeds: tracked (some counties)", tone: "text-gain" };
  else taxDeed = { icon: CircleSlash, text: "Tax deeds: not yet supported in this county", tone: "text-muted-foreground" };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Data coverage for this area">
      <span className={`inline-flex items-center gap-1 ${taxDeed.tone}`}
        title={unsupported.length ? `Not supported yet: ${unsupported.map((c) => c.name).join(", ")}` : undefined}>
        <taxDeed.icon className="size-3.5" aria-hidden /> {taxDeed.text}
      </span>
      <span className={`inline-flex items-center gap-1 ${coverage.hud === "tracked" ? "text-gain" : "text-muted-foreground"}`}>
        {coverage.hud === "tracked" ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleSlash className="size-3.5" aria-hidden />}
        HUD: {coverage.hud === "tracked" ? "tracked" : "not tracked here"}
      </span>
    </div>
  );
}
