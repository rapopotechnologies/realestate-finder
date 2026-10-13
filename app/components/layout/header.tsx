import { Suspense } from "react";
import { Logo } from "@/components/layout/logo";
import { SearchBox } from "@/components/search/search-box";
import { HeaderNav } from "./header-nav";

export function Header({ dataUpdated }: { dataUpdated: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Logo href="/search" compact />
        <div className="min-w-0 max-w-md flex-1 md:min-w-[14rem]">
          <Suspense fallback={<div className="h-10 rounded-full border bg-background" />}>
            <SearchBox />
          </Suspense>
        </div>
        <div className="flex-1 max-md:hidden" />
        {dataUpdated && (
          <span className="hidden whitespace-nowrap text-xs text-muted-foreground xl:inline">Data updated {dataUpdated}</span>
        )}
        <HeaderNav />
      </div>
    </header>
  );
}
