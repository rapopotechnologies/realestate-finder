import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Bell, Gavel, Home, ListChecks, MapPinned, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { Stat } from "@/components/ui/stat";
import { PreviewMapLazy } from "@/components/marketing/preview-map-lazy";
import type { PreviewPoint } from "@/components/marketing/preview-map";
import type { Database } from "@/lib/supabase/types";

// Counts and dots change once a day (6 AM scrape); an hourly refresh is plenty
export const revalidate = 3600;

interface PublicStats {
  tracked_counties: string[];
  supported_counties: number;
  upcoming_auctions: number;
  hud_homes: number;
}

async function loadPublic() {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } });
  const [stats, points] = await Promise.all([supabase.rpc("public_stats"), supabase.rpc("public_preview_points")]);
  return { stats: (stats.data as unknown as PublicStats) ?? null, points: (points.data as unknown as PreviewPoint[]) ?? [] };
}

/** "Lake, Orange and Seminole" */
function listNames(names: string[]) {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const STEPS = [
  { icon: Search, title: "Search a place", body: "A city, ZIP, county or address. Or let it find what's near you." },
  { icon: MapPinned, title: "See what's coming up", body: "Tax deed auctions and HUD homes on one map, with dates, opening bids, county values and the owner on record." },
  { icon: ListChecks, title: "Work the deal", body: "Save it, log your calls and offers, set a follow-up. Your pipeline, in one place." },
];

const FAQ = [
  ["What's a tax deed auction?",
    "When property taxes go unpaid long enough, the county sells the property at a public auction. Bidding starts at the unpaid taxes and fees, which is why opening bids look tiny; sales usually go several times higher."],
  ["Where does the data come from?",
    "Public records only: county auction sites, the Florida Department of Revenue tax roll, county property appraisers, HUD HomeStore and the US Census. Never Zillow, Redfin or Realtor.com."],
  ["How fresh is it?",
    "Everything is re-checked every morning at 6 AM Eastern. Each auction keeps its status history, so you can see when it was redeemed or rescheduled."],
  ["Which areas do you cover?",
    "The Florida counties listed above are tracked today. Search any of the other supported Florida counties and we start tracking it that day. HUD homes are covered statewide."],
  ["Is this legal or title advice?",
    "No. We show what the public records say and link to the official pages. Talk to a title company or attorney before you bid."],
] as const;

export default async function LandingPage() {
  const { stats, points } = await loadPublic();
  const counties = stats?.tracked_counties ?? [];

  return (
    <div className="min-h-screen">
      <header className="container flex h-16 items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="max-sm:hidden"><Link href="/login">Sign in</Link></Button>
          <Button asChild size="sm"><Link href="/login?mode=signup">Create account</Link></Button>
        </div>
      </header>

      <main id="main">
        <section className="container grid items-center gap-10 py-12 md:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <h1 className="text-4xl leading-[1.05] md:text-6xl">The Florida properties that never make it to Zillow.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              County tax deed auctions and HUD homes on one map: dates, opening bids, county values and the owner on record.
              Updated every morning.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/login?mode=signup">Create a free account</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/login">Sign in</Link></Button>
            </div>
            {stats && (
              <dl className="mt-10 grid max-w-xl grid-cols-3 gap-3">
                <Stat value={stats.upcoming_auctions.toLocaleString()} label="tax deed auctions in the next 90 days" />
                <Stat value={stats.hud_homes.toLocaleString()} label="HUD homes for sale in Florida" />
                <Stat value={`${counties.length} / ${stats.supported_counties}`} label="counties tracked / supported" />
              </dl>
            )}
          </div>
          <figure className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="h-[360px] md:h-[440px]"><PreviewMapLazy points={points} /></div>
            <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-deed" aria-hidden /> Tax deed auction</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-hud" aria-hidden /> HUD home</span>
              <span className="ml-auto">Next 90 days · locations rounded</span>
            </figcaption>
          </figure>
        </section>

        {counties.length > 0 && (
          <p className="container -mt-4 text-sm text-muted-foreground">
            Tracking {listNames(counties)} {counties.length === 1 ? "County" : "Counties"} today.
          </p>
        )}

        <section aria-labelledby="how-heading" className="container py-16">
          <h2 id="how-heading" className="text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-full bg-plat-soft font-semibold text-plat tabular-nums">{i + 1}</span>
                  <Icon className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            <Feature icon={Gavel} tone="deed" title="Tax deed auctions" body="Opening bid, date, status changes, sale prices, the owner and their mailing address." />
            <Feature icon={Home} tone="hud" title="HUD homes" body="Bid deadlines, listing period, FHA and 203(k) eligibility, broker and photos." />
            <Feature icon={Bell} tone="plat" title="Your pipeline" body="Strategy, offers and counters, calls and follow-ups for every property you're working." />
          </ul>
        </section>

        <section aria-labelledby="faq-heading" className="container max-w-3xl pb-20">
          <h2 id="faq-heading" className="text-3xl">Questions</h2>
          <div className="mt-6 divide-y rounded-xl border bg-card">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="cursor-pointer list-none font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">{q}<span className="text-muted-foreground transition group-open:rotate-45" aria-hidden>+</span></span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-6 text-xs text-muted-foreground">
          <span>Public records only. Not legal, title or investment advice.</span>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, tone, title, body }: { icon: typeof Gavel; tone: "deed" | "hud" | "plat"; title: string; body: string }) {
  const tones = { deed: "bg-deed-soft text-deed", hud: "bg-hud-soft text-hud", plat: "bg-plat-soft text-plat" };
  return (
    <li className="rounded-xl border bg-card p-5">
      <span className={`inline-grid size-9 place-items-center rounded-lg ${tones[tone]}`}><Icon className="size-5" aria-hidden /></span>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </li>
  );
}
