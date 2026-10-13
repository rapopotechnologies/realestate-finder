import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, ExternalLink, Gavel, Landmark } from "lucide-react";
import { loadProperty } from "@/lib/property/load";
import { dealTier, valueRatio } from "@/lib/deal";
import { bathsNumber, daysUntil, longDate, money, number } from "@/lib/format";
import { areaHref, PROPERTY_TYPES } from "@/lib/search/state";
import { skipTraceEnabled } from "@/lib/skip-trace";
import { DealChip, SourceBadge } from "@/components/property/badges";
import { Gallery } from "@/components/property/gallery";
import { OwnerPanel } from "@/components/property/owner-panel";
import { SaveButton } from "@/components/property/save-button";
import { DealPanel } from "@/components/deals/deal-panel";
import { DetailMapLazy } from "@/components/property/detail-map-lazy";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const d = await loadProperty(params.id);
  return { title: d?.property.address ?? "Property" };
}

// Same rule as listings_feed.is_closed (search_rpcs migration): keep the two in sync
const CLOSED = /redeem|cancel|sold|struck|withdr|bankrupt|postpon/i;

export default async function PropertyPage({ params }: { params: { id: string } }) {
  const d = await loadProperty(params.id);
  if (!d) notFound();
  const { property: p, county, owner, auctions, hud } = d;

  // The listing this page is about: the next open auction, else the HUD listing, else the latest auction
  const openAuction = auctions.find((a) => !CLOSED.test(a.status)) ?? null;
  const auction = openAuction ?? (hud ? null : auctions[0] ?? null);
  const source = auction ? "tax_deed" : hud ? "hud" : null;
  const price = auction?.opening_bid ?? hud?.list_price ?? null;
  const tier = dealTier(price, p.market_value);
  const ratio = valueRatio(price, p.market_value);
  const eventDate = auction?.auction_date ?? (hud?.bid_deadline ? hud.bid_deadline.slice(0, 10) : null);
  const typeLabel = PROPERTY_TYPES.find((t) => t.value === p.property_type)?.label ?? "—";
  const title = p.address ?? "Address not listed";

  const facts: [string, string][] = [
    ["Type", typeLabel],
    ["Beds", p.beds != null ? String(p.beds) : "—"],
    ["Baths", bathsNumber(p.baths) ?? "—"],
    ["Living area", p.sqft ? `${number(p.sqft)} sq ft` : "—"],
    ["Lot size", p.lot_size_sqft ? (p.lot_size_sqft >= 43560 ? `${(p.lot_size_sqft / 43560).toFixed(2)} acres` : `${number(Math.round(p.lot_size_sqft))} sq ft`) : "—"],
    ["Year built", p.year_built ? String(p.year_built) : "—"],
    ["Land use", p.land_use ?? "—"],
    ["Homestead", p.homestead == null ? "—" : p.homestead ? "Yes" : "No"],
    ["Parcel ID", p.parcel_id ?? "—"],
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

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          {/* Price, value, address */}
          <section aria-labelledby="price-heading" className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {source && <SourceBadge source={source} date={eventDate} />}
              <DealChip source={source} tier={tier} ratio={ratio} />
              {auction && CLOSED.test(auction.status) && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{auction.status}</span>}
              {hud && hud.status !== "active" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{hud.status === "under_contract" ? "Under contract" : "No longer listed"}</span>}
            </div>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
              <h1 id="price-heading" className="text-3xl font-bold tracking-tight">
                {money(price)}
                <span className="ml-2 text-base font-normal text-muted-foreground">{source === "tax_deed" ? "opening bid" : source === "hud" ? "list price" : ""}</span>
              </h1>
              {p.market_value != null && (
                <p className="text-sm text-muted-foreground">
                  <abbr title="The county property appraiser's just (market) value" className="no-underline">County value</abbr>{" "}
                  <span className="font-semibold text-foreground">{money(p.market_value)}</span>
                  {ratio != null && <> · {source === "tax_deed" ? "opening bid" : "list price"} is {Math.round(ratio * 100)}% of it</>}
                </p>
              )}
            </div>
            <p className="text-lg">{title}</p>
            <p className="flex flex-wrap gap-x-2 text-sm">
              {p.city && (p.place_geoid
                ? <Link className="text-primary underline-offset-4 hover:underline" href={areaHref("place", p.place_geoid, `${p.city}, ${p.state}`)}>{p.city}</Link>
                : <span>{p.city}</span>)}
              {county && <><span aria-hidden>·</span><Link className="text-primary underline-offset-4 hover:underline" href={areaHref("county", county.fips)}>{county.county_name} County</Link></>}
              {p.zip && <><span aria-hidden>·</span><Link className="text-primary underline-offset-4 hover:underline" href={areaHref("zcta", p.zip)}>{p.zip}</Link></>}
            </p>
            {p.beds != null || p.sqft ? (
              <p className="text-sm text-muted-foreground">
                {[p.beds != null ? `${p.beds} beds` : null, p.baths != null ? `${bathsNumber(p.baths)} baths` : null, p.sqft ? `${number(p.sqft)} sq ft` : null].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </section>

          {/* Facts */}
          <section aria-labelledby="facts-heading">
            <h2 id="facts-heading" className="mb-3 text-lg font-semibold">Facts</h2>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k} className="bg-card p-3">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 break-words text-sm font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Timeline */}
          <section aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="mb-3 text-lg font-semibold">Timeline</h2>
            <div className="space-y-4">
              {auctions.map((a) => (
                <div key={a.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-medium"><Gavel className="size-4 text-primary" aria-hidden /> Tax deed auction · {longDate(a.auction_date)}{a.auction_time ? `, ${a.auction_time}` : ""}</p>
                    <Countdown date={a.auction_date} closed={CLOSED.test(a.status)} status={a.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Case {a.case_no}{a.certificate_no ? ` · Certificate ${a.certificate_no}` : ""} · Opening bid {money(a.opening_bid)}
                    {a.status_detail ? ` · ${a.status_detail}` : ""}
                  </p>
                  {a.history.length > 0 && (
                    <ol className="mt-3 space-y-1.5 border-l pl-4 text-sm">
                      {a.history.map((h) => (
                        <li key={h.id} className="relative">
                          <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
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
                    <p className="flex items-center gap-2 font-medium"><Landmark className="size-4 text-primary" aria-hidden /> HUD listing · {hud.listing_period ?? "Listed"} period</p>
                    {hud.bid_deadline && <Countdown date={hud.bid_deadline.slice(0, 10)} closed={hud.status !== "active"} label="Bids due" />}
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <Row k="Case #" v={hud.hud_case_no} />
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
          </section>

          {/* Map */}
          {p.lat != null && p.lng != null ? (
            <section aria-labelledby="map-heading">
              <h2 id="map-heading" className="mb-3 text-lg font-semibold">Location</h2>
              <DetailMapLazy lat={p.lat} lng={p.lng} placeGeoid={p.place_geoid} zip={p.zip} />
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">We couldn&apos;t place this parcel on the map yet.</p>
          )}

          {/* Owner (tax deed only) */}
          {auctions.length > 0 && (
            <section aria-labelledby="owner-heading" className="rounded-xl border bg-card p-5">
              <h2 id="owner-heading" className="mb-3 text-lg font-semibold">Owner</h2>
              <OwnerPanel propertyId={p.id} owner={owner} homestead={p.homestead} lastSaleDate={p.last_sale_date}
                contacts={d.contacts} lookupEnabled={skipTraceEnabled()} />
            </section>
          )}

          {/* Sales history */}
          <section aria-labelledby="sales-heading">
            <h2 id="sales-heading" className="mb-3 text-lg font-semibold">Sales history</h2>
            {d.sales.length ? (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left text-xs text-muted-foreground">
                    <tr><th scope="col" className="px-3 py-2 font-medium">Date</th><th scope="col" className="px-3 py-2 font-medium">Price</th><th scope="col" className="px-3 py-2 font-medium">Type</th><th scope="col" className="px-3 py-2 font-medium">Book / page</th></tr>
                  </thead>
                  <tbody>
                    {d.sales.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="px-3 py-2">{longDate(s.sale_date)}</td>
                        <td className="px-3 py-2">{money(s.price)}{s.qualified === false && <span className="ml-1 text-xs text-muted-foreground">(not arm&apos;s length)</span>}</td>
                        <td className="px-3 py-2">{s.instrument ?? "—"}</td>
                        <td className="px-3 py-2">{s.book_page ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted-foreground">No recorded sales.</p>}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <section aria-labelledby="deal-heading" className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 id="deal-heading" className="mb-3 font-semibold">Your deal</h2>
            <DealPanel propertyId={p.id} saved={d.saved} events={d.events} notes={d.notes} />
          </section>
          <section aria-labelledby="links-heading" className="rounded-xl border bg-card p-5">
            <h2 id="links-heading" className="mb-3 font-semibold">Official sources</h2>
            <ul className="space-y-2 text-sm">
              {auctions[0]?.auction_url && <ExtLink href={auctions[0].auction_url}>County auction page</ExtLink>}
              {p.appraiser_url && <ExtLink href={p.appraiser_url}>Property appraiser</ExtLink>}
              {hud?.listing_url && <ExtLink href={hud.listing_url}>HUD HomeStore listing</ExtLink>}
              {!auctions[0]?.auction_url && !p.appraiser_url && !hud?.listing_url && <li className="text-muted-foreground">None on file.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
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
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline">
        {children} <ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
      </a>
    </li>
  );
}

function Countdown({ date, closed, status, label = "Auction" }: { date: string; closed: boolean; status?: string; label?: string }) {
  if (closed) return <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{status ?? "Closed"}</span>;
  const d = daysUntil(date);
  if (d == null) return null;
  const text = d < 0 ? `${label} date passed` : d === 0 ? `${label} today` : d === 1 ? `${label} tomorrow` : `${label} in ${d} days`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${d >= 0 && d <= 7 ? "bg-deal-good-soft text-deal-good" : "bg-accent text-accent-foreground"}`}>
      <CalendarClock className="size-3.5" aria-hidden /> {text}
    </span>
  );
}
