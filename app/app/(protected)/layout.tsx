import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
import { timeAgo } from "@/lib/format";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: updated } = await supabase.rpc("data_updated_at");

  return (
    <div className="flex min-h-screen flex-col">
      <Header dataUpdated={timeAgo(updated as string | null)} />
      {/* pb-16: room for the phone bottom bar */}
      <main id="main" tabIndex={-1} className="flex-1 pb-16 focus:outline-none md:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}
