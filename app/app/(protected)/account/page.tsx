import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "@/components/account/change-password";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Section } from "@/components/ui/section";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { count: saved }] = await Promise.all([
    supabase.from("profiles").select("last_search, is_admin").eq("id", user!.id).maybeSingle(),
    supabase.from("saved_properties").select("property_id", { count: "exact", head: true }),
  ]);
  const lastSearch = typeof profile?.last_search === "string" ? profile.last_search : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl">Account</h1>

      <Section id="you-heading" title="You">
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-medium">{user!.email}</dd>
          <dt className="text-muted-foreground">Saved properties</dt>
          <dd><Link href="/my-list" className="text-plat underline-offset-4 hover:underline">{saved ?? 0} on My List</Link></dd>
          {lastSearch && (
            <>
              <dt className="text-muted-foreground">Last search</dt>
              <dd><Link href={`/search?${lastSearch}`} className="inline-flex items-center gap-1 text-plat underline-offset-4 hover:underline">
                Open it <ArrowRight className="size-3.5" aria-hidden /></Link></dd>
            </>
          )}
        </dl>
      </Section>

      {/* Password reset emails land on /account#password */}
      <Section id="password" title="Password" className="[&_h2]:scroll-mt-20">
        <ChangePasswordForm />
      </Section>

      {profile?.is_admin && (
        <Section id="admin-heading" title="Admin">
          <p className="text-sm text-muted-foreground">Scrape runs, tracked counties and Google usage.</p>
          <Link href="/admin" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-plat underline-offset-4 hover:underline">
            <Activity className="size-4" aria-hidden /> Open scrape runs
          </Link>
        </Section>
      )}

      <SignOutButton />
    </div>
  );
}
