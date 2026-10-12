import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PropertyNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">Property not found</h1>
      <p className="mt-2 text-muted-foreground">It may have been removed from the listings, or the link is incomplete.</p>
      <Button asChild className="mt-6"><Link href="/search">Back to search</Link></Button>
    </div>
  );
}
