export default function Loading() {
  return (
    <div className="funnel-theme funnel-shell min-h-dvh">
      <div className="mx-auto max-w-[500px] px-5 py-10">
        <div className="space-y-4 [&>div]:animate-pulse [&>div]:rounded-xl [&>div]:bg-[var(--fn-bg-2)]">
          <div className="h-7 w-2/3" />
          <div className="h-4 w-full" />
          <div className="h-4 w-5/6" />
          <div className="h-52 w-full" />
          <div className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
