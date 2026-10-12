"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton({ email }: { email: string | null }) {
  const router = useRouter();
  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <Button variant="ghost" size="icon" onClick={signOut} title={email ? `Sign out ${email}` : "Sign out"}>
      <LogOut aria-hidden />
      <span className="sr-only">Sign out</span>
    </Button>
  );
}
