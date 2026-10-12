export default function Loading() {
  return (
    <div className="px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading My List">
      <div className="mb-5 h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />)}
      </div>
    </div>
  );
}
