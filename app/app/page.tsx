import Link from "next/link";
import { Gavel, Home, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

const POINTS = [
  { icon: Gavel, title: "County tax deed auctions", body: "Properties going to auction for unpaid property taxes, with opening bids and dates." },
  { icon: Home, title: "HUD homes", body: "Government-owned homes from hudhomestore.gov, with bid deadlines and photos." },
  { icon: Map, title: "Search like Zillow", body: "City, ZIP and county outlines on a map, deal scores, and a list to track your outreach." },
];

export default function LandingPage() {
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
          Tax deed auctions and HUD homes across Florida, updated every morning, on one map.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/login">Get started</Link>
        </Button>
        <ul className="mt-16 grid gap-4 md:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, body }) => (
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
