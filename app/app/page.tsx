import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Gavel, Home, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import type { Database } from "@/lib/supabase/types";

// Counts change once a day (6 AM scrape); an hourly refresh is plenty
export const revalidate = 3600;

interface PublicStats {
  tracked_counties: string[];
  supported_counties: number;
  upcoming_auctions: number;
  hud_homes: number;
}

async function loadStats(): Promise<PublicStats | null> {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } });
  const { data } = await supabase.rpc("public_stats");
  return (data as unknown as PublicStats) ?? null;
}

/** "Lake, Orange and Seminole" */
function listNames(names: string[]) {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default async function LandingPage() {
  const stats = await loadStats();
  const counties = stats?.tracked_counties ?? [];

  const points = [
    { icon: Gavel, title: "County tax deed auctions",
      body: "Properties going to auction for unpaid property taxes: opening bid, date, status changes and the owner on record." },
    { icon: Home, title: "HUD homes",
      body: "Government-owned homes from hudhomestore.gov, with bid deadlines, FHA and 203(k) eligibility, and photos." },
    { icon: Map, title: "A map that thinks in places",
      body: "Search a city, ZIP, county or address; see the outlines, the pins and a list you can track your outreach in." },
  ];

  return (
    <div className="min-h-screen">
      <header className="container flex h-16 items-center justify-between">
        <Logo />
        <Button asChild variant="outline" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>
      <main id="main" className="container max-w-4xl py-16 md:py-24">
        <h1 className="text-4xl font-bold md:text-5xl">Find the properties that never make it to Zillow.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Florida tax deed auctions and HUD homes on one map, updated every morning.
        </p>
        {stats && (
          <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat value={stats.upcoming_auctions.toLocaleString()} label="tax deed auctions in the next 90 days" />
            <Stat value={stats.hud_homes.toLocaleString()} label="HUD homes for sale in Florida" />
            <Stat value={String(counties.length)} label={`counties tracked today, of ${stats.supported_counties} we support`} />
          </dl>
        )}
        {counties.length > 0 && (
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
            Tracking {listNames(counties)} {counties.length === 1 ? "County" : "Counties"}. Search any of the other supported
            Florida counties and we start tracking it that day.
          </p>
        )}
        <Button asChild size="lg" className="mt-8">
          <Link href="/login">Get started</Link>
        </Button>
        <ul className="mt-16 grid gap-4 md:grid-cols-3">
          {points.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-xl border bg-card p-5 shadow-sm">
              <Icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    // Label after the number visually, but first for screen readers (dt before dd)
    <div className="flex flex-col-reverse rounded-xl border bg-card p-4">
      <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
