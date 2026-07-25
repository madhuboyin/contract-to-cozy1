'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Edit2, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import type {
  InspectionFinding,
  InspectionFindingSeverity,
  InspectionReportSummary,
  InspectionWriteBackPreview,
} from '@/types';
import { Button } from '@/components/ui/button';
import {
  MobileCard,
  MobilePageContainer,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import DetailTemplate from '../../components/route-templates/DetailTemplate';
import { CapabilityDiscoveryAnchor } from '@/features/tools/CapabilityDiscoveryAnchor';

const SEVERITY_STYLES: Record<InspectionFindingSeverity, { chip: 'danger' | 'elevated' | 'info' | 'good'; label: string; border: string }> = {
  SAFETY:        { chip: 'danger',   label: 'Safety',        border: 'border-rose-200 bg-rose-50' },
  MAJOR:         { chip: 'elevated', label: 'Major',         border: 'border-orange-200 bg-orange-50' },
  MINOR:         { chip: 'info',     label: 'Minor',         border: 'border-amber-200 bg-amber-50' },
  MONITOR:       { chip: 'info',     label: 'Monitor',       border: 'border-blue-100 bg-blue-50' },
  INFORMATIONAL: { chip: 'good',     label: 'Informational', border: 'border-slate-100 bg-slate-50' },
};

const CONDITION_LABELS: Record<string, string> = {
  GOOD: 'Good', FAIR: 'Fair', POOR: 'Poor', SAFETY_CONCERN: 'Safety Concern',
};

const SYSTEM_LABELS: Record<string, string> = {
  ROOF: 'Roof', EXTERIOR: 'Exterior', FOUNDATION: 'Foundation',
  BASEMENT_CRAWLSPACE: 'Basement / Crawlspace', STRUCTURAL: 'Structural',
  ELECTRICAL: 'Electrical', PLUMBING: 'Plumbing', HVAC: 'HVAC',
  INTERIOR: 'Interior', ATTIC_INSULATION: 'Attic / Insulation',
  APPLIANCES: 'Appliances', GARAGE: 'Garage', SITE_GRADING: 'Site / Grading',
};

const SEVERITY_ORDER: InspectionFindingSeverity[] = ['SAFETY', 'MAJOR', 'MINOR', 'MONITOR', 'INFORMATIONAL'];

function fmtCost(low?: number | null, high?: number | null) {
  if (!low && !high) return null;
  const fmt = (c: number) => '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (low && high) return `${fmt(low)} – ${fmt(high)}`;
  return fmt((low ?? high)!);
}

function fmtDate(dt?: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  GENERAL: 'General', ROOF: 'Roof', HVAC: 'HVAC', SEWER: 'Sewer Scope',
  ELECTRICAL: 'Electrical', FOUNDATION: 'Foundation', PRE_PURCHASE: 'Pre-Purchase',
  PRE_LISTING: 'Pre-Listing', ANNUAL: 'Annual', OTHER: 'Other',
};

// ── Finding Card ──────────────────────────────────────────────────────────────

function FindingCard({
  finding,
  editable,
  onDismiss,
  onEdit,
}: {
  finding: InspectionFinding;
  editable: boolean;
  onDismiss: (id: string) => void;
  onEdit: (finding: InspectionFinding) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.MINOR;
  const cost = fmtCost(finding.estimatedCostCentsLow, finding.estimatedCostCentsHigh);

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${style.border} ${finding.status === 'DISMISSED' ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <StatusChip tone={style.chip}>{style.label}</StatusChip>
          {finding.extractionConfidence === 'LOW' && (
            <StatusChip tone="elevated">Low Confidence — Review</StatusChip>
          )}
          <span className="text-xs text-slate-500">{CONDITION_LABELS[finding.conditionRating]}</span>
        </div>
        {editable && finding.status !== 'DISMISSED' && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(finding)}
              className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 transition-colors"
              title="Edit"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDismiss(finding.id)}
              className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600 transition-colors"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {(finding.subsystem || finding.location) && (
        <p className="text-xs font-medium text-slate-700">
          {[finding.subsystem, finding.location].filter(Boolean).join(' · ')}
        </p>
      )}

      <p className="text-sm text-slate-800">{finding.aiInterpretation}</p>

      {cost && <p className="text-xs font-medium text-slate-600">Estimated: {cost}</p>}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide' : 'Show'} inspector note
      </button>

      {expanded && (
        <p className="text-xs text-slate-600 italic border-l-2 border-slate-300 pl-2">
          {finding.inspectorDescription}
        </p>
      )}
    </div>
  );
}

// ── Edit Sheet ────────────────────────────────────────────────────────────────

function EditSheet({
  finding,
  onSave,
  onClose,
}: {
  finding: InspectionFinding;
  onSave: (id: string, patch: Partial<InspectionFinding>) => Promise<void>;
  onClose: () => void;
}) {
  const [severity, setSeverity] = useState(finding.severity);
  const [homeSystem, setHomeSystem] = useState(finding.homeSystem);
  const [aiInterpretation, setAiInterpretation] = useState(finding.aiInterpretation);
  const [costLow, setCostLow] = useState(finding.estimatedCostCentsLow ? String(finding.estimatedCostCentsLow / 100) : '');
  const [costHigh, setCostHigh] = useState(finding.estimatedCostCentsHigh ? String(finding.estimatedCostCentsHigh / 100) : '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(finding.id, {
      severity,
      homeSystem,
      aiInterpretation,
      estimatedCostCentsLow: costLow ? Math.round(parseFloat(costLow) * 100) : undefined,
      estimatedCostCentsHigh: costHigh ? Math.round(parseFloat(costHigh) * 100) : undefined,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 space-y-4 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">Edit Finding</h3>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Severity</label>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value as any)}>
            {(['SAFETY','MAJOR','MINOR','MONITOR','INFORMATIONAL'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Home System</label>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={homeSystem} onChange={(e) => setHomeSystem(e.target.value as any)}>
            {Object.entries(SYSTEM_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">AI Interpretation</label>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none"
            rows={3}
            value={aiInterpretation}
            onChange={(e) => setAiInterpretation(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Est. cost low ($)</label>
            <input type="number" min="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={costLow} onChange={(e) => setCostLow(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Est. cost high ($)</label>
            <input type="number" min="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={costHigh} onChange={(e) => setCostHigh(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button className="flex-1" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReportDetailPage() {
  const params = useParams<{ id: string; reportId: string }>();
  const { id: propertyId, reportId } = params;

  const [report, setReport] = useState<InspectionReportSummary | null>(null);
  const [grouped, setGrouped] = useState<Record<string, InspectionFinding[]>>({});
  const [preview, setPreview] = useState<InspectionWriteBackPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingFinding, setEditingFinding] = useState<InspectionFinding | null>(null);

  const load = useCallback(async () => {
    if (!propertyId || !reportId) return;
    try {
      const [r, g] = await Promise.all([
        api.getInspectionReport(propertyId, reportId),
        api.listInspectionFindings(propertyId, reportId, true) as Promise<Record<string, InspectionFinding[]>>,
      ]);
      setReport(r);
      setGrouped(g as Record<string, InspectionFinding[]>);
      if (r.status === 'REVIEW_PENDING') {
        const p = await api.getInspectionWriteBackPreview(propertyId, reportId).catch(() => null);
        setPreview(p);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [propertyId, reportId]);

  useEffect(() => { load(); }, [load]);

  // Poll while PROCESSING
  useEffect(() => {
    if (report?.status !== 'PROCESSING') return;
    const id = window.setInterval(load, 4000);
    return () => window.clearInterval(id);
  }, [report?.status, load]);

  async function handleDismiss(findingId: string) {
    try {
      await api.dismissInspectionFinding(propertyId, reportId, findingId);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to dismiss finding');
    }
  }

  async function handleEdit(findingId: string, patch: Partial<InspectionFinding>) {
    await api.updateInspectionFinding(propertyId, reportId, findingId, patch as any);
    await load();
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      await api.confirmInspectionReport(propertyId, reportId);
      setConfirmed(true);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to confirm report');
    } finally {
      setConfirming(false);
    }
  }

  const allSystems = Object.keys(grouped).sort((a, b) => SYSTEM_LABELS[a]?.localeCompare(SYSTEM_LABELS[b] ?? '') ?? 0);
  const hasSafetyFindings = allSystems.some((s) => grouped[s]?.some((f) => f.severity === 'SAFETY' && f.status === 'OPEN'));
  const isEditable = report?.status === 'REVIEW_PENDING';

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-3xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/inspection-hub`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Inspection Hub
        </Link>
      </Button>

      <DetailTemplate
        title={report ? `${REPORT_TYPE_LABELS[report.reportType] ?? report.reportType} Inspection` : 'Inspection Report'}
        subtitle={report ? `Inspected ${fmtDate(report.inspectionDate)}${report.inspectorName ? ` · ${report.inspectorName}` : ''}` : 'Loading…'}
      >
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
        )}

        {/* Processing state */}
        {report?.status === 'PROCESSING' && (
          <MobileCard className="text-center py-8 space-y-3">
            <div className="flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
            </div>
            <p className="text-sm font-medium text-slate-700">Extracting findings from your report…</p>
            <p className="text-xs text-slate-500">This takes under 90 seconds. The page will update automatically.</p>
          </MobileCard>
        )}

        {/* Confirmed success banner */}
        {(confirmed || report?.status === 'CONFIRMED') && (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Report confirmed — findings have been applied to your property records.
            </div>
            <CapabilityDiscoveryAnchor
              anchor="INSPECTION_RESULT"
              propertyId={propertyId}
              entityId={reportId}
            />
          </>
        )}

        {/* Safety warning banner */}
        {isEditable && hasSafetyFindings && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>This report contains safety findings. Review and acknowledge each one before confirming.</span>
          </div>
        )}

        {/* Write-back preview */}
        {isEditable && preview && (
          <MobileCard className="space-y-3 border-blue-100 bg-blue-50">
            <p className="text-sm font-semibold text-blue-900">What confirming will do</p>
            <ul className="space-y-1 text-xs text-blue-800">
              <li>· Update {preview.digitalTwinUpdates} Digital Twin condition score{preview.digitalTwinUpdates !== 1 ? 's' : ''}</li>
              <li>· Create {preview.permitFlagsToCreate} permit flag{preview.permitFlagsToCreate !== 1 ? 's' : ''} in Permit Tracker</li>
              <li>· Flag {preview.coverageGapsToFlag} potential coverage gap{preview.coverageGapsToFlag !== 1 ? 's' : ''}</li>
            </ul>
            <Button
              className="w-full min-h-[44px]"
              disabled={confirming}
              onClick={handleConfirm}
            >
              {confirming ? 'Applying…' : `Confirm and Apply ${preview.findingCount} findings`}
            </Button>
          </MobileCard>
        )}

        {/* Findings grouped by system */}
        {loading && !report ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-slate-600" />
          </div>
        ) : (
          <div className="space-y-5">
            {allSystems.map((system) => {
              const findings = (grouped[system] ?? []).sort(
                (a, b) =>
                  SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
              );
              if (findings.length === 0) return null;
              return (
                <section key={system} className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    {SYSTEM_LABELS[system] ?? system}
                    <span className="text-xs font-normal text-slate-400">
                      {findings.filter((f) => f.status === 'OPEN').length} open
                    </span>
                  </h3>
                  {findings.map((f) => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      editable={isEditable}
                      onDismiss={handleDismiss}
                      onEdit={setEditingFinding}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </DetailTemplate>

      {editingFinding && (
        <EditSheet
          finding={editingFinding}
          onSave={handleEdit}
          onClose={() => setEditingFinding(null)}
        />
      )}
    </MobilePageContainer>
  );
}
