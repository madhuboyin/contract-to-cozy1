'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import type { AskRecordDetailCapability, AskRecordBuyerTaskRow, AskRecordFinancingScenarioRow, AskRecordHouseholdMemberRow, AskRecordIndex, AskRecordDocumentRow, AskRecordIndexSection, AskRecordIncidentClaimRow, AskRecordInspectionRow, AskRecordInventoryRow, AskRecordMaintenanceRow, AskRecordPermitRow, AskRecordPolicyRow, AskRecordProjectRow, AskRecordRoomRow, AskRecordSellerItemRow, AskRecordTimelineRow, AskRecordWarrantyRow } from '@/features/ask/types';
import { AskCollection, AskCollectionState, AskCompactRow, AskWorkspaceMeasure } from '../presentation/AskLayoutPrimitives';
import { askServiceIsPaused } from '../workspace/support';
import { RecordCollection } from './RecordCollection';
import { RecordRowDetail } from './RecordRowDetail';
import { RecordExportReview } from './RecordExportReview';
import { RecordRoomRow } from './RecordRoomRow';
import { RecordInventoryRow } from './RecordInventoryRow';
import { RecordDocumentRow } from './RecordDocumentRow';
import { RecordWarrantyRow } from './RecordWarrantyRow';
import { RecordBuyerTaskRow, RecordFinancingScenarioRow, RecordHouseholdMemberRow, RecordSellerItemRow } from './RecordTransactionRows';
import { RecordIncidentClaimRow, RecordPermitRow, RecordPolicyRow, RecordProjectRow } from './RecordWorkProtectionRows';
import { RecordInspectionRow, RecordMaintenanceRow, RecordTimelineRow } from './RecordHistoryRows';

const NOT_AVAILABLE_COPY: Record<NonNullable<AskRecordIndexSection['reasonCode']>, string> = {
  READER_NOT_CONNECTED: 'Count not shown here yet. Ask opens this section.',
  PROVIDER_FAILED: 'Temporarily unavailable. Your saved data is unchanged.',
  LIFECYCLE_INAPPLICABLE: 'Does not apply at your home’s current stage.',
  LIFECYCLE_CONTEXT_REQUIRED: 'Tell Cozy whether you own, are buying, or are selling to see this.',
  ROLE_FLOOR: 'Not available for your household role.',
};

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function sectionSummary(section: AskRecordIndexSection): { text: string; tone: 'normal' | 'muted' | 'caution' } {
  if (section.state === 'AVAILABLE') {
    const count = section.count === 0 ? 'None recorded' : `${section.count} ${section.countLabel ?? ''}`.trim();
    const fresh = section.freshAsOf ? ` · updated ${dateFormat.format(new Date(section.freshAsOf))}` : '';
    return { text: `${count}${fresh}`, tone: section.count === 0 ? 'muted' : 'normal' };
  }
  const copy = section.reasonCode ? NOT_AVAILABLE_COPY[section.reasonCode] : 'Unavailable.';
  return { text: copy, tone: section.reasonCode === 'PROVIDER_FAILED' ? 'caution' : 'muted' };
}

function SectionRow({ section, propertyId }: { section: AskRecordIndexSection; propertyId: string }) {
  const summary = sectionSummary(section);
  const href = section.primaryAction
    ? buildAskWorkspaceHref({ propertyId, question: section.primaryAction.question, from: 'record', backTo: '/dashboard/ask/record' })
    : null;
  return (
    <AskCompactRow className="border-b border-slate-200 lg:min-h-[4rem]" data-record-section={section.id} data-record-section-state={section.state.toLowerCase()}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{section.label}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500" title={section.scope}>{section.scope}</p>
        <p className={`mt-1 text-sm ${summary.tone === 'caution' ? 'text-amber-800' : summary.tone === 'muted' ? 'text-slate-500' : 'text-slate-800'}`}>{summary.text}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
      {section.pagedCollection && (
        <Link href={`/dashboard/ask/record?propertyId=${encodeURIComponent(propertyId)}&section=${encodeURIComponent(section.id)}`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-950 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" aria-label={`Browse all ${section.label}`}>
          Browse all
        </Link>
      )}
      {href && section.primaryAction && (
        <Link href={href} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-900/20 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" aria-label={`${section.primaryAction.label}: ${section.label}`}>
          {section.primaryAction.label}
        </Link>
      )}
      </div>
    </AskCompactRow>
  );
}

// Sections the destination can page in place. The index marks them with `pagedCollection`; this is how each one is presented.
const PAGED_SECTIONS: Record<string, { label: string; searchLabel: string; emptyText: string }> = {
  rooms: { label: 'Rooms', searchLabel: 'Search rooms', emptyText: 'No rooms are recorded yet.' },
  documents: { label: 'Documents', searchLabel: 'Search documents', emptyText: 'No documents are on file yet.' },
  warranties: { label: 'Warranties', searchLabel: 'Search warranties', emptyText: 'No warranties are recorded yet.' },
  timeline: { label: 'Home timeline', searchLabel: 'Search timeline', emptyText: 'No events are on the timeline yet.' },
  'maintenance-history': { label: 'Maintenance history', searchLabel: 'Search maintenance history', emptyText: 'No completed maintenance is recorded yet.' },
  inspections: { label: 'Inspections', searchLabel: 'Search inspections', emptyText: 'No inspection reports are recorded yet.' },
  permits: { label: 'Permits', searchLabel: 'Search permits', emptyText: 'No permits are recorded for this home.' },
  'projects-renovations': { label: 'Projects and renovations', searchLabel: 'Search projects', emptyText: 'No projects are tracked yet.' },
  'incidents-claims': { label: 'Incidents and claims', searchLabel: 'Search incidents and claims', emptyText: 'No incidents or claims are recorded.' },
  coverage: { label: 'Coverage and policies', searchLabel: 'Search policies', emptyText: 'No insurance policies are recorded for this home.' },
  'financing-ownership': { label: 'Financing and ownership', searchLabel: 'Search scenarios', emptyText: 'No financing scenarios are saved yet.' },
  'buyer-records': { label: 'Buyer records', searchLabel: 'Search buyer tasks', emptyText: 'No buyer tasks are recorded.' },
  'seller-records': { label: 'Seller records', searchLabel: 'Search sale checklist', emptyText: 'No sale checklist items are recorded.' },
  'household-access': { label: 'Household access', searchLabel: 'Search members', emptyText: 'No household members are recorded.' },
  inventory: { label: 'Systems and inventory', searchLabel: 'Search inventory', emptyText: 'No inventory items are recorded yet.' },
};

function renderPagedRowBase(sectionId: string, row: { id: string }, propertyId: string) {
  if (sectionId === 'rooms') return <RecordRoomRow key={row.id} room={row as AskRecordRoomRow} propertyId={propertyId} />;
  if (sectionId === 'documents') return <RecordDocumentRow key={row.id} document={row as AskRecordDocumentRow} propertyId={propertyId} />;
  if (sectionId === 'warranties') return <RecordWarrantyRow key={row.id} warranty={row as AskRecordWarrantyRow} propertyId={propertyId} />;
  if (sectionId === 'timeline') return <RecordTimelineRow key={row.id} event={row as AskRecordTimelineRow} />;
  if (sectionId === 'maintenance-history') return <RecordMaintenanceRow key={row.id} task={row as AskRecordMaintenanceRow} />;
  if (sectionId === 'inspections') return <RecordInspectionRow key={row.id} report={row as AskRecordInspectionRow} />;
  if (sectionId === 'permits') return <RecordPermitRow key={row.id} permit={row as AskRecordPermitRow} />;
  if (sectionId === 'projects-renovations') return <RecordProjectRow key={row.id} project={row as AskRecordProjectRow} />;
  if (sectionId === 'incidents-claims') return <RecordIncidentClaimRow key={row.id} record={row as AskRecordIncidentClaimRow} />;
  if (sectionId === 'coverage') return <RecordPolicyRow key={row.id} policy={row as AskRecordPolicyRow} />;
  if (sectionId === 'financing-ownership') return <RecordFinancingScenarioRow key={row.id} scenario={row as AskRecordFinancingScenarioRow} />;
  if (sectionId === 'buyer-records') return <RecordBuyerTaskRow key={row.id} task={row as AskRecordBuyerTaskRow} />;
  if (sectionId === 'seller-records') return <RecordSellerItemRow key={row.id} item={row as AskRecordSellerItemRow} />;
  if (sectionId === 'household-access') return <RecordHouseholdMemberRow key={row.id} member={row as AskRecordHouseholdMemberRow} />;
  return <RecordInventoryRow key={row.id} item={row as AskRecordInventoryRow} propertyId={propertyId} />;
}

// Row labels for the Details disclosure's screen-reader text, one per section with a connected detail reader.
const DETAIL_ROW_LABEL: Record<string, (row: never) => string> = {
  rooms: (row: AskRecordRoomRow) => row.name,
  inventory: (row: AskRecordInventoryRow) => row.name,
  documents: (row: AskRecordDocumentRow) => row.title,
  warranties: (row: AskRecordWarrantyRow) => `${row.providerName} warranty`,
  timeline: (row: AskRecordTimelineRow) => row.title,
  'maintenance-history': (row: AskRecordMaintenanceRow) => row.title,
  inspections: (row: AskRecordInspectionRow) => `${row.reportTypeLabel} inspection`,
  permits: (row: AskRecordPermitRow) => row.title,
  'projects-renovations': (row: AskRecordProjectRow) => row.name,
  'incidents-claims': (row: AskRecordIncidentClaimRow) => row.title,
  coverage: (row: AskRecordPolicyRow) => `${row.carrierName} policy`,
  'financing-ownership': (row: AskRecordFinancingScenarioRow) => row.title,
  'buyer-records': (row: AskRecordBuyerTaskRow) => row.title,
  'seller-records': (row: AskRecordSellerItemRow) => row.title,
  'household-access': (row: AskRecordHouseholdMemberRow) => row.name,
};

function renderPagedRow(sectionId: string, row: { id: string }, propertyId: string, recordDetail: AskRecordDetailCapability | undefined) {
  const base = renderPagedRowBase(sectionId, row, propertyId);
  const label = DETAIL_ROW_LABEL[sectionId];
  if (recordDetail?.state !== 'CONNECTED' || !label) return base;
  return (
    <Fragment key={row.id}>
      {base}
      <RecordRowDetail sectionId={sectionId} recordId={row.id} propertyId={propertyId} label={label(row as never)} backTo={`/dashboard/ask/record?section=${sectionId}`} />
    </Fragment>
  );
}

export function AskRecord() {
  const searchParams = useSearchParams();
  const requestedPropertyId = searchParams.get('propertyId')?.trim() ?? '';
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const propertyMismatch = Boolean(requestedPropertyId) && requestedPropertyId !== selectedPropertyId;
  const scopedPropertyId = requestedPropertyId || selectedPropertyId;
  const requestedSection = searchParams.get('section')?.trim() ?? '';
  const exportReview = searchParams.get('export') === 'review';
  // A search result opens the exact record: its detail is shown first, open, above its section's list.
  const focusedRecordId = searchParams.get('recordId')?.trim() ?? '';
  const collectionSection = !exportReview && Object.prototype.hasOwnProperty.call(PAGED_SECTIONS, requestedSection) ? requestedSection : null;
  const indexHref = `/dashboard/ask/record${scopedPropertyId ? `?propertyId=${encodeURIComponent(scopedPropertyId)}` : ''}`;
  const [index, setIndex] = useState<AskRecordIndex | null>(null);
  const [status, setStatus] = useState<'LOADING' | 'READY' | 'ERROR' | 'PAUSED'>('LOADING');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (propertyMismatch) setSelectedPropertyId(requestedPropertyId);
  }, [propertyMismatch, requestedPropertyId, setSelectedPropertyId]);

  useEffect(() => {
    if (!scopedPropertyId || propertyMismatch || collectionSection || exportReview) return;
    const controller = new AbortController();
    setStatus('LOADING');
    api.getAskRecordIndex(scopedPropertyId, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.success || !response.data) throw new Error(response.message || 'Could not load the home record.');
        setIndex(response.data);
        setStatus('READY');
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setIndex(null);
        setStatus(askServiceIsPaused(caught) ? 'PAUSED' : 'ERROR');
      });
    return () => controller.abort();
  }, [scopedPropertyId, propertyMismatch, collectionSection, exportReview, attempt]);

  const propertyLabel = index?.property ? (index.property.name?.trim() || `${index.property.address}, ${index.property.city}`) : null;
  const completeness = index?.completeness;

  return (
    <section className="h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-10" aria-labelledby="ask-record-title">
      <AskWorkspaceMeasure data-presentation-contract="ask.destination.record">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Ask Cozy destination</p>
            <h1 id="ask-record-title" className="mt-1 text-3xl font-semibold tracking-[-0.025em] text-slate-950">Record</h1>
            {propertyLabel && <p className="mt-1 truncate text-sm text-slate-600">{propertyLabel}{index?.property ? ` · ${index.property.city}, ${index.property.state}` : ''}</p>}
          </div>
          {!collectionSection && !exportReview && completeness?.state === 'AVAILABLE' && completeness.percent !== null && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3" data-record-completeness>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{completeness.percent}% of home details known</p>
                <p className="text-xs text-slate-500">{completeness.pendingDetails ? `${completeness.pendingDetails} detail${completeness.pendingDetails === 1 ? '' : 's'} still to review` : 'Nothing pending review'}</p>
              </div>
              {scopedPropertyId && (
                <Link href={buildAskWorkspaceHref({ propertyId: scopedPropertyId, question: 'How complete is my home record?', from: 'record', backTo: '/dashboard/ask/record' })} className="inline-flex min-h-11 items-center rounded-xl border border-emerald-900/20 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                  Review
                </Link>
              )}
            </div>
          )}
          {!collectionSection && !exportReview && scopedPropertyId && (
            <Link href={`/dashboard/ask/record?propertyId=${encodeURIComponent(scopedPropertyId)}&export=review`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-900/20 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
              Export home record
            </Link>
          )}
        </header>

        <section className="mt-5" aria-label="Home record sections">
          {exportReview && scopedPropertyId && !propertyMismatch ? (
            <RecordExportReview key={scopedPropertyId} propertyId={scopedPropertyId} backHref={indexHref} />
          ) : collectionSection && scopedPropertyId && !propertyMismatch ? (
            <>
            {focusedRecordId && DETAIL_ROW_LABEL[collectionSection] && (
              <ul className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/40" aria-label="Selected record" data-record-focused={focusedRecordId}>
                <RecordRowDetail key={`${collectionSection}:${focusedRecordId}`} sectionId={collectionSection} recordId={focusedRecordId} propertyId={scopedPropertyId} label="the selected record" backTo={`/dashboard/ask/record?section=${collectionSection}`} defaultOpen />
              </ul>
            )}
            <RecordCollection<{ id: string }>
              key={`${scopedPropertyId}:${collectionSection}`}
              sectionId={collectionSection}
              label={PAGED_SECTIONS[collectionSection].label}
              propertyId={scopedPropertyId}
              backHref={indexHref}
              searchLabel={PAGED_SECTIONS[collectionSection].searchLabel}
              emptyText={PAGED_SECTIONS[collectionSection].emptyText}
              renderRow={(row, recordDetail) => renderPagedRow(collectionSection, row, scopedPropertyId, recordDetail)}
            />
            </>
          ) : !scopedPropertyId ? (
            <AskCollectionState kind="NOT_APPLICABLE" description="Select a home to browse its record." />
          ) : status === 'PAUSED' ? (
            <AskCollectionState kind="UNAVAILABLE" description="Ask Cozy is temporarily paused. Your saved data is unchanged." className="border-amber-200 bg-amber-50 text-amber-950" />
          ) : status === 'ERROR' ? (
            <AskCollectionState kind="UNAVAILABLE" description="The home record could not be loaded." action={<button type="button" onClick={retry} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">Try again</button>} />
          ) : status === 'LOADING' || propertyMismatch || !index ? (
            <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-6 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading the home record…</div>
          ) : (
            <>
              {index.partial && (
                <AskCollectionState kind="UNAVAILABLE" description="Some sections could not be read right now. They are marked below." className="mb-3 border-amber-200 bg-amber-50 text-amber-950" action={<button type="button" onClick={retry} className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100">Try again</button>} />
              )}
              <AskCollection className="rounded-2xl border border-slate-200 bg-white lg:grid lg:grid-cols-2 lg:divide-y-0 lg:[&>li:nth-child(odd)]:border-r lg:[&>li:nth-child(odd)]:border-slate-200" aria-label="Record sections">
                {index.sections.map((section) => <SectionRow key={section.id} section={section} propertyId={index.propertyId} />)}
              </AskCollection>
            </>
          )}
        </section>
      </AskWorkspaceMeasure>
    </section>
  );
}
