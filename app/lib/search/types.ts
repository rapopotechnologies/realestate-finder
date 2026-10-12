// Shapes returned by the search RPCs (see supabase/migrations/*_search_rpcs.sql)

export type Layer = "state" | "county" | "place" | "zcta";
export type Source = "tax_deed" | "hud";
export type DealTier = "great" | "good" | "fair";

export interface Place {
  layer: Layer;
  geoid: string;
  label: string;
  state: string | null;
  lat: number;
  lng: number;
  bbox: [number, number, number, number];
}

export interface Area {
  layer: Layer;
  geoid: string;
  name: string;
  label: string;
  state: string | null;
  bbox: [number, number, number, number];
  center: [number, number];
  geometry: GeoJSON.MultiPolygon;
}

export interface ListingItem {
  listing_id: string;
  source: Source;
  property_id: string | null;
  price: number | null;
  event_date: string | null;
  listing_status: string;
  is_closed: boolean;
  address: string | null;
  city: string | null;
  zip: string | null;
  county_fips: string | null;
  county_name: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_size_sqft: number | null;
  year_built: number | null;
  market_value: number | null;
  value_ratio: number | null;
  deal_score: number | null;
  deal_tier: DealTier | null;
  has_building: boolean;
  lat: number | null;
  lng: number | null;
  distance_mi: number | null;
  thumb_path: string | null;
  photo_source: "hud" | "streetview" | "satellite" | "placeholder" | null;
  saved_status: SavedStatus | null;
}

export interface MapPoint {
  listing_id: string;
  property_id: string | null;
  source: Source;
  price: number | null;
  deal_tier: DealTier | null;
  lat: number;
  lng: number;
}

export interface SearchResult {
  total: number;
  page: number;
  page_size: number;
  items: ListingItem[];
  points: MapPoint[];
}

export type CoverageStatus = "tracked" | "starting" | "unsupported";

export interface Coverage {
  counties: { fips: string; name: string; state: string; newly_activated: boolean; status: CoverageStatus }[];
  hud: "tracked" | "unsupported";
}

export type SavedStatus = "interested" | "contacted" | "offer_made" | "passed";
