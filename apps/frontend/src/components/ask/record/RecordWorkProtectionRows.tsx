import type { AskRecordIncidentClaimRow, AskRecordPermitRow, AskRecordPolicyRow, AskRecordProjectRow } from '@/features/ask/types';
import { AskCompactRow } from '../presentation/AskLayoutPrimitives';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const when = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : null);

// These sections have no per-record Ask read reachable from a link yet, so a row carries no action; the index opens the Ask answer.
export function RecordPermitRow({ permit }: { permit: AskRecordPermitRow }) {
  const facts = [
    `Official: ${permit.officialStatusLabel}`,
    permit.reportedStatusLabel ? `Reported by the household: ${permit.reportedStatusLabel}` : null,
    when(permit.issueDate) ? `Issued ${when(permit.issueDate)}` : null,
    when(permit.finaledDate) ? `Finaled ${when(permit.finaledDate)}` : null,
    when(permit.expirationDate) ? `Expires ${when(permit.expirationDate)}` : null,
    permit.contractorName ? `Contractor: ${permit.contractorName}` : null,
    permit.verified ? 'Verified record' : null,
  ].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={permit.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{permit.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        {permit.description && <p className="mt-1 text-xs text-slate-600">{permit.description}</p>}
        {permit.hasOpenInspections && <p className="mt-1 text-xs font-semibold text-amber-800">Has open inspections</p>}
      </div>
    </AskCompactRow>
  );
}

export function RecordProjectRow({ project }: { project: AskRecordProjectRow }) {
  const isCase = project.kind === 'RENOVATION_CASE';
  const finished = project.status === 'COMPLETED' || project.status === 'VERIFIED_COMPLETE';
  const facts = isCase
    ? [
      'Renovation case',
      project.typeLabel,
      project.contractLabel ? `Target budget ${project.contractLabel}` : 'Target budget not set',
      !finished && when(project.expectedEndDate) ? `Target finish ${when(project.expectedEndDate)}` : null,
    ].filter(Boolean)
    : [
      project.typeLabel,
      project.providerLabel ?? 'Provider not recorded',
      project.contractLabel ? `Contract ${project.contractLabel}` : 'Contract amount not set',
      `Paid ${project.paidLabel ?? '$0'}`,
      project.remainingLabel ? `Remaining ${project.remainingLabel}` : null,
      project.status !== 'COMPLETED' && when(project.expectedEndDate) ? `Due ${when(project.expectedEndDate)}` : null,
      project.status === 'COMPLETED' && when(project.warrantyExpiresAt) ? `Warranty expires ${when(project.warrantyExpiresAt)}` : null,
    ].filter(Boolean);
  const issues = project.issueCount ?? 0;
  const caution = project.status === 'DISPUTED' || issues > 0;
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={project.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{project.name}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        <p className={`mt-1 text-xs font-semibold ${caution ? 'text-amber-800' : 'text-slate-700'}`}>
          {[project.statusLabel, project.milestoneCount == null ? null : `${project.milestoneCount} ${project.milestoneCount === 1 ? 'milestone' : 'milestones'}`, issues ? `${issues} ${issues === 1 ? 'issue' : 'issues'}` : null].filter(Boolean).join(' · ')}
        </p>
      </div>
    </AskCompactRow>
  );
}

export function RecordIncidentClaimRow({ record }: { record: AskRecordIncidentClaimRow }) {
  const facts = [
    record.kind === 'INCIDENT' ? 'Incident' : 'Claim',
    record.statusLabel.charAt(0).toUpperCase() + record.statusLabel.slice(1),
    record.detailLabel,
    record.providerName,
    when(record.openedAt) ? `Opened ${when(record.openedAt)}` : null,
    when(record.closedAt) ? `Closed ${when(record.closedAt)}` : null,
  ].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={record.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{record.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        {record.summary && <p className="mt-1 text-xs text-slate-600">{record.summary}</p>}
      </div>
    </AskCompactRow>
  );
}

export function RecordPolicyRow({ policy }: { policy: AskRecordPolicyRow }) {
  const facts = [
    policy.coverageType,
    policy.status === 'NEEDS_REVIEW' ? 'Dates need review' : policy.status === 'STARTS_LATER' ? `Starts ${when(policy.startDate) ?? 'later'}` : null,
    policy.status === 'ACTIVE' && when(policy.expiryDate) ? `Active until ${when(policy.expiryDate)}` : null,
    policy.status === 'EXPIRED' && when(policy.expiryDate) ? `Expired ${when(policy.expiryDate)}` : null,
    policy.status === 'STARTS_LATER' && when(policy.expiryDate) ? `Expires ${when(policy.expiryDate)}` : null,
    policy.verified ? `Verified${when(policy.lastVerifiedAt) ? ` ${when(policy.lastVerifiedAt)}` : ''}` : 'Not verified',
  ].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={policy.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{policy.carrierName}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        <p className={`mt-1 text-xs font-semibold ${policy.status === 'NEEDS_REVIEW' ? 'text-amber-800' : 'text-slate-700'}`}>{policy.statusLabel}</p>
      </div>
    </AskCompactRow>
  );
}
