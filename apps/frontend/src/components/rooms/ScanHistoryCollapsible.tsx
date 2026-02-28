'use client';

import React, { useState } from 'react';
import { ChevronDown, History, RefreshCw, Sparkles } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { humanizeLabel } from '@/lib/utils/string';

type ScanHistoryCollapsibleProps = {
  scans: any[];
  loading: boolean;
  onRefresh: () => void;
  onReopen: (sessionId: string) => void;
  getExportUrl: (sessionId: string) => string;
  onStartScan?: () => void;
};

export default function ScanHistoryCollapsible({
  scans,
  loading,
  onRefresh,
  onReopen,
  getExportUrl,
  onStartScan,
}: ScanHistoryCollapsibleProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible className="mt-6" open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-sm text-gray-400 transition-colors hover:text-gray-600">
        <History className="h-3.5 w-3.5" />
        Scan History
        {scans.length > 0 ? (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{scans.length}</span>
        ) : null}

        <span className="ml-auto hidden text-xs text-gray-400 sm:block">Reopen or export drafts</span>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRefresh();
          }}
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Refresh scan history"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : 'rotate-0'}`} />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2">
        {scans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/60 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-white/80 p-2 text-teal-600">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900">Unlock your Room Health</p>
                <p className="text-xs text-gray-600">Start your first AI scan to generate room health insights and actionable drafts.</p>
                {onStartScan ? (
                  <button
                    type="button"
                    onClick={onStartScan}
                    className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
                  >
                    Start AI Scan
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
            {scans.slice(0, 8).map((session) => {
              const created = session?.createdAt ? new Date(session.createdAt) : null;
              const label = created ? created.toLocaleString() : '-';
              const counts = session?.counts || {};
              const exportUrl = getExportUrl(session.id);

              return (
                <div
                  key={session.id}
                  className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 transition-transform duration-200 hover:scale-[1.02] hover:border-gray-300 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-800">
                      {label}
                      <span className="ml-2 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                        {humanizeLabel(String(session?.status || '-'))}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      Drafts: <span className="font-medium text-gray-700">{counts.drafts ?? 0}</span> · Confirmed:{' '}
                      <span className="font-medium text-gray-700">{counts.confirmed ?? 0}</span> · Dismissed:{' '}
                      <span className="font-medium text-gray-700">{counts.dismissed ?? 0}</span>
                    </div>
                  </div>

                  <div className="flex w-full gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => onReopen(session.id)}
                      className="inline-flex min-h-[38px] flex-1 items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 sm:flex-none"
                    >
                      Reopen
                    </button>
                    <a
                      href={exportUrl}
                      className="inline-flex min-h-[38px] flex-1 items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 sm:flex-none"
                    >
                      Export CSV
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
