import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSkipTraceProvider } from "@/lib/skip-trace";

const Body = z.object({ propertyId: z.string().uuid() });

// "Find contact info": look up the owner's phone/email with the configured provider and save the
// results to contacts, visible only to the user who ran the lookup (RLS on contacts.user_id).
export async function POST(request: Request) {
  const configured = getSkipTraceProvider();
  if (!configured) {
    return NextResponse.json({ error: "Contact lookup isn't set up. Add a skip-trace provider to turn it on." }, { status: 501 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: owner }, { data: property }] = await Promise.all([
    supabase.from("owners").select("*").eq("property_id", parsed.data.propertyId).maybeSingle(),
    supabase.from("properties").select("address, city, zip").eq("id", parsed.data.propertyId).maybeSingle(),
  ]);
  if (!owner || !property) return NextResponse.json({ error: "No owner on record for this property" }, { status: 404 });

  try {
    const result = await configured.provider.lookup({
      ownerName: owner.name, mailingAddress: owner.mailing_address, mailingCity: owner.mailing_city,
      mailingState: owner.mailing_state, mailingZip: owner.mailing_zip,
      propertyAddress: property.address, propertyCity: property.city, propertyZip: property.zip,
    }, configured.apiKey);
    const source = configured.provider.label;
    const rows = [
      ...result.phones.map((phone) => ({ property_id: parsed.data.propertyId, phone, source })),
      ...result.emails.map((email) => ({ property_id: parsed.data.propertyId, email, source })),
    ];
    if (rows.length) {
      const { error } = await supabase.from("contacts").insert(rows);
      if (error) throw error;
    }
    return NextResponse.json({ found: rows.length });
  } catch {
    return NextResponse.json({ error: "The contact lookup failed. Try again later." }, { status: 502 });
  }
}
