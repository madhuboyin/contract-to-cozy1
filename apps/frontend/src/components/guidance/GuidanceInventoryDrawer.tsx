'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  Building2,
  ChevronRight,
  Droplets,
  Home,
  Package,
  ShieldAlert,
  ShieldCheck,
  UtensilsCrossed,
  Wifi,
  Wind,
  Zap,
} from 'lucide-react';
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

// ── Types ──────────────────────────────────────────────────────────────────

type Props = {
  item: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onStartGuidance: () => void;
};

type IconStyle = {
  icon: ComponentType<{ className?: string }>;
  bg: string;
  color: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function categoryIconStyle(category: string): IconStyle {
  switch (category) {
    case 'APPLIANCE':      return { icon: UtensilsCrossed, bg: 'bg-orange-50',  color: 'text-orange-500'  };
    case 'HVAC':           return { icon: Wind,            bg: 'bg-blue-50',    color: 'text-blue-500'    };
    case 'PLUMBING':       return { icon: Droplets,        bg: 'bg-cyan-50',    color: 'text-cyan-600'    };
    case 'ELECTRICAL':     return { icon: Zap,             bg: 'bg-amber-50',   color: 'text-amber-500'   };
    case 'ROOF_EXTERIOR':  return { icon: Home,            bg: 'bg-stone-50',   color: 'text-stone-500'   };
    case 'SAFETY':         return { icon: ShieldAlert,     bg: 'bg-rose-50',    color: 'text-rose-500'    };
    case 'SMART_HOME':     return { icon: Wifi,            bg: 'bg-violet-50',  color: 'text-violet-500'  };
    default:               return { icon: Package,         bg: 'bg-slate-100',  color: 'text-slate-500'   };
  }
}

function conditionStyle(condition: string): { badge: string; dot: string } {
  switch (condition) {
    case 'NEW':   return { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400' };
    case 'GOOD':  return { badge: 'border-sky-200 bg-sky-50 text-sky-700',             dot: 'bg-sky-400'     };
    case 'FAIR':  return { badge: 'border-amber-200 bg-amber-50 text-amber-700',       dot: 'bg-amber-400'   };
    case 'POOR':  return { badge: 'border-rose-200 bg-rose-50 text-rose-700',          dot: 'bg-rose-400'    };
    default:      return { badge: 'border-slate-200 bg-slate-100 text-slate-600',      dot: 'bg-slate-300'   };
  }
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

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold tracking-wide text-slate-400">{children}</p>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function GuidanceInventoryDrawer({ item, isOpen, onClose, onStartGuidance }: Props) {
  const iconStyle = item ? categoryIconStyle(item.category) : categoryIconStyle('OTHER');
  const IconComponent = iconStyle.icon;
  const condStyle = item?.condition ? conditionStyle(item.condition) : null;

  // Overview rows: brand, model, costs
  const overviewRows: { label: string; value: string }[] = item
    ? ([
        item.brand      && { label: 'Brand',             value: item.brand },
        item.model      && { label: 'Model',             value: item.model },
        item.purchaseCostCents
          && { label: 'Purchase cost',   value: formatCurrency(item.purchaseCostCents / 100) },
        item.replacementCostCents
          && { label: 'Est. replacement', value: formatCurrency(item.replacementCostCents / 100) },
      ].filter(Boolean) as { label: string; value: string }[])
    : [];

  // Timeline: all known dates, sorted chronologically
  const timelineItems: { label: string; date: string }[] = item
    ? ([
        item.purchasedOn    && { label: 'Purchased',     date: item.purchasedOn },
        item.installedOn    && { label: 'Installed',     date: item.installedOn },
        item.lastServicedOn && { label: 'Last serviced', date: item.lastServicedOn },
      ]
        .filter(Boolean)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()) as {
          label: string;
          date: string;
        }[])
    : [];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[540px]"
      >
        {/* A11y */}
        <SheetTitle className="sr-only">{item?.name ?? 'Item details'}</SheetTitle>
        <SheetDescription className="sr-only">
          Review this home item before starting guided resolution.
        </SheetDescription>

        {/* ── HEADER ───────────────────────────────────────────────────── */}
        <div className="px-6 pb-6 pt-5">
          {/* Icon · Name · Condition — pr-12 clears the built-in × button */}
          <div className="flex items-start gap-3 pr-12">
            {/* Category icon */}
            <span
              className={cn(
                'mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                item ? iconStyle.bg : 'animate-pulse bg-slate-200'
              )}
            >
              {item && <IconComponent className={cn('h-5 w-5', iconStyle.color)} />}
            </span>

            {/* Name + meta */}
            <div className="min-w-0 flex-1">
              {item ? (
                <h2 className="text-lg font-semibold leading-snug text-slate-900">{item.name}</h2>
              ) : (
                <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
              )}
              <p className="mt-0.5 text-sm text-slate-500">
                {item
                  ? [formatEnumLabel(item.category), (item.room as any)?.name]
                      .filter(Boolean)
                      .join(' · ')
                  : '—'}
              </p>
            </div>

            {/* Condition badge */}
            {item?.condition && condStyle && (
              <span
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                  condStyle.badge
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', condStyle.dot)} />
                {formatEnumLabel(item.condition)}
              </span>
            )}
          </div>

          {/* Primary CTA */}
          <Button
            onClick={onStartGuidance}
            disabled={!item}
            className={cn(
              'mt-4 min-h-[44px] w-full rounded-xl font-semibold text-white',
              'bg-sky-600 shadow-sm hover:bg-sky-700 hover:shadow-md',
              'active:scale-[0.99] transition-all disabled:opacity-50'
            )}
          >
            Start Guidance
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
        {(item ? overviewRows.length > 0 : true) && (
          <div className="border-t border-slate-100 px-6 py-5">
            <SectionLabel>Overview</SectionLabel>
            {item ? (
              <div className="divide-y divide-slate-50">
                {overviewRows.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} />
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="h-4 w-16 animate-pulse rounded bg-slate-100" />
                    <span className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TIMELINE ─────────────────────────────────────────────────── */}
        {(item ? timelineItems.length > 0 : true) && (
          <div className="border-t border-slate-100 px-6 py-5">
            <SectionLabel>Timeline</SectionLabel>
            {item ? (
              <ol className="space-y-0">
                {timelineItems.map((entry, idx) => {
                  const isLast = idx === timelineItems.length - 1;
                  return (
                    <li key={entry.label} className="flex gap-3">
                      {/* Dot + connector */}
                      <div className="flex flex-col items-center pt-[5px]">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                        {!isLast && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                      </div>
                      {/* Row content */}
                      <div
                        className={cn(
                          'flex flex-1 items-start justify-between gap-3 text-sm',
                          isLast ? 'pb-0' : 'pb-3'
                        )}
                      >
                        <span className="text-slate-600">{entry.label}</span>
                        <span className="font-medium text-slate-800">{fmtDate(entry.date)}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                    <span className="h-4 w-28 animate-pulse rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── COVERAGE ─────────────────────────────────────────────────── */}
        <div className="border-t border-slate-100 px-6 py-5">
          <SectionLabel>Coverage</SectionLabel>
          {item ? (
            item.warranty || item.insurancePolicy ? (
              <div className="space-y-2">
                {item.warranty && (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {(item.warranty as any)?.name ?? 'Warranty linked'}
                      </p>
                      {(item.warranty as any)?.expiresOn && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          Expires {fmtDate((item.warranty as any).expiresOn)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {item.insurancePolicy && (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {(item.insurancePolicy as any)?.insurerName ?? 'Insurance policy linked'}
                      </p>
                      {(item.insurancePolicy as any)?.renewalDate && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          Renews {fmtDate((item.insurancePolicy as any).renewalDate)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No warranty or insurance linked to this item.</p>
            )
          ) : (
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          )}
        </div>

        {/* ── NOTES ────────────────────────────────────────────────────── */}
        {item?.notes && (
          <div className="border-t border-slate-100 px-6 py-5">
            <SectionLabel>Notes</SectionLabel>
            <p className="text-sm leading-relaxed text-slate-600">{item.notes}</p>
          </div>
        )}

        {/* Mobile safe-area spacer */}
        <div className="min-h-[env(safe-area-inset-bottom,0px)]" />
      </SheetContent>
    </Sheet>
  );
}
