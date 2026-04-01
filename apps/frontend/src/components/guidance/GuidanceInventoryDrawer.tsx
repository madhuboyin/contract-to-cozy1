'use client';

import { Building2, ChevronRight, ShieldCheck } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { formatEnumLabel } from '@/lib/utils/formatters';
import type { InventoryItem } from '@/types';

type Props = {
  item: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onStartGuidance: () => void;
};

function conditionTone(condition: string) {
  if (condition === 'NEW') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (condition === 'GOOD') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (condition === 'FAIR') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (condition === 'POOR') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

export function GuidanceInventoryDrawer({ item, isOpen, onClose, onStartGuidance }: Props) {
  const hasDetails =
    item &&
    (item.installedOn ||
      item.purchasedOn ||
      item.lastServicedOn ||
      item.purchaseCostCents ||
      item.replacementCostCents);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[480px]"
      >
        {/* Visually-hidden a11y title */}
        <SheetTitle className="sr-only">{item?.name ?? 'Item details'}</SheetTitle>
        <SheetDescription className="sr-only">
          Review this home item before starting guided resolution.
        </SheetDescription>

        {/* ── Header ── */}
        <div className="border-b border-slate-100 px-6 pb-5 pt-6">
          {/* Chips row */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5 pr-10">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {item ? formatEnumLabel(item.category) : '—'}
            </span>
            {item?.condition && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  conditionTone(item.condition)
                )}
              >
                {formatEnumLabel(item.condition)}
              </span>
            )}
          </div>

          {/* Name */}
          {item ? (
            <h2 className="text-xl font-bold leading-tight text-slate-900">{item.name}</h2>
          ) : (
            <div className="h-6 w-48 animate-pulse rounded-md bg-slate-200" />
          )}

          {/* Brand / model subtitle */}
          {(item?.brand || item?.model) && (
            <p className="mt-1 text-sm text-slate-500">
              {[item.brand, item.model].filter(Boolean).join(' · ')}
            </p>
          )}

          {/* Primary CTA */}
          <Button
            onClick={onStartGuidance}
            disabled={!item}
            className="mt-4 min-h-[44px] w-full rounded-xl bg-sky-600 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Start Guidance
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>

        {/* ── Key Details ── */}
        <div className="px-6 py-4">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Key Details
          </p>

          {item ? (
            hasDetails ? (
              <div className="divide-y divide-slate-100">
                {item.installedOn && (
                  <DetailRow label="Installed" value={fmtDate(item.installedOn)} />
                )}
                {item.purchasedOn && (
                  <DetailRow label="Purchased" value={fmtDate(item.purchasedOn)} />
                )}
                {item.lastServicedOn && (
                  <DetailRow label="Last serviced" value={fmtDate(item.lastServicedOn)} />
                )}
                {item.purchaseCostCents ? (
                  <DetailRow
                    label="Purchase cost"
                    value={formatCurrency(item.purchaseCostCents / 100)}
                  />
                ) : null}
                {item.replacementCostCents ? (
                  <DetailRow
                    label="Est. replacement"
                    value={formatCurrency(item.replacementCostCents / 100)}
                  />
                ) : null}
              </div>
            ) : (
              <p className="pt-1 text-sm text-slate-400">No dates or costs recorded for this item.</p>
            )
          ) : (
            // Skeleton
            <div className="mt-2 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex justify-between">
                  <span className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                  <span className="h-4 w-28 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Coverage ── */}
        <div className="border-t border-slate-100 px-6 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Coverage
          </p>

          {item ? (
            item.warranty || item.insurancePolicy ? (
              <div className="space-y-2">
                {item.warranty && (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-emerald-800">
                        {(item.warranty as any)?.name ?? 'Warranty linked'}
                      </p>
                      {(item.warranty as any)?.expiresOn && (
                        <p className="mt-0.5 text-xs text-emerald-600">
                          Expires {fmtDate((item.warranty as any).expiresOn)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {item.insurancePolicy && (
                  <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-sky-800">
                        {(item.insurancePolicy as any)?.insurerName ?? 'Insurance policy linked'}
                      </p>
                      {(item.insurancePolicy as any)?.renewalDate && (
                        <p className="mt-0.5 text-xs text-sky-600">
                          Renews {fmtDate((item.insurancePolicy as any).renewalDate)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No warranty or insurance linked.</p>
            )
          ) : (
            <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
          )}
        </div>

        {/* ── Notes ── */}
        {item?.notes && (
          <div className="border-t border-slate-100 px-6 py-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notes
            </p>
            <p className="text-sm leading-relaxed text-slate-600">{item.notes}</p>
          </div>
        )}

        {/* Bottom safe-area spacer for mobile */}
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </SheetContent>
    </Sheet>
  );
}
