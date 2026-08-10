'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  FilePlus2,
  Pencil,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PropertyRecordNavigationItem {
  label: string;
  href: string;
  active?: boolean;
}

interface PropertyRecordTemplateProps {
  title: string;
  address: string;
  metadata: string[];
  completeness: number;
  lastUpdated: string;
  editHref: string;
  addHref: string;
  navigation: PropertyRecordNavigationItem[];
  children: ReactNode;
}

export default function PropertyRecordTemplate({
  title,
  address,
  metadata,
  completeness,
  lastUpdated,
  editHref,
  addHref,
  navigation,
  children,
}: PropertyRecordTemplateProps) {
  return (
    <section className="space-y-4 sm:space-y-5">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-emerald-50/50 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Property Record
                </p>
                <h1 className="mb-0 truncate text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  {title}
                </h1>
                <p className="mt-1 mb-0 text-sm text-slate-600">{address}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {metadata.map((item) => (
                    <span
                      key={item}
                      className="inline-flex min-h-[28px] items-center rounded-full border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              <Button variant="outline" asChild className="min-h-[44px] justify-center">
                <Link href={editHref}>
                  <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                  Edit property
                </Link>
              </Button>
              <Button asChild className="min-h-[44px] justify-center bg-emerald-700 hover:bg-emerald-800">
                <Link href={addHref}>
                  <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Add to record
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-slate-200/80 bg-white/90 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-700">Record completeness</span>
                <span className="font-semibold text-emerald-700">{completeness}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, completeness))}%` }}
                />
              </div>
            </div>
            <p className="mb-0 text-xs text-slate-500">Updated {lastUpdated}</p>
          </div>
        </div>

        <nav aria-label="Property record sections" className="px-2 py-2 sm:px-4">
          <div className="hidden items-center gap-1 overflow-x-auto md:flex">
            {navigation.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={cn(
                  'no-brand-style inline-flex min-h-[40px] shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors',
                  item.active
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <details className="group md:hidden">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-xl bg-slate-50 px-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
              <span>{navigation.find((item) => item.active)?.label ?? 'Overview'}</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-2 grid gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              {navigation.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={cn(
                    'no-brand-style flex min-h-[44px] items-center justify-between rounded-lg px-3 text-sm font-medium',
                    item.active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700',
                  )}
                >
                  {item.label}
                  {!item.active ? <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" /> : null}
                </Link>
              ))}
            </div>
          </details>
        </nav>
      </header>

      {children}
    </section>
  );
}
