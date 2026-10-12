import { NextResponse } from "next/server";

// Free-text address -> point, via the free US Census one-line geocoder.
// Runs on the server (the Census API has no CORS); the middleware keeps it signed-in only.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 4 || q.length > 200) {
    return NextResponse.json({ error: "Enter a street address" }, { status: 400 });
  }
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", /\bFL\b|florida/i.test(q) ? q : `${q}, FL`);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");
  try {
    const r = await fetch(url, { next: { revalidate: 86400 } });
    const j = await r.json();
    const m = j?.result?.addressMatches?.[0];
    if (!m) return NextResponse.json({ error: "We couldn't find that address" }, { status: 404 });
    return NextResponse.json({ lat: m.coordinates.y, lng: m.coordinates.x, label: m.matchedAddress });
  } catch {
    return NextResponse.json({ error: "Address lookup is unavailable right now" }, { status: 502 });
  }
}
