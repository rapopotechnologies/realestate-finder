import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SearchView } from "@/components/search/search-view";

export const metadata = { title: "Search" };

export default async function SearchPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("last_search").eq("id", user.id).maybeSingle()
    : { data: null };
  const last = typeof profile?.last_search === "string" ? profile.last_search : null;
  return (
    <Suspense>
      <SearchView lastSearch={last} />
    </Suspense>
  );
}
