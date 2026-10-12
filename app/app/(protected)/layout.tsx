import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      {/* "Data updated" comes from scrape_runs once the Database phase lands */}
      <Header email={user.email ?? null} dataUpdated={null} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
