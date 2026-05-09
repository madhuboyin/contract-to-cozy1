"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Wrench,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { navigateBackWithDashboardFallback } from "@/lib/navigation/backNavigation";
import { differenceInDays, parseISO, isPast } from "date-fns";

const frequencyLabels: Record<string, string> = {
  MONTHLY:       "Monthly",
  QUARTERLY:     "Quarterly",
  SEMI_ANNUALLY: "Every 6 months",
  ANNUALLY:      "Annual",
};

function formatCents(cents: number | null | undefined): string | null {
  if (!cents) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function getDaysOverdueLabel(nextDueDate: string | null | undefined): string | null {
  if (!nextDueDate) return null;
  const due = parseISO(nextDueDate);
  if (!isPast(due)) return null;
  const days = differenceInDays(new Date(), due);
  if (days === 0) return "Due today";
  if (days === 1) return "Overdue by 1 day";
  return `Overdue by ${days} days`;
}

export default function MaintenanceFocusPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const taskId = (Array.isArray(params.taskId) ? params.taskId[0] : params.taskId) as string;

  const { data: checklistRes, isLoading } = useQuery({
    queryKey: ["homebuyer-checklist"],
    queryFn: () => api.getHomeBuyerChecklist(),
    enabled: !!propertyId,
  });

  if (isLoading || !propertyId) {
    return (
      <DashboardShell>
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }

  const checklist = checklistRes?.success ? checklistRes.data : null;
  const rawTasks = checklist?.tasks ?? [];
  // The API attaches nextDueDate at runtime beyond the TypeScript type
  const tasks = rawTasks as Array<typeof rawTasks[number] & { nextDueDate?: string | null; propertyId?: string | null }>;
  const task = tasks.find(t => t.id === taskId);

  const maintenanceHref = `/dashboard/properties/${propertyId}/?tab=maintenance&view=insights`;

  if (!task) {
    return (
      <DashboardShell>
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground" onClick={() => navigateBackWithDashboardFallback(router)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
            <Wrench className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-base font-semibold text-slate-700">Task not found</p>
            <Link href={maintenanceHref}>
              <Button variant="outline" size="sm" className="mt-2">View maintenance actions <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const overdueLabel = getDaysOverdueLabel(task.nextDueDate);
  const cleanTitle = task.title.replace(/^OVERDUE:\s*/i, "");
  const dueDate = task.nextDueDate ? parseISO(task.nextDueDate) : null;
  const dueDateLabel = dueDate ? `Due ${dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : null;

  return (
    <DashboardShell className="pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 lg:max-w-4xl">

        <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground" onClick={() => navigateBackWithDashboardFallback(router)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to dashboard
        </Button>

        {/* ── Hero ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b bg-amber-50 border-amber-200">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-amber-50 border-amber-200 text-amber-600">
                <Wrench className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Maintenance task</p>
                  {overdueLabel && (
                    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200">
                      {overdueLabel}
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-bold text-slate-900 mt-1 leading-snug">{cleanTitle}</h1>
                {dueDateLabel && (
                  <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" /> {dueDateLabel}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Task details */}
          {(() => {
            const details: { label: string; value: React.ReactNode }[] = [];
            const freqLabel = task.frequency ? frequencyLabels[task.frequency] : null;
            if (freqLabel) details.push({ label: "Frequency", value: freqLabel });
            const cost = formatCents(task.estimatedCostCents);
            if (cost) details.push({ label: "Est. cost", value: cost });
            if (!details.length) return null;
            return (
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Task details</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {details.map(({ label, value }) => (
                    <div key={label}>
                      <dt className="text-xs text-slate-400">{label}</dt>
                      <dd className="text-sm font-medium text-slate-700 mt-0.5">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })()}

          <div className="px-5 py-4 space-y-4">
            {task.description && (
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                <p className="text-sm text-slate-700 leading-relaxed">{task.description}</p>
              </div>
            )}

            {overdueLabel && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
                <Clock3 className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <p className="text-sm text-slate-700">
                  Overdue maintenance tasks can increase wear and lead to preventable damage. Completing or scheduling this now reduces your risk.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Action panel ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-5 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">What to do next</p>

          <Link href={maintenanceHref} className="block">
            <div className="rounded-xl bg-teal-800 hover:bg-teal-700 active:scale-[0.99] transition-all px-4 py-3 flex items-center justify-between gap-2 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-white/80 shrink-0" />
                <p className="text-sm font-semibold text-white">Go to maintenance actions</p>
              </div>
              <ArrowRight className="h-4 w-4 text-white/80 shrink-0" />
            </div>
          </Link>

          <Link href={`/dashboard/fix?focus=priority-actions`} className="block">
            <div className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-[0.99] transition-all px-4 py-3 flex items-center justify-between gap-2 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <CalendarClock className="h-4 w-4 text-slate-500 shrink-0" />
                <p className="text-sm font-medium text-slate-700">View all overdue tasks</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
            </div>
          </Link>
        </div>

        <p className="text-xs text-slate-400 text-center px-2">{cleanTitle} · Maintenance task</p>
      </div>
    </DashboardShell>
  );
}
