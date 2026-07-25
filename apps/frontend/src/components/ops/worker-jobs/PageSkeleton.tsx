// apps/frontend/src/components/ops/worker-jobs/PageSkeleton.tsx

export function PageSkeleton() {
  return (
    <div className="space-y-7">
      <div className="flex h-11 animate-pulse items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-100 p-2" />
      {[1, 2, 3].map((g) => (
        <div key={g}>
          <div className="mb-2 h-2.5 w-24 animate-pulse rounded-full bg-slate-200" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-slate-200 border-l-[3px] border-l-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-slate-200" />
                  <div className="h-3.5 flex-1 animate-pulse rounded bg-slate-200" />
                </div>
                <div className="mt-2 h-2.5 w-full animate-pulse rounded bg-slate-100" />
                <div className="mt-1 h-2.5 w-4/5 animate-pulse rounded bg-slate-100" />
                <div className="mt-3 h-2.5 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
