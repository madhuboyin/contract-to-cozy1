'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Loader2, AlertTriangle, Shield } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { PermitFlagItem, PermitUnpermittedFlagStatus, PermitDisclosureRisk, UpdateFlagPayload } from '@/types';
import UnpermittedFlagCard from '@/components/features/permits/UnpermittedFlagCard';

type StatusFilter = 'open' | 'resolved' | 'all';
type RiskFilter = PermitDisclosureRisk | 'all';

const OPEN_STATUSES: PermitUnpermittedFlagStatus[] = ['FLAGGED', 'INVESTIGATING'];
const RESOLVED_STATUSES: PermitUnpermittedFlagStatus[] = ['CONFIRMED_PERMITTED', 'CONFIRMED_UNPERMITTED', 'WILL_REMEDIATE', 'REMEDIATED', 'DISMISSED'];

export default function FlagsPage() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('propertyId') ?? '';

  const [flags, setFlags] = useState<PermitFlagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [scanResult, setScanResult] = useState<{ flagsCreated: number } | null>(null);

  const load = useCallback(async () => {
    if (!propertyId) return;
    const result = await api.listPermitFlags(propertyId, { limit: 100 }).catch(() => ({ items: [] as PermitFlagItem[] }));
    setFlags(result.items);
  }, [propertyId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleFlagUpdate(flagId: string, patch: UpdateFlagPayload) {
    const updated = await api.updatePermitFlag(propertyId, flagId, patch);
    setFlags((prev) => prev.map((f) => f.id === flagId ? updated : f));
  }

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await api.runPermitDetectionScan(propertyId);
      setScanResult(result);
      await load();
    } finally {
      setScanning(false);
    }
  }

  const filtered = flags.filter((f) => {
    const matchStatus =
      statusFilter === 'all' ? true
      : statusFilter === 'open' ? OPEN_STATUSES.includes(f.status)
      : RESOLVED_STATUSES.includes(f.status);
    const matchRisk = riskFilter === 'all' ? true : f.disclosureRisk === riskFilter;
    return matchStatus && matchRisk;
  });

  return (
    <div className="space-y-5 p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href={`/dashboard/permits?propertyId=${propertyId}`} className="flex items-center gap-1 text-sm text-[hsl(var(--mobile-text-secondary))]">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50"
        >
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Re-run Detection
        </button>
      </div>

      <div>
        <h1 className="text-xl font-bold">Unpermitted Work Flags</h1>
        <p className="text-sm text-[hsl(var(--mobile-text-secondary))] mt-0.5">
          Review potential gaps in your permit coverage
        </p>
      </div>

      {scanResult && (
        <div className={`rounded-2xl border p-3 text-sm ${scanResult.flagsCreated > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {scanResult.flagsCreated > 0
            ? `${scanResult.flagsCreated} new flag${scanResult.flagsCreated !== 1 ? 's' : ''} detected.`
            : 'No new flags detected.'}
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {(['open', 'resolved', 'all'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
              statusFilter === s
                ? 'bg-[hsl(var(--mobile-brand-strong))] text-white'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {s === 'open' ? 'Open' : s === 'resolved' ? 'Resolved' : 'All'}
          </button>
        ))}
        <span className="shrink-0 self-center text-neutral-300">|</span>
        {(['all', 'HIGH', 'MEDIUM', 'LOW'] as RiskFilter[]).map((r) => (
          <button
            key={r}
            onClick={() => setRiskFilter(r)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              riskFilter === r
                ? 'bg-[hsl(var(--mobile-brand-strong))] text-white'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {r === 'all' ? 'All Risks' : r}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Shield className="h-10 w-10 text-neutral-300" />
          <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
            {statusFilter === 'open' ? 'No open flags.' : 'No flags in this filter.'}
          </p>
          {statusFilter === 'open' && flags.length === 0 && (
            <p className="text-xs text-[hsl(var(--mobile-text-muted))]">
              Run the detection scan to check for potential gaps.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((flag) => (
            <UnpermittedFlagCard
              key={flag.id}
              flag={flag}
              onUpdate={(patch) => handleFlagUpdate(flag.id, patch)}
            />
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
        <p className="text-xs text-[hsl(var(--mobile-text-muted))] flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
          Flags indicate potential gaps detected by cross-referencing your assets and permits.
          They are not definitive — investigate each one and update the status when resolved.
        </p>
      </div>
    </div>
  );
}
