import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/format";
import type { Json } from "@/lib/supabase/types";

export const metadata = { title: "Scrape runs" };

const STATUS = {
  ok: { icon: CheckCircle2, cls: "text-deal-great", label: "OK" },
  partial: { icon: AlertTriangle, cls: "text-deal-good", label: "Partial" },
  failed: { icon: XCircle, cls: "text-destructive", label: "Failed" },
  running: { icon: CircleDashed, cls: "text-muted-foreground", label: "Running" },
} as const;

function duration(start: string, end: string | null) {
  if (!end) return "—";
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default async function AdminPage() {
  const supabase = createSupabaseServerClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();

  const [{ data: runs }, { data: counties }] = await Promise.all([
    supabase.from("scrape_runs").select("*").order("started_at", { ascending: false }).limit(150),
    supabase.from("counties").select("fips, county_name, auction_platform, is_active, last_scraped_at, activated_at").eq("is_active", true).order("county_name"),
  ]);
  const name = new Map((counties ?? []).map((c) => [c.fips, c.county_name]));

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold">Scrape runs</h1>
        <p className="text-sm text-muted-foreground">Daily at 6:00 AM Eastern (GitHub Actions). Newest first.</p>
      </div>

      <section aria-labelledby="counties-heading">
        <h2 id="counties-heading" className="mb-3 font-semibold">Tracked counties ({counties?.length ?? 0})</h2>
        <ul className="flex flex-wrap gap-2">
          {(counties ?? []).map((c) => (
            <li key={c.fips} className="rounded-full border bg-card px-3 py-1 text-sm">
              {c.county_name}{" "}
              <span className="text-xs text-muted-foreground">· {c.last_scraped_at ? `scraped ${timeAgo(c.last_scraped_at)}` : "waiting for first run"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="runs-heading">
        <h2 id="runs-heading" className="sr-only">Runs</h2>
        {!runs?.length ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs text-muted-foreground">
                <tr>
                  {["Started", "Step", "County", "Status", "Found", "Saved", "Errors", "Took"].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const s = STATUS[r.status as keyof typeof STATUS] ?? STATUS.running;
                  const errs = Array.isArray(r.error_log) ? (r.error_log as { item?: string; error?: string }[]) : [];
                  return (
                    <tr key={r.id} className="border-t align-top">
                      <td className="whitespace-nowrap px-3 py-2" title={new Date(r.started_at).toLocaleString()}>{timeAgo(r.started_at)}</td>
                      <td className="px-3 py-2 font-medium">{r.adapter}</td>
                      <td className="px-3 py-2">{r.county_fips ? name.get(r.county_fips) ?? r.county_fips : "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 ${s.cls}`}><s.icon className="size-4" aria-hidden />{s.label}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.items_found}</td>
                      <td className="px-3 py-2 tabular-nums">{r.items_upserted}</td>
                      <td className="px-3 py-2">
                        {r.errors > 0 ? (
                          <details>
                            <summary className="cursor-pointer text-destructive">{r.errors}</summary>
                            <ul className="mt-1 max-w-md space-y-1 text-xs">
                              {errs.map((e, i) => <li key={i}><span className="font-medium">{e.item}</span>: {e.error}</li>)}
                            </ul>
                          </details>
                        ) : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{duration(r.started_at, r.finished_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Stats runs={runs ?? []} />
      </section>
    </div>
  );
}

function Stats({ runs }: { runs: { adapter: string; stats: Json }[] }) {
  const lastEnrich = runs.filter((r) => r.adapter === "enrich").slice(0, 10);
  if (!lastEnrich.length) return null;
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      NAL match rate (latest runs):{" "}
      {lastEnrich.map((r, i) => {
        const s = (r.stats ?? {}) as { nal_match_rate?: number; nal_file?: string };
        return s.nal_match_rate != null ? <span key={i} className="mr-2">{Math.round(s.nal_match_rate * 100)}% ({s.nal_file?.split(" ")[0]})</span> : null;
      })}
    </p>
  );
}
