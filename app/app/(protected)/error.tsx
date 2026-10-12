"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center" role="alert">
      <AlertCircle className="size-10 text-destructive" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted-foreground">We couldn&apos;t load this page. It&apos;s usually a brief connection problem.</p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild><a href="/search">Back to search</a></Button>
      </div>
      {error.digest && <p className="mt-6 text-xs text-muted-foreground">Error ID: {error.digest}</p>}
    </div>
  );
}
