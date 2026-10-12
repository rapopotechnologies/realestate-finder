import { describe, expect, it } from "vitest";
import { parseSearch, rpcArgs, serializeSearch } from "@/lib/search/state";

const parse = (qs: string) => parseSearch(new URLSearchParams(qs));

describe("search URL state", () => {
  it("reads the brief's example URLs", () => {
    expect(parse("zip=34715&r=25")).toMatchObject({ area: { kind: "area", layer: "zcta", geoid: "34715" }, radiusMi: 25 });
    expect(parse("county=12069")).toMatchObject({ area: { kind: "area", layer: "county", geoid: "12069" }, radiusMi: null });
    expect(parse("city=Clermont,FL").area).toEqual({ kind: "area", layer: "place", label: "Clermont, FL" });
  });

  it("defaults a point search to 25 miles, sorted by distance", () => {
    const s = parse("lat=28.5&lng=-81.7&near=1");
    expect(s.area).toMatchObject({ kind: "point", near: true });
    expect(s.radiusMi).toBe(25);
    expect(s.sort).toBe("distance");
  });

  it("round-trips filters", () => {
    const qs = "city=Clermont,FL&r=10&src=hud&pmin=5000&pmax=100000&type=single_family&beds=3&bldg=1&closed=1&sort=price_asc&page=2";
    expect(serializeSearch(parse(qs))).toBe(qs);
  });

  it("keeps near-you URLs short", () => {
    expect(serializeSearch(parse("lat=28.5&lng=-81.7&near=1"))).toBe("lat=28.50000&lng=-81.70000&near=1");
  });

  it("builds RPC arguments", () => {
    expect(rpcArgs(parse("county=12069&src=tax_deed&beds=2"), null)).toMatchObject({
      p_area_layer: "county", p_area_geoid: "12069",
      p_filters: { hide_closed: true, sources: ["tax_deed"], beds_min: 2 },
    });
    expect(rpcArgs(parse("lat=28.5&lng=-81.7"), null)).toMatchObject({ p_lat: 28.5, p_lng: -81.7, p_radius_mi: 25 });
    expect(rpcArgs(parse(""), null)).toBeNull();
  });
});
