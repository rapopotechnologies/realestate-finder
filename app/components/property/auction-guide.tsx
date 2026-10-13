import { ExternalLink } from "lucide-react";

// General guidance, not legal advice. Wording is deliberately hedged: rules and deadlines differ by county.

const TAX_DEED_STEPS = [
  ["Register and fund a deposit", "on the county's auction site before the sale. Deposits are usually a percentage of your maximum bid."],
  ["Bid online on the auction day", "starting at the opening bid (the unpaid taxes, interest and fees). Sales often go several times higher."],
  ["Pay the balance quickly", "if you win, usually by the next business day, plus documentary stamps and recording fees."],
  ["Expect title work", "a tax deed is not title insurance. Some liens can survive, and many buyers file a quiet title action before reselling or borrowing."],
  ["Plan for occupancy", "if someone lives there, removing them can take a court process."],
] as const;

const HUD_STEPS = [
  ["Bid through a HUD-registered broker", "buyers can't bid directly on hudhomestore.gov."],
  ["Mind the listing period", "\"Exclusive\" periods favor owner-occupants and nonprofits; investors can bid in the \"Extended\" period."],
  ["Check the financing code", "IN = FHA insured, IE = insured with a repair escrow, UI = uninsured (cash or rehab loan). 203(k) loans finance repairs."],
  ["Bids are reviewed after the deadline", "the highest acceptable net bid wins; your broker hears back first."],
] as const;

export function AuctionGuide({ source, officialUrl }: { source: "tax_deed" | "hud"; officialUrl: string | null }) {
  const steps = source === "tax_deed" ? TAX_DEED_STEPS : HUD_STEPS;
  return (
    <div className="space-y-3 text-sm">
      <ol className="space-y-2">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold tabular-nums" aria-hidden>{i + 1}</span>
            <p><span className="font-medium">{title}</span> — <span className="text-muted-foreground">{body}</span></p>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        General guidance, not legal or title advice. Rules, deposits and deadlines differ by county; the official page has this sale&apos;s terms.
        {officialUrl && (
          <> <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-plat underline-offset-4 hover:underline">
            Official page <ExternalLink className="size-3" aria-hidden /><span className="sr-only">(opens in a new tab)</span></a></>
        )}
      </p>
    </div>
  );
}
