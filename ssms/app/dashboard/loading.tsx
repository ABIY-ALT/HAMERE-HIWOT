// Shown at once while a dashboard page loads, so the previous page does not
// stay on screen (the menu, header and sidebar stay in place).

export default function DashboardLoading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 rounded-lg bg-slate-200" />
      <div className="h-4 w-80 max-w-full rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-slate-200" />
    </div>
  );
}
