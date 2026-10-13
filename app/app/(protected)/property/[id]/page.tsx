import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Gavel, Landmark } from "lucide-react";
import { loadProperty } from "@/lib/property/load";
import { dealTier, valueRatio } from "@/lib/deal";
import { bathsNumber, longDate, money, number } from "@/lib/format";
import { areaHref, PROPERTY_TYPES } from "@/lib/search/state";
import { skipTraceEnabled } from "@/lib/skip-trace";
import { Section } from "@/components/ui/section";
import { AuctionGuide } from "@/components/property/auction-guide";
import { Countdown, DealChip, RecordId, SourceBadge } from "@/components/property/badges";
import { Gallery } from "@/components/property/gallery";
import { OwnerPanel } from "@/components/property/owner-panel";
import { SaveButton } from "@/components/property/save-button";
import { DealPanel } from "@/components/deals/deal-panel";
import { DealCalculator, type PriceMultiple } from "@/components/deals/deal-calculator";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CalcInputs } from "@/lib/calc";
import type { Strategy } from "@/lib/deals";
import { DetailMapLazy } from "@/components/property/detail-map-lazy";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const d = await loadProperty(params.id);
  return { title: d?.property.address ?? "Property" };
}

// Same rule as listings_feed.is_closed (closed_rule migration): keep the two in sync
const CLOSED = /redeem|cancel|sold|struck|withdr|bankrupt|postpon|walk/i;
const isClosedAuction = (a: { status: string; auction_date: string }) =>
  CLOSED.test(a.status) || a.auction_date < new Date().toLocaleDateString("en-CA");

export default async function PropertyPage({ params }: { params: { id: string } }) {
  const d = await loadProperty(params.id);
  if (!d) notFound();
  const { property: p, county, owner, auctions, hud } = d;

  // The listing this page is about: the next open auction, else the HUD listing, else the latest auction
  const openAuction = auctions.find((a) => !isClosedAuction(a)) ?? null;
  const auction = openAuction ?? (hud ? null : auctions[0] ?? null);
  const source = auction ? "tax_deed" : hud ? "hud" : null;
  const price = auction?.opening_bid ?? hud?.list_price ?? null;
  const ratio = valueRatio(price, p.market_value);
  const eventDate = auction?.auction_date ?? (hud?.bid_deadline ? hud.bid_deadline.slice(0, 10) : null);
  const closed = auction ? isClosedAuction(auction) : hud ? hud.status !== "active" : false;
  const title = p.address ?? "Address not listed";
  const officialUrl = auction?.auction_url ?? hud?.listing_url ?? null;
  const multiple = source === "tax_deed" && p.county_fips
    ? ((await createSupabaseServerClient().rpc("auction_price_multiple", { p_county_fips: p.county_fips })).data as PriceMultiple | null)
    : null;

  const facts: [string, React.ReactNode][] = [
    ["Type", PROPERTY_TYPES.find((t) => t.value === p.property_type)?.label ?? "—"],
    ["Beds", p.beds != null ? String(p.beds) : "—"],
    ["Baths", bathsNumber(p.baths) ?? "—"],
    ["Living area", p.sqft ? `${number(p.sqft)} sq ft` : "—"],
    ["Lot size", p.lot_size_sqft ? (p.lot_size_sqft >= 43560 ? `${(p.lot_size_sqft / 43560).toFixed(2)} acres` : `${number(Math.round(p.lot_size_sqft))} sq ft`) : "—"],
    ["Year built", p.year_built ? String(p.year_built) : "—"],
    ["Land use", p.land_use ?? "—"],
    ["Homestead", p.homestead == null ? "—" : p.homestead ? "Yes" : "No"],
    ["Parcel ID", p.parcel_id ? <RecordId value={p.parcel_id} label="parcel ID" /> : "—"],
    ["Assessed value", money(p.assessed_value)],
    ["Last sale", p.last_sale_price ? `${money(p.last_sale_price)}${p.last_sale_date ? ` · ${p.last_sale_date.slice(0, 4)}` : ""}` : "—"],
    ["County", county ? `${county.county_name} County` : "—"],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/search" className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="size-4" aria-hidden /> Back to search
        </Link>
        <SaveButton propertyId={p.id} saved={!!d.saved} label="Save" className="border" />
      </div>

      <Gallery propertyId={p.id} photos={d.photos} address={title} />

      {/* Header band: what it is, when, and the numbers */}
      <header className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {source && <SourceBadge source={source} date={eventDate} />}
          <Countdown date={eventDate} closed={closed} className="text-sm" />
          <DealChip source={source} tier={dealTier(price, p.market_value)} ratio={ratio} />
          {closed && auction && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{auction.status}</span>}
          {hud && hud.status !== "active" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{hud.status === "under_contract" ? "Under contract" : "No longer listed"}</span>}
        </div>
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        <p className="flex flex-wrap gap-x-2 text-sm">
          {p.city && (p.place_geoid
            ? <Link className="text-plat underline-offset-4 hover:underline" href={areaHref("place", p.place_geoid, `${p.city}, ${p.state}`)}>{p.city}</Link>
            : <span>{p.city}</span>)}
          {county && <><span aria-hidden>·</span><Link className="text-plat underline-offset-4 hover:underline" href={areaHref("county", county.fips)}>{county.county_name} County</Link></>}
          {p.zip && <><span aria-hidden>·</span><Link className="text-plat underline-offset-4 hover:underline" href={areaHref("zcta", p.zip)}>{p.zip}</Link></>}
        </p>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2 border-y py-4">
          <p>
            <span className="block font-display text-4xl font-semibold tabular-nums tracking-tight">{money(price)}</span>
            <span className="text-sm text-muted-foreground">{source === "tax_deed" ? "Opening bid" : source === "hud" ? "List price" : "Price"}</span>
          </p>
          {p.market_value != null && (
            <p>
              <span className="block text-2xl font-semibold tabular-nums">{money(p.market_value)}</span>
              <span className="text-sm text-muted-foreground" title="The county property appraiser's just (market) value">
                County value{ratio != null && ` · ${source === "tax_deed" ? "bid" : "price"} is ${Math.round(ratio * 100)}% of it`}
              </span>
            </p>
          )}
          {(p.beds != null || p.sqft) && (
            <p className="text-sm text-muted-foreground">
              {[p.beds != null ? `${p.beds} beds` : null, p.baths != null ? `${bathsNumber(p.baths)} baths` : null, p.sqft ? `${number(p.sqft)} sq ft` : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* For tax deeds the owner is the reason to be here: they can still pay before the sale */}
          {auctions.length > 0 && (
            <Section id="owner-heading" title="Owner & redemption">
              {openAuction && (
                <p className="mb-4 rounded-lg bg-deed-soft p-3 text-sm">
                  In Florida the owner can usually still pay the back taxes and keep the property until the tax deed is issued
                  after the sale. Until then, a direct offer to the owner is possible. Check this case with the county clerk.
                </p>
              )}
              <OwnerPanel propertyId={p.id} owner={owner} homestead={p.homestead} lastSaleDate={p.last_sale_date}
                contacts={d.contacts} lookupEnabled={skipTraceEnabled()} />
            </Section>
          )}

          <Section id="calc-heading" title="Run the numbers">
            <DealCalculator propertyId={p.id} onList={!!d.saved} strategy={(d.saved?.strategy as Strategy) ?? null}
              savedInputs={d.saved?.calc as Partial<CalcInputs> | null} countyValue={p.market_value} price={price}
              source={source} multiple={multiple} countyName={county?.county_name ?? null} />
          </Section>

          {source && !closed && (
            <Section id="guide-heading" title={source === "tax_deed" ? "How this auction works" : "How HUD bidding works"}>
              <AuctionGuide source={source} officialUrl={officialUrl} />
            </Section>
          )}

          <Section id="facts-heading" title="Facts" plain>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k} className="bg-card p-3">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 break-words text-sm font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="timeline-heading" title="Timeline" plain>
            <div className="space-y-4">
              {auctions.map((a) => (
                <div key={a.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-medium">
                      <Gavel className="size-4 text-deed" aria-hidden /> Tax deed auction · {longDate(a.auction_date)}{a.auction_time ? `, ${a.auction_time}` : ""}
                    </p>
                    {isClosedAuction(a)
                      ? <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{a.status}</span>
                      : <Countdown date={a.auction_date} />}
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>Case <RecordId value={a.case_no} label="case number" /></span>
                    {a.certificate_no && <span>Certificate <RecordId value={a.certificate_no} label="certificate number" /></span>}
                    <span>Opening bid {money(a.opening_bid)}</span>
                    {a.sold_amount != null && <span className="font-medium text-foreground">Sold for {money(a.sold_amount)}{a.sold_to ? ` to ${a.sold_to}` : ""}</span>}
                  </p>
                  {a.history.length > 0 && (
                    <ol className="mt-3 space-y-1.5 border-l pl-4 text-sm">
                      {a.history.map((h) => (
                        <li key={h.id} className="relative">
                          <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-deed" aria-hidden />
                          <span className="font-medium">{h.new_status}</span>
                          {h.old_status && <span className="text-muted-foreground"> (was {h.old_status})</span>}
                          {h.new_auction_date && h.old_auction_date && h.new_auction_date !== h.old_auction_date && (
                            <span className="text-muted-foreground"> · moved to {longDate(h.new_auction_date)}</span>
                          )}
                          <span className="text-muted-foreground"> · {longDate(h.changed_at)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
              {hud && (
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-medium"><Landmark className="size-4 text-hud" aria-hidden /> HUD listing · {hud.listing_period ?? "Listed"} period</p>
                    {hud.bid_deadline && <Countdown date={hud.bid_deadline.slice(0, 10)} closed={hud.status !== "active"} />}
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <Row k="Case #" v={<RecordId value={hud.hud_case_no} label="HUD case number" />} />
                    <Row k="Bids open" v={longDate(hud.bid_open_date)} />
                    <Row k="Bid deadline" v={hud.bid_deadline ? new Date(hud.bid_deadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }) + " CT" : "—"} />
                    <Row k="FHA financing" v={hud.fha_financing ?? "—"} />
                    <Row k="203(k) eligible" v={hud.eligible_203k == null ? "—" : hud.eligible_203k ? "Yes" : "No"} />
                    <Row k="Listing broker" v={[hud.broker_name, hud.broker_phone].filter(Boolean).join(" · ") || "—"} />
                  </dl>
                </div>
              )}
              {!auctions.length && !hud && <p className="text-sm text-muted-foreground">No listing history.</p>}
            </div>
          </Section>

          <Section id="map-heading" title="Location" plain>
            {p.lat != null && p.lng != null
              ? <DetailMapLazy lat={p.lat} lng={p.lng} placeGeoid={p.place_geoid} zip={p.zip} />
              : <p className="text-sm text-muted-foreground">We couldn&apos;t place this parcel on the map yet.</p>}
          </Section>

          <Section id="sales-heading" title="Sales history" plain>
            {d.sales.length ? (
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left text-xs text-muted-foreground">
                    <tr><th scope="col" className="px-3 py-2 font-medium">Date</th><th scope="col" className="px-3 py-2 font-medium">Price</th><th scope="col" className="px-3 py-2 font-medium">Type</th><th scope="col" className="px-3 py-2 font-medium">Book / page</th></tr>
                  </thead>
                  <tbody>
                    {d.sales.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="px-3 py-2">{longDate(s.sale_date)}</td>
                        <td className="px-3 py-2 tabular-nums">{money(s.price)}{s.qualified === false && <span className="ml-1 text-xs text-muted-foreground">(not arm&apos;s length)</span>}</td>
                        <td className="px-3 py-2">{s.instrument ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{s.book_page ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted-foreground">No recorded sales.</p>}
          </Section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Section id="deal-heading" title="Your deal">
            <DealPanel propertyId={p.id} saved={d.saved} events={d.events} notes={d.notes} />
          </Section>
          <Section id="links-heading" title="Official sources">
            <ul className="space-y-2 text-sm">
              {auctions[0]?.auction_url && <ExtLink href={auctions[0].auction_url}>County auction page</ExtLink>}
              {p.appraiser_url && <ExtLink href={p.appraiser_url}>Property appraiser</ExtLink>}
              {hud?.listing_url && <ExtLink href={hud.listing_url}>HUD HomeStore listing</ExtLink>}
              {!auctions[0]?.auction_url && !p.appraiser_url && !hud?.listing_url && <li className="text-muted-foreground">None on file.</li>}
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{k}:</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-plat underline-offset-4 hover:underline">
        {children} <ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
      </a>
    </li>
  );
}
