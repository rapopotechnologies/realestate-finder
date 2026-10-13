import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function PropertyNotFound() {
  return (
    <EmptyState page icon={SearchX} title="Property not found"
      body="It may have been removed from the listings, or the link is incomplete."
      action={<Button asChild><Link href="/search">Back to search</Link></Button>} />
  );
}
