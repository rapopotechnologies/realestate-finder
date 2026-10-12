import Link from "next/link";
import { Heart } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { SignOutButton } from "@/components/layout/sign-out-button";

export function Header({ email, dataUpdated }: { email: string | null; dataUpdated: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
      <div className="flex h-16 items-center gap-4 px-4 sm:px-6">
        <Logo href="/search" />
        {/* Search box lands here in the Search UI phase */}
        <div className="flex-1" />
        {dataUpdated && (
          <span className="hidden text-xs text-muted-foreground md:inline">Data updated {dataUpdated}</span>
        )}
        <Link
          href="/my-list"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Heart className="size-4" aria-hidden /> My List
        </Link>
        <SignOutButton email={email} />
      </div>
    </header>
  );
}
