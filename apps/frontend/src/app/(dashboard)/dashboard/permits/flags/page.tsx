'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Loader2, AlertTriangle, Shield, Plus } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { PermitFlagItem, PermitUnpermittedFlagStatus, PermitDisclosureRisk, PermitWorkType, UpdateFlagPayload } from '@/types';
import UnpermittedFlagCard from '@/components/features/permits/UnpermittedFlagCard';
import { WORK_TYPE_LABELS } from '@/components/features/permits/PermitUtils';

type StatusFilter = 'open' | 'resolved' | 'all';
type RiskFilter = PermitDisclosureRisk | 'all';

const OPEN_STATUSES: PermitUnpermittedFlagStatus[] = ['UNKNOWN', 'FLAGGED', 'INVESTIGATING', 'CONFIRMED_UNPERMITTED', 'WILL_REMEDIATE'];
const RESOLVED_STATUSES: PermitUnpermittedFlagStatus[] = ['CONFIRMED_PERMITTED', 'REMEDIATED', 'DISMISSED'];

export default function FlagsPage() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('propertyId') ?? '';
  // Deep-link support (Sale Case PERMIT_UNPERMITTED_FLAG cross-link) — no
  // per-flag detail page exists, so "deep link" here means scroll-into-view
  // + highlight, same pattern as inspection-hub/open-items' findingId.
  const deepLinkedFlagId = searchParams.get('flagId');
  const scrolledToDeepLinkRef = useRef(false);

  const [flags, setFlags] = useState<PermitFlagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [scanResult, setScanResult] = useState<{ flagsCreated: number } | null>(null);
  const [showIntake, setShowIntake] = useState(false);
  const [creating, setCreating] = useState(false);
  const [intake, setIntake] = useState({
    workType: 'OTHER' as PermitWorkType,
    disclosureRisk: 'MEDIUM' as PermitDisclosureRisk,
    workOrigin: 'PRIOR_OWNER' as 'CURRENT_OWNER' | 'PRIOR_OWNER' | 'UNKNOWN',
    workStage: 'COMPLETED' as 'ALREADY_STARTED' | 'COMPLETED' | 'UNKNOWN',
    workStartedAt: '',
    workCompletedAt: '',
    flagReason: '',
  });

  const load = useCallback(async () => {
    if (!propertyId) return;
    const result = await api.listPermitFlags(propertyId, { limit: 100 }).catch(() => ({ items: [] as PermitFlagItem[] }));
    setFlags(result.items);
  }, [propertyId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!deepLinkedFlagId || scrolledToDeepLinkRef.current || loading) return;
    const el = document.getElementById(`flag-${deepLinkedFlagId}`);
    if (!el) return;
    scrolledToDeepLinkRef.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [deepLinkedFlagId, loading, flags]);

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

  async function createHistoricalIntake(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      await api.createManualFlag(propertyId, {
        workType: intake.workType,
        disclosureRisk: intake.disclosureRisk,
        workOrigin: intake.workOrigin,
        workStage: intake.workStage,
        workStartedAt: intake.workStartedAt || undefined,
        workCompletedAt: intake.workCompletedAt || undefined,
        flagReason: intake.flagReason.trim() || undefined,
        recordSearchOutcome: 'NOT_SEARCHED',
        evidenceDocumentIds: [],
        researchChannel: 'NONE',
      });
      setShowIntake(false);
      await load();
    } finally {
      setCreating(false);
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
      <div className="flex items-center justify-between gap-2">
        <Link href={`/dashboard/permits?propertyId=${propertyId}`} className="flex items-center gap-1 text-sm text-[hsl(var(--mobile-text-secondary))]">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="flex gap-2">
          <button onClick={() => setShowIntake((value) => !value)} className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700">
            <Plus className="h-3.5 w-3.5" /> Add prior work
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Search records
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-xl font-bold">Historical Permit Research</h1>
        <p className="text-sm text-[hsl(var(--mobile-text-secondary))] mt-0.5">
          Research already-started, completed, and prior-owner work without assuming noncompliance
        </p>
      </div>

      {showIntake && (
        <form onSubmit={createHistoricalIntake} className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div>
            <p className="text-sm font-semibold text-blue-950">Add existing or inherited work</p>
            <p className="mt-1 text-xs text-blue-800">This creates a historical research finding only. It does not create an active Project or label the work illegal.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-medium">Work type<select value={intake.workType} onChange={(event) => setIntake((value) => ({ ...value, workType: event.target.value as PermitWorkType }))} className="h-10 w-full rounded-lg border bg-white px-2 text-xs">{Object.entries(WORK_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1 text-xs font-medium">Disclosure priority<select value={intake.disclosureRisk} onChange={(event) => setIntake((value) => ({ ...value, disclosureRisk: event.target.value as PermitDisclosureRisk }))} className="h-10 w-full rounded-lg border bg-white px-2 text-xs"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label>
            <label className="space-y-1 text-xs font-medium">Who initiated it?<select value={intake.workOrigin} onChange={(event) => setIntake((value) => ({ ...value, workOrigin: event.target.value as typeof intake.workOrigin }))} className="h-10 w-full rounded-lg border bg-white px-2 text-xs"><option value="CURRENT_OWNER">Current owner</option><option value="PRIOR_OWNER">Prior owner</option><option value="UNKNOWN">Unknown</option></select></label>
            <label className="space-y-1 text-xs font-medium">Stage when recorded<select value={intake.workStage} onChange={(event) => setIntake((value) => ({ ...value, workStage: event.target.value as typeof intake.workStage }))} className="h-10 w-full rounded-lg border bg-white px-2 text-xs"><option value="ALREADY_STARTED">Already started</option><option value="COMPLETED">Completed</option><option value="UNKNOWN">Unknown</option></select></label>
            <label className="space-y-1 text-xs font-medium">Started<input type="date" value={intake.workStartedAt} onChange={(event) => setIntake((value) => ({ ...value, workStartedAt: event.target.value }))} className="h-10 w-full rounded-lg border px-2 text-xs" /></label>
            <label className="space-y-1 text-xs font-medium">Completed<input type="date" value={intake.workCompletedAt} onChange={(event) => setIntake((value) => ({ ...value, workCompletedAt: event.target.value }))} className="h-10 w-full rounded-lg border px-2 text-xs" /></label>
          </div>
          <label className="block space-y-1 text-xs font-medium">What is known?<textarea value={intake.flagReason} onChange={(event) => setIntake((value) => ({ ...value, flagReason: event.target.value }))} rows={2} placeholder="Closing disclosure, visible addition, inherited equipment, work already underway…" className="w-full rounded-lg border px-3 py-2 text-xs" /></label>
          <button disabled={creating} className="rounded-xl bg-blue-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{creating ? 'Creating…' : 'Create research finding'}</button>
        </form>
      )}

      {scanResult && (
        <div className={`rounded-2xl border p-3 text-sm ${scanResult.flagsCreated > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {scanResult.flagsCreated > 0
            ? `${scanResult.flagsCreated} new research finding${scanResult.flagsCreated !== 1 ? 's' : ''} created.`
            : 'No new unmatched work was found in the records currently available.'}
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
            <div key={flag.id} id={`flag-${flag.id}`}>
              <UnpermittedFlagCard
                propertyId={propertyId}
                flag={flag}
                highlighted={flag.id === deepLinkedFlagId}
                onUpdate={(patch) => handleFlagUpdate(flag.id, patch)}
                onCreateRemediationCase={async () => {
                  await api.createPermitFlagRemediationCase(propertyId, flag.id);
                  await load();
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
        <p className="text-xs text-[hsl(var(--mobile-text-muted))] flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
          “Not found in available records” describes a search result, not a legal conclusion.
          Only documented professional or municipal outcomes should receive a definitive disposition.
        </p>
      </div>
    </div>
  );
}
