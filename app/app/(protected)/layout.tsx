import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { timeAgo } from "@/lib/format";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: updated }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("data_updated_at"),
    supabase.rpc("is_admin"),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header email={user.email ?? null} dataUpdated={timeAgo(updated as string | null)} isAdmin={!!isAdmin} />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
    </div>
  );
}
