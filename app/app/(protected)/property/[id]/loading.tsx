export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading property">
      <div className="mb-4 h-5 w-32 animate-pulse rounded bg-muted" />
      <div className="h-64 w-full animate-pulse rounded-xl bg-muted md:h-[420px]" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-9 w-56 animate-pulse rounded bg-muted" />
          <div className="h-5 w-72 animate-pulse rounded bg-muted" />
          <div className="mt-6 h-48 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
