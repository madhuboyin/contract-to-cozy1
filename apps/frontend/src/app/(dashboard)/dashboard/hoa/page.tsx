'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, FileSearch } from 'lucide-react';
import { api } from '@/lib/api/client';
import type {
  HoaAssociation,
  HoaApprovalRecord,
  HoaViolationSummary,
  UpsertHoaAssociationPayload,
  CreateHoaApprovalRecordPayload,
  UpdateHoaApprovalRecordPayload,
} from '@/types';
import HoaAssociationCard from '@/components/features/hoa/HoaAssociationCard';
import ApprovalRecordList from '@/components/features/hoa/ApprovalRecordList';
import ReportViolationModal from '@/components/features/hoa/ReportViolationModal';
import ViolationHistoryList from '@/components/features/hoa/ViolationHistoryList';
import { track } from '@/lib/analytics/events';
import { complianceLaunchLineage } from '@/features/tools/complianceLaunchContext';

export default function HoaCompliancePage() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('propertyId') ?? '';
  const launchLineage = complianceLaunchLineage(searchParams);

  const [association, setAssociation] = useState<HoaAssociation | null>(null);
  const [records, setRecords] = useState<HoaApprovalRecord[]>([]);
  const [violations, setViolations] = useState<HoaViolationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportingViolation, setReportingViolation] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) return;
    const [a, r, v] = await Promise.all([
      api.getHoaAssociation(propertyId).catch(() => null),
      api.listHoaApprovalRecords(propertyId).catch(() => []),
      api.listHoaViolations(propertyId).catch(() => []),
    ]);
    setAssociation(a);
    setRecords(r);
    setViolations(v);
  }, [propertyId]);

  const refreshViolations = useCallback(async () => {
    const v = await api.listHoaViolations(propertyId).catch(() => []);
    setViolations(v);
  }, [propertyId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'hoa', propertyId, entryPoint: 'direct' });
  }, [propertyId]);

  async function handleSaveAssociation(payload: UpsertHoaAssociationPayload) {
    const updated = await api.upsertHoaAssociation(propertyId, payload);
    setAssociation(updated);
  }

  async function handleAddRecord(payload: CreateHoaApprovalRecordPayload) {
    const record = await api.createHoaApprovalRecord(propertyId, {
      ...payload,
      ...launchLineage,
    });
    setRecords((prev) => [record, ...prev]);
    track('action_completed', { tool: 'hoa', actionType: 'add_approval_record', propertyId });
  }

  async function handleUpdateRecord(recordId: string, patch: UpdateHoaApprovalRecordPayload) {
    const updated = await api.updateHoaApprovalRecord(propertyId, recordId, patch);
    setRecords((prev) => prev.map((r) => (r.id === recordId ? updated : r)));
  }

  async function handleDeleteRecord(recordId: string) {
    await api.deleteHoaApprovalRecord(propertyId, recordId);
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
  }

  if (!propertyId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-4 text-center">
        <FileSearch className="h-10 w-10 text-neutral-300" />
        <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">Select a property to view HOA compliance.</p>
        <Link href="/dashboard/properties" className="text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
          Go to Properties →
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pb-24">
      <div>
        <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Home Tool</p>
        <h1 className="text-xl font-bold">HOA Compliance</h1>
        <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
          Track association approvals and violations before they turn into fines
        </p>
        <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
          Record-tracking only. Verify approval requirements with your association.
        </p>
      </div>

      <HoaAssociationCard association={association} onSave={handleSaveAssociation} />

      {association && (
        <>
          <button
            onClick={() => setReportingViolation(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left"
          >
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Report an HOA Violation</p>
              <p className="text-xs text-amber-600 mt-0.5">Got a notice? Log it here to get next-step guidance.</p>
            </div>
          </button>

          <section>
            <p className="mb-2 text-sm font-semibold">Approvals</p>
            {records.length === 0 ? (
              <p className="mb-2 text-xs text-[hsl(var(--mobile-text-muted))]">
                Planning a fence, deck, addition, or exterior change? Track HOA approval for it here.
              </p>
            ) : null}
            <ApprovalRecordList
              propertyId={propertyId}
              records={records}
              onUpdate={handleUpdateRecord}
              onAdd={handleAddRecord}
              onDelete={handleDeleteRecord}
            />
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold">Violation History</p>
            <ViolationHistoryList violations={violations} propertyId={propertyId} />
          </section>
        </>
      )}

      <ReportViolationModal
        open={reportingViolation}
        onClose={() => setReportingViolation(false)}
        onReported={() => {
          refreshViolations();
          track('action_completed', { tool: 'hoa', actionType: 'report_violation', propertyId });
        }}
        propertyId={propertyId}
      />
    </div>
  );
}
