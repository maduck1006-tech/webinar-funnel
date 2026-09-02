export default function AdminLoading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-48 animate-pulse rounded-lg bg-zinc-200/60" />
      <div className="h-4 w-72 animate-pulse rounded bg-zinc-200/50" />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border bg-white"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border bg-white" />
    </div>
  );
}
