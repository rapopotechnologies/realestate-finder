import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MyListBoard, type SavedItem } from "@/components/my-list/board";
import { latestOffer, offerSummary, type Stage, type Strategy } from "@/lib/deals";

export const metadata = { title: "My List" };

export default async function MyListPage() {
  const supabase = createSupabaseServerClient();
  const { data: saved } = await supabase
    .from("saved_properties")
    .select("status, strategy, next_follow_up, position, created_at, property:properties(id, address, city, state, zip, county_fips, market_value, beds, baths, sqft, owner:owners(name, mailing_address, mailing_city, mailing_state, mailing_zip))")
    .order("position")
    .order("created_at", { ascending: false });

  type Row = {
    status: string; strategy: string; next_follow_up: string | null; position: number; created_at: string;
    property: {
      id: string; address: string | null; city: string | null; state: string; zip: string | null; county_fips: string | null;
      market_value: number | null; beds: number | null; baths: number | null; sqft: number | null;
      owner: { name: string; mailing_address: string | null; mailing_city: string | null; mailing_state: string | null; mailing_zip: string | null } | null;
    } | null;
  };
  const rows = ((saved ?? []) as unknown as Row[]).filter((r) => r.property);
  const ids = rows.map((r) => r.property!.id);

  const [listings, notes, counties, photos, offers] = ids.length
    ? await Promise.all([
        supabase.from("listings_feed").select("property_id, source, price, event_date, listing_status, is_closed, listing_url").in("property_id", ids),
        supabase.from("notes").select("property_id, body, created_at").in("property_id", ids).order("created_at", { ascending: false }),
        supabase.from("counties").select("fips, county_name"),
        supabase.from("photos").select("property_id, source, thumb_path, sort_order").in("property_id", ids).order("sort_order"),
        supabase.from("deal_events").select("property_id, kind, occurred_at, offer_amount, offer_response, counter_amount")
          .eq("kind", "offer").in("property_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const countyName = new Map((counties.data ?? []).map((c) => [c.fips, c.county_name]));
  const thumbPaths = (photos.data ?? []).filter((p) => p.thumb_path).map((p) => p.thumb_path!) ;
  const signed = new Map<string, string>();
  if (thumbPaths.length) {
    const { data } = await supabase.storage.from("photos").createSignedUrls(thumbPaths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  const items: SavedItem[] = rows.map((r) => {
    const p = r.property!;
    // Prefer an open listing; otherwise the most recent one
    const ls = (listings.data ?? []).filter((l) => l.property_id === p.id)
      .sort((a, b) => Number(a.is_closed) - Number(b.is_closed) || (b.event_date ?? "").localeCompare(a.event_date ?? ""));
    const l = ls[0];
    const ph = (photos.data ?? []).find((x) => x.property_id === p.id);
    const myNotes = (notes.data ?? []).filter((n) => n.property_id === p.id);
    return {
      propertyId: p.id,
      status: r.status as Stage,
      strategy: r.strategy as Strategy,
      followUp: r.next_follow_up,
      latestOffer: (() => {
        const o = latestOffer((offers.data ?? []).filter((e) => e.property_id === p.id));
        return o ? offerSummary(o) : null;
      })(),
      address: p.address,
      city: p.city,
      zip: p.zip,
      county: p.county_fips ? countyName.get(p.county_fips) ?? null : null,
      source: (l?.source as SavedItem["source"]) ?? null,
      price: l?.price ?? null,
      eventDate: l?.event_date ?? null,
      listingStatus: l?.listing_status ?? null,
      marketValue: p.market_value,
      beds: p.beds, baths: p.baths, sqft: p.sqft,
      owner: p.owner,
      latestNote: myNotes[0]?.body ?? null,
      noteCount: myNotes.length,
      thumb: ph?.thumb_path ? signed.get(ph.thumb_path) ?? null : null,
      photoSource: ph?.source ?? null,
      savedAt: r.created_at,
    };
  });

  return <MyListBoard initial={items} />;
}
