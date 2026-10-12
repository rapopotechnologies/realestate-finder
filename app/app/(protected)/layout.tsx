import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { timeAgo } from "@/lib/format";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: updated } = await supabase.rpc("data_updated_at");

  return (
    <div className="flex min-h-screen flex-col">
      <Header email={user.email ?? null} dataUpdated={timeAgo(updated as string | null)} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
