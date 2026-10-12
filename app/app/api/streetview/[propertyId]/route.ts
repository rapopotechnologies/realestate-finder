import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Google Street View (or satellite) image for a tax deed property, fetched on demand.
// Google's terms don't allow storing these images, so nothing is saved: the key stays on the
// server and browsers keep the response only in their normal short-lived cache.
// Every billable request counts against a monthly cap (GOOGLE_MAPS_MONTHLY_LIMIT, default 10,000);
// past it, this returns 404 and the app shows its placeholder until the 1st of the month.
const MONTHLY_LIMIT = Number(process.env.GOOGLE_MAPS_MONTHLY_LIMIT) || 10_000;
export async function GET(request: Request, { params }: { params: { propertyId: string } }) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return new NextResponse(null, { status: 404 });

  const sp = new URL(request.url).searchParams;
  const size = /^\d{2,4}x\d{2,4}$/.test(sp.get("size") ?? "") ? sp.get("size")! : "640x400";
  const satellite = sp.get("kind") === "satellite";

  const supabase = createSupabaseServerClient();
  const { data: p } = await supabase.from("properties").select("lat, lng").eq("id", params.propertyId).maybeSingle();
  if (!p?.lat || !p?.lng) return new NextResponse(null, { status: 404 });

  const g = satellite
    ? new URL("https://maps.googleapis.com/maps/api/staticmap")
    : new URL("https://maps.googleapis.com/maps/api/streetview");
  if (satellite) {
    g.searchParams.set("center", `${p.lat},${p.lng}`);
    g.searchParams.set("zoom", "19");
    g.searchParams.set("maptype", "satellite");
    g.searchParams.set("markers", `size:small|color:red|${p.lat},${p.lng}`);
  } else {
    g.searchParams.set("location", `${p.lat},${p.lng}`);
    g.searchParams.set("radius", "60");
    g.searchParams.set("source", "outdoor");
    g.searchParams.set("return_error_code", "true");
  }
  g.searchParams.set("size", size);
  g.searchParams.set("key", key);

  const { data: allowed } = await supabase.rpc("use_api_quota", { p_api: "google_maps_images", p_limit: MONTHLY_LIMIT });
  if (!allowed) return new NextResponse(null, { status: 404, headers: { "X-Quota": "exhausted" } });

  const img = await fetch(g);
  if (!img.ok) return new NextResponse(null, { status: 404 });
  return new NextResponse(img.body, {
    headers: {
      "Content-Type": img.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
