'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { InspectionFinding, InspectionResolutionMethod } from '@/types';
import { Button } from '@/components/ui/button';
import {
  EmptyStateCard,
  MobileCard,
  MobileFilterSurface,
  MobilePageContainer,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import DetailTemplate from '../../components/route-templates/DetailTemplate';

const SEVERITY_CHIP: Record<string, 'danger' | 'elevated' | 'info' | 'good'> = {
  SAFETY: 'danger', MAJOR: 'elevated', MINOR: 'info', MONITOR: 'info', INFORMATIONAL: 'good',
};

const SYSTEM_LABELS: Record<string, string> = {
  ROOF: 'Roof', EXTERIOR: 'Exterior', FOUNDATION: 'Foundation',
  BASEMENT_CRAWLSPACE: 'Basement', STRUCTURAL: 'Structural',
  ELECTRICAL: 'Electrical', PLUMBING: 'Plumbing', HVAC: 'HVAC',
  INTERIOR: 'Interior', ATTIC_INSULATION: 'Attic', APPLIANCES: 'Appliances',
  GARAGE: 'Garage', SITE_GRADING: 'Site',
};

const RESOLUTION_METHODS: { value: InspectionResolutionMethod; label: string }[] = [
  { value: 'CONTRACTOR_WORK', label: 'Contractor Work' },
  { value: 'DIY', label: 'DIY Repair' },
  { value: 'SELLER_REPAIR', label: 'Seller Repair' },
  { value: 'CREDITED_AT_CLOSING', label: 'Credited at Closing' },
  { value: 'DISMISSED', label: 'Dismissed / Not Applicable' },
];

function fmtCost(low?: number | null, high?: number | null) {
  if (!low && !high) return null;
  const fmt = (c: number) => '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (low && high) return `${fmt(low)} – ${fmt(high)}`;
  return fmt((low ?? high)!);
}

// ── Resolve Dialog ────────────────────────────────────────────────────────────

function ResolveDialog({
  finding,
  propertyId,
  onResolved,
  onClose,
}: {
  finding: InspectionFinding;
  propertyId: string;
  onResolved: () => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<InspectionResolutionMethod>('CONTRACTOR_WORK');
  const [notes, setNotes] = useState('');
  const [costDollars, setCostDollars] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.resolveInspectionFinding(propertyId, finding.id, {
        resolutionMethod: method,
        resolutionNotes: notes || undefined,
        resolutionCostCents: costDollars ? Math.round(parseFloat(costDollars) * 100) : undefined,
      });
      onResolved();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to resolve finding');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 space-y-4 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">Mark as Resolved</h3>
        <p className="text-sm text-slate-600 line-clamp-2">{finding.aiInterpretation}</p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">How was this resolved?</label>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as InspectionResolutionMethod)}
          >
            {RESOLUTION_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none"
            rows={2}
            placeholder="Contractor name, date of work, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Cost paid ($, optional)</label>
          <input
            type="number"
            min="0"
            placeholder="0"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={costDollars}
            onChange={(e) => setCostDollars(e.target.value)}
          />
        </div>

        {error && <p className="text-xs text-rose-700">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button className="flex-1" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Mark Resolved'}</Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const SEVERITY_FILTERS = ['ALL', 'SAFETY', 'MAJOR', 'MINOR', 'MONITOR'];
const SYSTEM_FILTERS = ['ALL', ...Object.keys(SYSTEM_LABELS)];

export default function OpenItemsPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [findings, setFindings] = useState<InspectionFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [systemFilter, setSystemFilter] = useState('ALL');
  const [resolvingFinding, setResolvingFinding] = useState<InspectionFinding | null>(null);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listInspectionOpenItems(propertyId, {
        severity: severityFilter !== 'ALL' ? severityFilter : undefined,
        homeSystem: systemFilter !== 'ALL' ? systemFilter : undefined,
        limit: 100,
      });
      setFindings(res.findings);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load open items');
    } finally {
      setLoading(false);
    }
  }, [propertyId, severityFilter, systemFilter]);

  useEffect(() => { load(); }, [load]);

  const safetyFindings = findings.filter((f) => f.severity === 'SAFETY');
  const otherFindings = findings.filter((f) => f.severity !== 'SAFETY');

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-3xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/inspection-hub`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Inspection Hub
        </Link>
      </Button>

      <DetailTemplate
        title="Open Items"
        subtitle="All unresolved findings across every inspection report for this property."
      >
        <MobileFilterSurface>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Severity</label>
              <select
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                {SEVERITY_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">System</label>
              <select
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                value={systemFilter}
                onChange={(e) => setSystemFilter(e.target.value)}
              >
                {SYSTEM_FILTERS.map((s) => (
                  <option key={s} value={s}>{s === 'ALL' ? 'All Systems' : SYSTEM_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="info">{findings.length} open items</StatusChip>
            {safetyFindings.length > 0 && (
              <StatusChip tone="danger">{safetyFindings.length} Safety</StatusChip>
            )}
          </div>
        </MobileFilterSurface>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
        )}

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-slate-600" />
          </div>
        ) : findings.length === 0 ? (
          <EmptyStateCard
            title="No open items"
            description="All findings have been resolved or no confirmed reports exist yet."
          />
        ) : (
          <div className="space-y-3">
            {[...safetyFindings, ...otherFindings].map((finding) => {
              const cost = fmtCost(finding.estimatedCostCentsLow, finding.estimatedCostCentsHigh);
              return (
                <MobileCard key={finding.id} variant="compact" className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <StatusChip tone={SEVERITY_CHIP[finding.severity] ?? 'info'}>
                        {finding.severity}
                      </StatusChip>
                      <span className="text-xs text-slate-500">{SYSTEM_LABELS[finding.homeSystem] ?? finding.homeSystem}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[32px] text-xs flex-shrink-0"
                      onClick={() => setResolvingFinding(finding)}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Resolve
                    </Button>
                  </div>

                  {finding.subsystem && (
                    <p className="text-xs font-medium text-slate-700">{finding.subsystem}</p>
                  )}
                  <p className="text-sm text-slate-800">{finding.aiInterpretation}</p>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {cost && <span>{cost}</span>}
                    {finding.report && (
                      <Link
                        href={`/dashboard/properties/${propertyId}/inspection-hub/${finding.reportId}`}
                        className="text-blue-600 underline"
                      >
                        {finding.report.reportType?.replace('_', ' ')} report
                      </Link>
                    )}
                  </div>
                </MobileCard>
              );
            })}
          </div>
        )}
      </DetailTemplate>

      {resolvingFinding && (
        <ResolveDialog
          finding={resolvingFinding}
          propertyId={propertyId}
          onResolved={() => {
            setResolvingFinding(null);
            load();
          }}
          onClose={() => setResolvingFinding(null)}
        />
      )}
    </MobilePageContainer>
  );
}
