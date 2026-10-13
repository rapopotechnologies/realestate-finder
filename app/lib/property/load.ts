import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type PhotoView = { url: string | null; thumb: string | null; source: string; attribution: string | null; width: number | null; height: number | null };

export interface PropertyDetail {
  property: Tables<"properties">;
  county: Pick<Tables<"counties">, "fips" | "county_name" | "state" | "auction_base_url"> | null;
  owner: Tables<"owners"> | null;
  auctions: (Tables<"auctions"> & { history: Tables<"auction_status_history">[] })[];
  hud: Tables<"hud_listings"> | null;
  photos: PhotoView[];
  sales: Tables<"property_sales">[];
  saved: Tables<"saved_properties"> | null;
  notes: Tables<"notes">[];
  events: Tables<"deal_events">[];
  contacts: Tables<"contacts">[];
}

/** Everything the detail page shows, read with the signed-in user's session (RLS applies). */
export async function loadProperty(id: string): Promise<PropertyDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = createSupabaseServerClient();
  const { data: property } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  if (!property) return null;

  const [county, owner, auctions, hud, photos, sales, saved, notes, events, contacts] = await Promise.all([
    property.county_fips
      ? supabase.from("counties").select("fips, county_name, state, auction_base_url").eq("fips", property.county_fips).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("owners").select("*").eq("property_id", id).maybeSingle(),
    supabase.from("auctions").select("*, history:auction_status_history(*)").eq("property_id", id).order("auction_date", { ascending: false }),
    supabase.from("hud_listings").select("*").eq("property_id", id).order("last_seen", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("photos").select("*").eq("property_id", id).order("source").order("sort_order"),
    supabase.from("property_sales").select("*").eq("property_id", id).order("sale_date", { ascending: false }),
    supabase.from("saved_properties").select("*").eq("property_id", id).maybeSingle(),
    supabase.from("notes").select("*").eq("property_id", id).order("created_at", { ascending: false }),
    supabase.from("deal_events").select("*").eq("property_id", id).order("occurred_at", { ascending: false }),
    supabase.from("contacts").select("*").eq("property_id", id).order("retrieved_at", { ascending: false }),
  ]);

  // HUD photos live in a private bucket: sign them for an hour
  const rows = photos.data ?? [];
  const paths = rows.flatMap((p) => [p.storage_path, p.thumb_path]).filter((p): p is string => !!p);
  const signed: Record<string, string> = {};
  if (paths.length) {
    const { data } = await supabase.storage.from("photos").createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed[s.path] = s.signedUrl;
  }
  const photoViews: PhotoView[] = rows
    .filter((p) => p.source !== "hud" || p.storage_path) // HUD photos not copied yet are skipped
    .map((p) => ({
      url: p.storage_path ? signed[p.storage_path] ?? null : null,
      thumb: p.thumb_path ? signed[p.thumb_path] ?? null : null,
      source: p.source, attribution: p.attribution, width: p.width, height: p.height,
    }));

  type AuctionWithHistory = Tables<"auctions"> & { history: Tables<"auction_status_history">[] };
  const auctionRows = ((auctions.data ?? []) as unknown as AuctionWithHistory[]).map((a) => ({
    ...a,
    history: [...(a.history ?? [])].sort((x, y) => x.changed_at.localeCompare(y.changed_at)),
  }));

  return {
    property,
    county: county.data ?? null,
    owner: owner.data ?? null,
    auctions: auctionRows,
    hud: hud.data ?? null,
    photos: photoViews,
    sales: sales.data ?? [],
    saved: saved.data ?? null,
    notes: notes.data ?? [],
    events: events.data ?? [],
    contacts: contacts.data ?? [],
  };
}
