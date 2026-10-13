"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <>
      <EmptyState page alert icon={AlertCircle} title="Something went wrong"
        body="We couldn't load this page. It's usually a brief connection problem."
        action={<>
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild><a href="/search">Back to search</a></Button>
        </>} />
      {error.digest && <p className="-mt-16 text-center text-xs text-muted-foreground">Error ID: <span className="font-mono">{error.digest}</span></p>}
    </>
  );
}
