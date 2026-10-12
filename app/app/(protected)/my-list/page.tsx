export const metadata = { title: "My List" };

export default function MyListPage() {
  return (
    <div className="container max-w-3xl py-16 text-center">
      <h1 className="text-2xl font-semibold">My List</h1>
      <p className="mt-2 text-muted-foreground">Saved properties will show up here.</p>
    </div>
  );
}
