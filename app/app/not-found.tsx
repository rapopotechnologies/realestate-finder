import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen items-center">
      <EmptyState page icon={MapPinOff} title="Page not found" body="The link may be old or incomplete."
        action={<Button asChild><Link href="/search">Back to search</Link></Button>} />
    </main>
  );
}
