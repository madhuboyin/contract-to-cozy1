'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

import {
  getPropertyTaxCenterRecord,
  getPropertyTaxCoverage,
  getPropertyTaxDocumentIntakes,
  getPropertyTaxEstimate,
  getPropertyTaxRules,
  getPropertyTaxActions,
  uploadPropertyTaxDocument,
  stagePropertyTaxDocumentFields,
  confirmPropertyTaxDocument,
  decidePropertyTaxAction,
  getPropertyTaxAppealReadiness,
  savePropertyTaxAppealComparable,
  savePropertyTaxAppealEvidence,
  saveHomeownerPropertyTaxRecord,
  type PropertyTaxCenterRecordDTO,
  type PropertyTaxCoverageDTO,
  type PropertyTaxRulesDTO,
  type PropertyTaxDocumentIntakeDTO,
  type PropertyTaxActionsDTO,
  type PropertyTaxAppealGround,
  type PropertyTaxAppealReadinessDTO,
  type PropertyTaxEstimateDTO,
  type PropertyTaxFieldDTO,
} from './taxApi';
import HomeToolsRail from '../../components/HomeToolsRail';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';
import { propertyTaxTrust } from '@/lib/trust/trustPresets';
import { track } from '@/lib/analytics/events';

function money(value: number | null | undefined, currency = 'USD') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
}

function pct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function sourceLabel(source?: PropertyTaxEstimateDTO['current']['source']) {
  return source === 'HOMEOWNER_REPORTED'
    ? 'Homeowner-reported planning inputs'
    : 'Rough planning estimate';
}

function canonicalStateLabel(state?: PropertyTaxCenterRecordDTO['state']) {
  return {
    UNKNOWN: 'No canonical record',
    OFFICIAL: 'Official source',
    DOCUMENT_CONFIRMED: 'Confirmed document',
    DOCUMENT_UNCONFIRMED: 'Document needs review',
    HOMEOWNER_REPORTED: 'Homeowner reported',
    MIXED: 'Mixed sources',
    CONFLICTED: 'Conflicting records',
  }[state ?? 'UNKNOWN'];
}

function fieldValue(field: PropertyTaxFieldDTO | undefined, kind: 'money' | 'rate' | 'text' = 'text') {
  if (!field || field.state === 'UNKNOWN') return 'Unknown';
  if (field.state === 'CONFLICTED') return 'Needs resolution';
  if (kind === 'money' && typeof field.value === 'number') return money(field.value);
  if (kind === 'rate' && typeof field.value === 'number') return pct(field.value);
  if (Array.isArray(field.value)) return field.value.join(', ');
  return String(field.value ?? 'Unknown');
}

function CanonicalField({
  label,
  field,
  kind = 'text',
}: {
  label: string;
  field: PropertyTaxFieldDTO | undefined;
  kind?: 'money' | 'rate' | 'text';
}) {
  const conflicted = field?.state === 'CONFLICTED';
  return (
    <div className={`rounded-xl border p-3 ${conflicted ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
      <div className="text-xs text-slate-600 dark:text-slate-300">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {fieldValue(field, kind)}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {field?.state === 'KNOWN'
          ? `${canonicalStateLabel(field.canonicalState)} · ${field.confidence.toLowerCase()} confidence`
          : field?.state === 'CONFLICTED'
            ? `${field.observations.length} sources disagree`
            : 'No sourced value'}
      </div>
    </div>
  );
}

export default function PropertyTaxClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const appealMode = searchParams.get('mode') === 'appeal';

  const [loading, setLoading] = useState(false);
  const [recordLoading, setRecordLoading] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [estimate, setEstimate] = useState<PropertyTaxEstimateDTO | null>(null);
  const [record, setRecord] = useState<PropertyTaxCenterRecordDTO | null>(null);
  const [coverage, setCoverage] = useState<PropertyTaxCoverageDTO | null>(null);
  const [rules, setRules] = useState<PropertyTaxRulesDTO | null>(null);
  const [intakes, setIntakes] = useState<PropertyTaxDocumentIntakeDTO[]>([]);
  const [taxActions, setTaxActions] = useState<PropertyTaxActionsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordSaved, setRecordSaved] = useState(false);
  const [taxDocumentFile, setTaxDocumentFile] = useState<File | null>(null);
  const [taxDocumentKind, setTaxDocumentKind] = useState<PropertyTaxDocumentIntakeDTO['kind']>('ASSESSMENT_NOTICE');
  const [taxDocumentConsent, setTaxDocumentConsent] = useState(false);
  const [taxDocumentBusy, setTaxDocumentBusy] = useState(false);
  const [taxDocumentReviewConfirmed, setTaxDocumentReviewConfirmed] = useState(false);
  const [activeTaxIntakeId, setActiveTaxIntakeId] = useState<string | null>(null);
  const [documentTaxYear, setDocumentTaxYear] = useState(String(new Date().getFullYear()));
  const [documentParcelId, setDocumentParcelId] = useState('');
  const [documentAssessedValue, setDocumentAssessedValue] = useState('');
  const [documentTaxableValue, setDocumentTaxableValue] = useState('');
  const [documentBillAmount, setDocumentBillAmount] = useState('');
  const [documentClassification, setDocumentClassification] = useState('');
  const [documentExemptions, setDocumentExemptions] = useState('');
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [actionReferences, setActionReferences] = useState<Record<string, string>>({});
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [appealGround, setAppealGround] = useState<PropertyTaxAppealGround>('ASSESSED_VALUE');
  const [appealReadiness, setAppealReadiness] = useState<PropertyTaxAppealReadinessDTO | null>(null);
  const [appealBusy, setAppealBusy] = useState(false);
  const [appealEvidenceDescription, setAppealEvidenceDescription] = useState('');
  const [appealEvidenceSourceUrl, setAppealEvidenceSourceUrl] = useState('');
  const [appealClaimedClass, setAppealClaimedClass] = useState('');
  const [appealExemptionProgram, setAppealExemptionProgram] = useState('');
  const [appealExemptionDecision, setAppealExemptionDecision] = useState('DENIED');
  const [appealNoticeDate, setAppealNoticeDate] = useState('');
  const [appealRevisedNoticeDate, setAppealRevisedNoticeDate] = useState('');
  const [appealRevisedNoticeQualifies, setAppealRevisedNoticeQualifies] = useState(false);
  const [comparableAddress, setComparableAddress] = useState('');
  const [comparableSaleDate, setComparableSaleDate] = useState('');
  const [comparableSalePrice, setComparableSalePrice] = useState('');
  const [comparableClass, setComparableClass] = useState('');
  const [comparableSourceUrl, setComparableSourceUrl] = useState('');
  const [comparableAdjustment, setComparableAdjustment] = useState('');
  const [comparableRationale, setComparableRationale] = useState('');
  const [assessedValue, setAssessedValue] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [parcelId, setParcelId] = useState('');
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear()));
  const requestRef = useRef(0);

  async function refresh() {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    const assessedValueInput = assessedValue ? Number(assessedValue) : undefined;
    const taxRatePercent = taxRate ? Number(taxRate) : undefined;
    const taxRateInput = taxRatePercent !== undefined && Number.isFinite(taxRatePercent)
      ? taxRatePercent / 100
      : undefined;
    const requestId = ++requestRef.current;

    try {
      const result = await getPropertyTaxEstimate(propertyId, {
        assessedValue: Number.isFinite(assessedValueInput) ? assessedValueInput : undefined,
        taxRate: Number.isFinite(taxRateInput) ? taxRateInput : undefined,
      });
      if (requestId === requestRef.current) setEstimate(result);
    } catch (cause: unknown) {
      if (requestId !== requestRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Failed to load property tax estimate');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  async function refreshRecord() {
    if (!propertyId) return;
    setRecordLoading(true);
    setRecordError(null);
    try {
      const [nextRecord, nextCoverage, nextRules, nextIntakes, nextActions] = await Promise.all([
        getPropertyTaxCenterRecord(propertyId),
        getPropertyTaxCoverage(propertyId),
        getPropertyTaxRules(propertyId),
        getPropertyTaxDocumentIntakes(propertyId),
        getPropertyTaxActions(propertyId),
      ]);
      setRecord(nextRecord);
      setCoverage(nextCoverage);
      setRules(nextRules);
      setIntakes(nextIntakes);
      setTaxActions(nextActions);
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error ? cause.message : 'Failed to load property tax record');
    } finally {
      setRecordLoading(false);
    }
  }

  async function saveReportedRecord() {
    const parsedTaxYear = Number(taxYear);
    const parsedAssessedValue = assessedValue ? Number(assessedValue) : undefined;
    const parsedRatePercent = taxRate ? Number(taxRate) : undefined;
    const parsedBillAmount = billAmount ? Number(billAmount) : undefined;

    setSavingRecord(true);
    setRecordError(null);
    setRecordSaved(false);
    try {
      const nextRecord = await saveHomeownerPropertyTaxRecord(propertyId, {
        taxYear: parsedTaxYear,
        parcelId: parcelId.trim() || undefined,
        totalAssessedValue: Number.isFinite(parsedAssessedValue) ? parsedAssessedValue : undefined,
        effectiveTaxRate: parsedRatePercent !== undefined && Number.isFinite(parsedRatePercent)
          ? parsedRatePercent / 100
          : undefined,
        billAmount: Number.isFinite(parsedBillAmount) ? parsedBillAmount : undefined,
      });
      setRecord(nextRecord);
      setRecordSaved(true);
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error ? cause.message : 'Failed to save property tax record');
    } finally {
      setSavingRecord(false);
    }
  }

  async function uploadTaxDocument() {
    if (!taxDocumentFile || !taxDocumentConsent) return;
    setTaxDocumentBusy(true);
    setRecordError(null);
    try {
      const intake = await uploadPropertyTaxDocument(
        propertyId,
        taxDocumentFile,
        taxDocumentKind,
      );
      setActiveTaxIntakeId(intake.id);
      setIntakes((current) => [intake, ...current]);
      setTaxDocumentFile(null);
      setTaxDocumentReviewConfirmed(false);
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error ? cause.message : 'Failed to store tax document');
    } finally {
      setTaxDocumentBusy(false);
    }
  }

  async function confirmTaxDocumentFacts() {
    if (!activeTaxIntakeId || !taxDocumentReviewConfirmed) return;
    const numeric = (value: string) => value.trim() ? Number(value) : undefined;
    const fields: Array<{ fieldKey: string; value: unknown }> = [
      { fieldKey: 'taxYear', value: Number(documentTaxYear) },
      ...(documentParcelId.trim()
        ? [{ fieldKey: 'parcelId', value: documentParcelId.trim() }]
        : []),
      ...(documentAssessedValue.trim()
        ? [{ fieldKey: 'totalAssessedValue', value: numeric(documentAssessedValue) }]
        : []),
      ...(documentTaxableValue.trim()
        ? [{ fieldKey: 'taxableValue', value: numeric(documentTaxableValue) }]
        : []),
      ...(documentBillAmount.trim()
        ? [{ fieldKey: 'billAmount', value: numeric(documentBillAmount) }]
        : []),
      ...(documentClassification.trim()
        ? [{ fieldKey: 'classification', value: documentClassification.trim() }]
        : []),
      ...(documentExemptions.trim()
        ? [{
            fieldKey: 'exemptions',
            value: documentExemptions.split(',').map((value) => value.trim()).filter(Boolean),
          }]
        : []),
    ];
    setTaxDocumentBusy(true);
    setRecordError(null);
    try {
      const staged = await stagePropertyTaxDocumentFields(
        propertyId,
        activeTaxIntakeId,
        fields,
      );
      const confirmed = await confirmPropertyTaxDocument(
        propertyId,
        activeTaxIntakeId,
        staged.fields.map((field) => ({
          fieldKey: field.fieldKey,
          status: 'CONFIRMED',
        })),
      );
      setRecord(confirmed.record);
      setActiveTaxIntakeId(null);
      setTaxDocumentReviewConfirmed(false);
      const [nextIntakes, nextActions] = await Promise.all([
        getPropertyTaxDocumentIntakes(propertyId),
        getPropertyTaxActions(propertyId),
      ]);
      setIntakes(nextIntakes);
      setTaxActions(nextActions);
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error ? cause.message : 'Failed to confirm tax document facts');
    } finally {
      setTaxDocumentBusy(false);
    }
  }

  async function updateTaxAction(
    action: PropertyTaxActionsDTO['actions'][number],
    status: PropertyTaxActionsDTO['actions'][number]['status'],
  ) {
    setActionBusyId(action.id);
    setRecordError(null);
    try {
      await decidePropertyTaxAction(propertyId, action.id, {
        status,
        note: actionNotes[action.id] ?? '',
        externalReference: actionReferences[action.id]?.trim() || undefined,
      });
      setTaxActions(await getPropertyTaxActions(propertyId));
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error ? cause.message : 'Failed to update tax action');
    } finally {
      setActionBusyId(null);
    }
  }

  async function refreshAppealReadiness(
    ground: PropertyTaxAppealGround = appealGround,
  ) {
    if (!propertyId) return;
    setAppealBusy(true);
    setRecordError(null);
    try {
      setAppealReadiness(
        await getPropertyTaxAppealReadiness(propertyId, ground, {
          revisedNoticeDate: appealRevisedNoticeDate || undefined,
          revisedNoticeQualifies: appealRevisedNoticeQualifies,
        }),
      );
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error
        ? cause.message
        : 'Failed to evaluate appeal readiness');
    } finally {
      setAppealBusy(false);
    }
  }

  async function saveAppealEvidence() {
    if (!appealEvidenceSourceUrl.trim()) return;
    setAppealBusy(true);
    setRecordError(null);
    try {
      const common = {
        evidenceKey: `${appealGround.toLowerCase()}-primary`,
        ground: appealGround,
        title: appealGround === 'TAX_CLASS'
          ? 'Tax class factual record'
          : appealGround === 'EXEMPTION'
            ? 'Exemption decision notice'
            : 'Condition or valuation evidence',
        description: appealEvidenceDescription.trim() || undefined,
        sourceUrl: appealEvidenceSourceUrl.trim(),
      };
      if (appealGround === 'TAX_CLASS') {
        await savePropertyTaxAppealEvidence(propertyId, {
          ...common,
          type: 'FACTUAL_ERROR',
          facts: {
            claimedClassification: appealClaimedClass.trim(),
            officialRecordMismatch: true,
          },
        });
      } else if (appealGround === 'EXEMPTION') {
        await savePropertyTaxAppealEvidence(propertyId, {
          ...common,
          type: 'EXEMPTION_DECISION',
          facts: {
            programName: appealExemptionProgram.trim(),
            decisionType: appealExemptionDecision,
            noticeDate: appealNoticeDate,
          },
        });
      } else {
        await savePropertyTaxAppealEvidence(propertyId, {
          ...common,
          type: 'CONDITION',
          facts: {
            conditionAsOfValuationDate: appealEvidenceDescription.trim(),
          },
        });
      }
      setAppealReadiness(
        await getPropertyTaxAppealReadiness(propertyId, appealGround, {
          revisedNoticeDate: appealRevisedNoticeDate || undefined,
          revisedNoticeQualifies: appealRevisedNoticeQualifies,
        }),
      );
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error
        ? cause.message
        : 'Failed to save appeal evidence');
    } finally {
      setAppealBusy(false);
    }
  }

  async function saveAppealComparable() {
    const salePrice = Number(comparableSalePrice);
    const otherAdjustment = comparableAdjustment.trim()
      ? Number(comparableAdjustment)
      : 0;
    if (
      !comparableAddress.trim()
      || !comparableSaleDate
      || !Number.isFinite(salePrice)
      || !comparableClass.trim()
      || !comparableSourceUrl.trim()
      || !Number.isFinite(otherAdjustment)
    ) return;
    setAppealBusy(true);
    setRecordError(null);
    try {
      await savePropertyTaxAppealComparable(propertyId, {
        comparableKey: globalThis.crypto.randomUUID(),
        address: comparableAddress.trim(),
        saleDate: comparableSaleDate,
        salePrice,
        propertyClass: comparableClass.trim(),
        sourceUrl: comparableSourceUrl.trim(),
        adjustments: {
          other: otherAdjustment,
          rationale: otherAdjustment !== 0
            ? comparableRationale.trim()
            : undefined,
        },
      });
      setComparableAddress('');
      setComparableSaleDate('');
      setComparableSalePrice('');
      setComparableSourceUrl('');
      setComparableAdjustment('');
      setComparableRationale('');
      setAppealReadiness(
        await getPropertyTaxAppealReadiness(propertyId, appealGround, {
          revisedNoticeDate: appealRevisedNoticeDate || undefined,
          revisedNoticeQualifies: appealRevisedNoticeQualifies,
        }),
      );
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error
        ? cause.message
        : 'Failed to save comparable evidence');
    } finally {
      setAppealBusy(false);
    }
  }

  useEffect(() => {
    if (!propertyId) return;
    void Promise.all([refresh(), refreshRecord()]);
    track('workflow_started', {
      tool: 'property-tax',
      propertyId,
      entryPoint: appealMode ? 'appeal_redirect' : 'direct',
    });
    // Loading an estimate is not workflow completion. Completion requires a
    // recorded decision or external tax action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (appealMode && propertyId) void refreshAppealReadiness(appealGround);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appealMode, propertyId, appealGround]);

  const invalidAssessedValue = Boolean(assessedValue) && !Number.isFinite(Number(assessedValue));
  const invalidTaxRate = Boolean(taxRate) && !Number.isFinite(Number(taxRate));
  const invalidBillAmount = Boolean(billAmount) && !Number.isFinite(Number(billAmount));
  const invalidTaxYear = !Number.isInteger(Number(taxYear))
    || Number(taxYear) < 1900
    || Number(taxYear) > new Date().getFullYear() + 2;
  const hasReportedValue = Boolean(parcelId.trim() || assessedValue || taxRate || billAmount);

  return (
    <ToolWorkspaceTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      eyebrow="Home tool"
      title="Property Tax Center"
      subtitle="Understand the current planning estimate, verify official facts, and prepare the right next step."
      introAction={
        <HomeToolsRail propertyId={propertyId} context="property-tax" currentToolId="property-tax" showDesktop={false} />
      }
      trust={propertyTaxTrust({
        confidenceLabel: record && record.state !== 'UNKNOWN'
          ? canonicalStateLabel(record.state)
          : estimate
            ? `${sourceLabel(estimate.current.source)} · ${estimate.current.confidence.toLowerCase()} input confidence`
            : 'Planning estimate only',
        freshnessLabel: record?.latestTaxYear
          ? `Canonical tax year ${record.latestTaxYear}`
          : estimate?.meta.generatedAt
            ? 'Calculated from current inputs'
            : 'Not yet calculated',
      })}
    >
      <HomeToolHeader
        toolId="property-tax"
        propertyId={propertyId}
        context="property-tax"
        currentToolId="property-tax"
      />

      <PropertyContextCapturePanel
        propertyId={propertyId}
        featureKey="PROPERTY_TAX"
        operationKey="VIEW_ESTIMATE"
        onCaptured={() => void Promise.all([refresh(), refreshRecord()])}
      />

      <nav aria-label="Property Tax Center stages" className="flex flex-wrap gap-2">
        <Link
          href={`/dashboard/properties/${propertyId}/tools/property-tax`}
          aria-current={!appealMode ? 'page' : undefined}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            !appealMode ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
          }`}
        >
          Overview
        </Link>
        <Link
          href={`/dashboard/properties/${propertyId}/tools/property-tax?mode=appeal`}
          aria-current={appealMode ? 'page' : undefined}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            appealMode ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
          }`}
        >
          Appeal readiness
        </Link>
      </nav>

      <section className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Official assessment source
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Coverage and freshness are reported independently from the last verified record.
            </p>
          </div>
          <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            {recordLoading
              ? 'Checking source…'
              : `${coverage?.status ?? 'UNCONFIGURED'} · ${coverage?.freshness ?? 'NEVER_FETCHED'}`}
          </span>
        </div>

        {coverage?.source ? (
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="text-sm text-slate-700 dark:text-slate-300">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {coverage.source.name}
              </div>
              <div className="mt-1">
                {coverage.source.normalizedCoverageKey}
                {coverage.source.pilotConstraints.taxClass
                  ? ` · Pilot tax class ${coverage.source.pilotConstraints.taxClass}`
                  : ''}
                {coverage.source.pilotConstraints.borough
                  ? ` · Borough ${coverage.source.pilotConstraints.borough}`
                  : ''}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Last source check: {coverage.source.lastFetchAt
                  ? new Date(coverage.source.lastFetchAt).toLocaleString()
                  : 'Not fetched yet'}
              </div>
              {coverage.source.lastFetchError && (
                <div role="status" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">
                  The latest source check degraded. The last verified assessment remains available.
                </div>
              )}
            </div>
            <a
              href={coverage.source.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:text-slate-100"
            >
              View official source
            </a>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-700 dark:text-slate-300">
            No reviewed assessor source is configured for this property.
          </p>
        )}

        {coverage?.lastGoodAssessment && (
          <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300 sm:grid-cols-4">
            <div>Tax year <span className="font-semibold text-slate-900 dark:text-slate-100">{coverage.lastGoodAssessment.taxYear}</span></div>
            <div>Stage <span className="font-semibold text-slate-900 dark:text-slate-100">{coverage.lastGoodAssessment.stage}</span></div>
            <div>Match <span className="font-semibold text-slate-900 dark:text-slate-100">{coverage.lastGoodAssessment.matchMethod ?? 'Unknown'}</span></div>
            <div>Observed <span className="font-semibold text-slate-900 dark:text-slate-100">{new Date(coverage.lastGoodAssessment.observedAt).toLocaleDateString()}</span></div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60" aria-busy={recordLoading}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Canonical assessment and bill</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Persisted facts stay separate from the rough planning estimate below.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${
            record?.state === 'CONFLICTED'
              ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
              : 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
          }`}>
            {recordLoading ? 'Loading record…' : canonicalStateLabel(record?.state)}
          </span>
        </div>

        {record?.state === 'UNKNOWN' ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
            No official, document-confirmed, or homeowner-reported tax record is stored yet.
            Add values below as homeowner-reported facts; they will remain visibly distinct from official data.
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CanonicalField label="Parcel ID" field={record?.parcel.fields.parcelId} />
              <CanonicalField label="Assessed value" field={record?.assessment.fields.totalAssessedValue} kind="money" />
              <CanonicalField label="Taxable value" field={record?.assessment.fields.taxableValue} kind="money" />
              <CanonicalField label="Bill amount" field={record?.bill.fields.billAmount} kind="money" />
              <CanonicalField label="Assessment stage" field={record?.assessment.fields.stage} />
              <CanonicalField label="Classification" field={record?.assessment.fields.classification} />
              <CanonicalField label="Effective rate" field={record?.bill.fields.effectiveTaxRate} kind="rate" />
              <CanonicalField label="Due dates" field={record?.bill.fields.dueDates} />
            </div>

            <div className="mt-4 grid gap-3 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
              <div>Tax year: <span className="font-medium text-slate-900 dark:text-slate-100">{record?.latestTaxYear ?? 'Unknown'}</span></div>
              <div>Parcel match: <span className="font-medium text-slate-900 dark:text-slate-100">{record?.parcel.matchStatus ?? 'UNMATCHED'}</span></div>
              <div>Jurisdiction: <span className="font-medium text-slate-900 dark:text-slate-100">{record?.parcel.jurisdiction?.normalizedKey ?? 'Not resolved'}</span></div>
            </div>
          </>
        )}

        {record && record.conflicts.length > 0 && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">
            <div className="font-semibold">Source conflicts need review</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {record.conflicts.map((conflict) => (
                <li key={conflict.fieldKey}>
                  {conflict.fieldKey}: {conflict.observations.length} active observations disagree. No value was selected automatically.
                </li>
              ))}
            </ul>
          </div>
        )}

        {recordError && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {recordError}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Verify a tax notice or bill
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Store the document in your property Vault, enter the facts you can verify, and confirm them before they become part of the canonical record.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Document kind</span>
            <select
              value={taxDocumentKind}
              onChange={(event) => setTaxDocumentKind(event.target.value as PropertyTaxDocumentIntakeDTO['kind'])}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="ASSESSMENT_NOTICE">Assessment notice</option>
              <option value="TAX_BILL">Tax bill</option>
              <option value="EXEMPTION_NOTICE">Exemption notice</option>
              <option value="CORRECTION_NOTICE">Correction notice</option>
              <option value="OTHER">Other tax document</option>
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">PDF or image</span>
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => setTaxDocumentFile(event.target.files?.[0] ?? null)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={taxDocumentConsent}
            onChange={(event) => setTaxDocumentConsent(event.target.checked)}
            className="mt-1"
          />
          <span>
            Store this document in my encrypted property Vault. This release uses manual review and does not send the document to an AI provider.
          </span>
        </label>
        <button
          type="button"
          onClick={() => void uploadTaxDocument()}
          disabled={!taxDocumentFile || !taxDocumentConsent || taxDocumentBusy}
          className="mt-3 min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {taxDocumentBusy ? 'Working…' : 'Store in Vault and review'}
        </button>

        {activeTaxIntakeId && (
          <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50/60 p-4 dark:border-teal-900 dark:bg-teal-950/20">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Confirm document facts
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Enter only values visible on this document. Leave unknown fields blank.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Tax year', documentTaxYear, setDocumentTaxYear, 'number'],
                ['Parcel ID', documentParcelId, setDocumentParcelId, 'text'],
                ['Assessed value', documentAssessedValue, setDocumentAssessedValue, 'number'],
                ['Taxable value', documentTaxableValue, setDocumentTaxableValue, 'number'],
                ['Bill amount', documentBillAmount, setDocumentBillAmount, 'number'],
                ['Classification', documentClassification, setDocumentClassification, 'text'],
                ['Exemptions (comma-separated)', documentExemptions, setDocumentExemptions, 'text'],
              ].map(([label, value, setter, type]) => (
                <label key={String(label)} className="text-sm">
                  <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">{String(label)}</span>
                  <input
                    type={String(type)}
                    value={String(value)}
                    onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
              ))}
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={taxDocumentReviewConfirmed}
                onChange={(event) => setTaxDocumentReviewConfirmed(event.target.checked)}
                className="mt-1"
              />
              <span>I reviewed these values against the uploaded document and confirm they are accurate.</span>
            </label>
            <button
              type="button"
              onClick={() => void confirmTaxDocumentFacts()}
              disabled={!taxDocumentReviewConfirmed || taxDocumentBusy}
              className="mt-3 min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirm reviewed fields
            </button>
          </div>
        )}

        {intakes.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Vault tax documents</h3>
            <div className="mt-2 space-y-2">
              {intakes.map((intake) => (
                <div key={intake.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{intake.document.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {intake.kind.replace(/_/g, ' ')} · {intake.storageMode} · {intake.extractionMethod}
                    </div>
                  </div>
                  <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700">
                    {intake.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Exemption and correction workflow
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Eligibility is never assumed. These checklists are available only when an active reviewed jurisdiction profile covers the property.
        </p>
        {taxActions?.coverage !== 'REVIEWED' ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
            {taxActions?.reason ?? 'No reviewed exemption or correction workflow is available.'}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {taxActions.actions.map((action) => (
              <div key={action.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{action.title}</h3>
                  <span className="text-xs font-semibold text-slate-500">{action.status}</span>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{action.explanation}</p>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-700 dark:text-slate-300">
                  {action.checklist.map((item, index) => <li key={index}>{String(item)}</li>)}
                </ol>
                <a href={action.officialUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-teal-700 underline dark:text-teal-300">
                  Open official instructions
                </a>
                <textarea
                  value={actionNotes[action.id] ?? ''}
                  onChange={(event) => setActionNotes((current) => ({ ...current, [action.id]: event.target.value }))}
                  placeholder="Record your eligibility or correction decision"
                  className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  value={actionReferences[action.id] ?? ''}
                  onChange={(event) => setActionReferences((current) => ({ ...current, [action.id]: event.target.value }))}
                  placeholder="External confirmation reference (required to complete)"
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actionBusyId === action.id || !(actionNotes[action.id] ?? '').trim()}
                    onClick={() => void updateTaxAction(action, 'READY_FOR_EXTERNAL_ACTION')}
                    className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-700"
                  >
                    Ready for external action
                  </button>
                  <button
                    type="button"
                    disabled={actionBusyId === action.id || !(actionNotes[action.id] ?? '').trim() || !(actionReferences[action.id] ?? '').trim()}
                    onClick={() => void updateTaxAction(action, 'COMPLETED')}
                    className="min-h-11 rounded-xl bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Record completed
                  </button>
                  <button
                    type="button"
                    disabled={actionBusyId === action.id || !(actionNotes[action.id] ?? '').trim()}
                    onClick={() => void updateTaxAction(action, 'NOT_APPLICABLE')}
                    className="min-h-11 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50 dark:text-slate-300"
                  >
                    Not applicable
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {appealMode && (
        <section className="rounded-2xl border border-amber-200/80 bg-amber-50/85 p-5 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Reviewed jurisdiction rules</h2>
              <p className="mt-2 text-sm">
                This center does not predict appeal success or promised savings. Filing information appears only from an active reviewed rule release.
              </p>
            </div>
            <span className="rounded-full border border-amber-300 bg-white/70 px-3 py-1 text-xs font-semibold dark:border-amber-800 dark:bg-slate-950/35">
              {rules?.coverage ?? 'UNAVAILABLE'}
            </span>
          </div>

          {rules?.coverage === 'REVIEWED' && rules.profile ? (
            <>
              <div className="mt-4 rounded-xl border border-amber-200/70 bg-white/70 p-4 dark:border-amber-800/50 dark:bg-slate-950/35">
                <div className="font-semibold">{rules.profile.title}</div>
                <div className="mt-1 text-xs">
                  Tax class {rules.profile.propertyClass ?? 'Unknown'} · {rules.profile.taxYearLabel ?? 'Tax year not labeled'} · {rules.profile.timezone}
                </div>
                <div className="mt-1 text-xs">
                  Reviewed {new Date(rules.profile.reviewedAt).toLocaleDateString()} · expires {new Date(rules.profile.expiresAt).toLocaleDateString()}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {rules.deadlines.map((deadline) => (
                  <div key={deadline.id} className="rounded-xl border border-amber-200/70 bg-white/70 p-4 dark:border-amber-800/50 dark:bg-slate-950/35">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold">{deadline.label}</h3>
                      <span className="text-xs font-semibold">{deadline.status}</span>
                    </div>
                    <div className="mt-2 text-sm">
                      {deadline.dueLocalDate
                        ? `${deadline.dueLocalDate} at ${deadline.cutoffLocalTime} (${deadline.timezone})`
                        : deadline.availability === 'NEEDS_NOTICE_DATE'
                          ? 'A qualifying revised-notice date is required.'
                          : 'Homeowner qualification confirmation is required.'}
                    </div>
                    {deadline.submissionRequirement && (
                      <p className="mt-2 text-xs">{deadline.submissionRequirement}</p>
                    )}
                    <a
                      href={deadline.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline"
                    >
                      Verify with official instructions
                    </a>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs">
                Sources: {rules.profile.citations.map((citation, index) => (
                  <React.Fragment key={citation.officialUrl}>
                    {index > 0 ? ' · ' : ''}
                    <a className="underline" href={citation.officialUrl} target="_blank" rel="noreferrer">
                      {citation.publisher}
                    </a>
                  </React.Fragment>
                ))}
              </div>
            </>
          ) : (
            <div role="status" className="mt-4 rounded-xl border border-amber-300 bg-white/70 p-4 text-sm dark:border-amber-800 dark:bg-slate-950/35">
              {rules?.reason ?? 'No active reviewed rule covers this property. Confirm all deadlines and forms directly with the official authority.'}
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-amber-200/70 bg-white/70 p-4 dark:border-amber-800/50 dark:bg-slate-950/35">
              <h3 className="text-sm font-semibold">Verify first</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                <li>Parcel, tax year, assessment stage, and valuation date</li>
                <li>Classification, assessment ratio, exemptions, and taxable value</li>
                <li>Official deadline, permitted grounds, form, fee, and evidence standard</li>
              </ul>
            </div>
            <div className="rounded-xl border border-amber-200/70 bg-white/70 p-4 dark:border-amber-800/50 dark:bg-slate-950/35">
              <h3 className="text-sm font-semibold">Prepare evidence</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                <li>The current assessment notice or bill</li>
                <li>Documents supporting factual, exemption, classification, or condition issues</li>
                <li>Jurisdiction-qualified comparable records when permitted</li>
              </ul>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-amber-300 bg-white/80 p-4 dark:border-amber-800 dark:bg-slate-950/45">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold">Evidence-qualified appeal readiness</h3>
                <p className="mt-1 text-xs">
                  Readiness checks reviewed ground requirements and sourced evidence. It is not a likelihood-of-success score.
                </p>
              </div>
              <label className="text-xs font-semibold">
                Reviewed ground
                <select
                  value={appealGround}
                  onChange={(event) => setAppealGround(event.target.value as PropertyTaxAppealGround)}
                  className="mt-1 block min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  {(appealReadiness?.reviewedGrounds.length
                    ? appealReadiness.reviewedGrounds
                    : [
                        { code: 'ASSESSED_VALUE', label: 'Assessed value' },
                        { code: 'TAX_CLASS', label: 'Tax class' },
                        { code: 'EXEMPTION', label: 'Exemption decision' },
                      ]).map((ground) => (
                    <option key={ground.code} value={ground.code}>
                      {ground.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-950 px-3 py-1 text-xs font-semibold text-white dark:bg-amber-200 dark:text-amber-950">
                {appealBusy ? 'CHECKING' : appealReadiness?.status ?? 'NOT CHECKED'}
              </span>
              {appealReadiness && (
                <span className="text-xs font-semibold">
                  Preparation effort: {appealReadiness.effort.toLowerCase()}
                </span>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 p-3 dark:border-amber-800/70">
              <div className="text-sm font-semibold">Revised-notice filing window, if applicable</div>
              <p className="mt-1 text-xs">
                Use this only when the fixed filing deadline has passed and an official revised notice may qualify under the reviewed exception.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  type="date"
                  aria-label="Revised notice date"
                  value={appealRevisedNoticeDate}
                  onChange={(event) => setAppealRevisedNoticeDate(event.target.value)}
                  className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <label className="flex max-w-xl items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={appealRevisedNoticeQualifies}
                    onChange={(event) => setAppealRevisedNoticeQualifies(event.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  I reviewed the official notice and confirm it states an assessed-value increase or exemption reduction/removal covered by the reviewed exception.
                </label>
                <button
                  type="button"
                  onClick={() => void refreshAppealReadiness(appealGround)}
                  disabled={
                    appealBusy
                    || (
                      Boolean(appealRevisedNoticeDate)
                      && !appealRevisedNoticeQualifies
                    )
                  }
                  className="min-h-11 rounded-xl border border-amber-400 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-amber-700"
                >
                  Recheck filing window
                </button>
              </div>
            </div>

            {appealReadiness?.reason && (
              <p className="mt-3 text-sm">{appealReadiness.reason}</p>
            )}
            {appealReadiness && appealReadiness.gaps.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <div className="text-sm font-semibold">Exact gaps</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {appealReadiness.gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </div>
            )}

            {appealReadiness?.taxAtStake && (
              <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-950 dark:border-teal-800 dark:bg-teal-950/35 dark:text-teal-100">
                <div className="text-xs font-semibold uppercase tracking-wide">Tax at stake—not promised savings</div>
                <div className="mt-1 text-xl font-semibold">
                  {money(appealReadiness.taxAtStake.low)}–{money(appealReadiness.taxAtStake.high)}
                </div>
                <p className="mt-2 text-xs">{appealReadiness.taxAtStake.method}</p>
              </div>
            )}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-amber-200 p-4 dark:border-amber-800/70">
                <h4 className="text-sm font-semibold">
                  {appealGround === 'TAX_CLASS'
                    ? 'Add factual-error evidence'
                    : appealGround === 'EXEMPTION'
                      ? 'Add the exemption decision'
                      : 'Add condition or valuation evidence'}
                </h4>
                {appealGround === 'TAX_CLASS' && (
                  <input
                    value={appealClaimedClass}
                    onChange={(event) => setAppealClaimedClass(event.target.value)}
                    placeholder="Claimed correct tax class"
                    className="mt-3 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                )}
                {appealGround === 'EXEMPTION' && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      value={appealExemptionProgram}
                      onChange={(event) => setAppealExemptionProgram(event.target.value)}
                      placeholder="Exemption program"
                      className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <select
                      value={appealExemptionDecision}
                      onChange={(event) => setAppealExemptionDecision(event.target.value)}
                      className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="DENIED">Denied</option>
                      <option value="REVOKED">Revoked</option>
                      <option value="REDUCED">Reduced</option>
                      <option value="OMITTED">Omitted</option>
                    </select>
                    <input
                      type="date"
                      value={appealNoticeDate}
                      onChange={(event) => setAppealNoticeDate(event.target.value)}
                      className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}
                <textarea
                  value={appealEvidenceDescription}
                  onChange={(event) => setAppealEvidenceDescription(event.target.value)}
                  placeholder="Describe the fact or condition as of the valuation date"
                  className="mt-2 min-h-24 w-full rounded-xl border border-amber-300 bg-white p-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <input
                  type="url"
                  value={appealEvidenceSourceUrl}
                  onChange={(event) => setAppealEvidenceSourceUrl(event.target.value)}
                  placeholder="Official or supporting source URL"
                  className="mt-2 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => void saveAppealEvidence()}
                  disabled={
                    appealBusy
                    || !appealEvidenceSourceUrl.trim()
                    || (appealGround === 'TAX_CLASS' && !appealClaimedClass.trim())
                    || (
                      appealGround === 'EXEMPTION'
                      && (!appealExemptionProgram.trim() || !appealNoticeDate)
                    )
                  }
                  className="mt-3 min-h-11 rounded-xl bg-amber-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-amber-200 dark:text-amber-950"
                >
                  Save confirmed evidence
                </button>
              </div>

              {appealGround === 'ASSESSED_VALUE' ? (
                <div className="rounded-xl border border-amber-200 p-4 dark:border-amber-800/70">
                  <h4 className="text-sm font-semibold">Add a sourced comparable sale</h4>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      value={comparableAddress}
                      onChange={(event) => setComparableAddress(event.target.value)}
                      placeholder="Comparable address"
                      className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="date"
                      value={comparableSaleDate}
                      onChange={(event) => setComparableSaleDate(event.target.value)}
                      className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <input
                      inputMode="decimal"
                      value={comparableSalePrice}
                      onChange={(event) => setComparableSalePrice(event.target.value)}
                      placeholder="Sale price"
                      className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <input
                      value={comparableClass}
                      onChange={(event) => setComparableClass(event.target.value)}
                      placeholder="Tax class"
                      className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="url"
                      value={comparableSourceUrl}
                      onChange={(event) => setComparableSourceUrl(event.target.value)}
                      placeholder="Sale record source URL"
                      className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100 sm:col-span-2"
                    />
                    <input
                      inputMode="decimal"
                      value={comparableAdjustment}
                      onChange={(event) => setComparableAdjustment(event.target.value)}
                      placeholder="Net adjustment (+/− dollars)"
                      className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <input
                      value={comparableRationale}
                      onChange={(event) => setComparableRationale(event.target.value)}
                      placeholder="Required when adjusted"
                      className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveAppealComparable()}
                    disabled={
                      appealBusy
                      || !comparableAddress.trim()
                      || !comparableSaleDate
                      || !Number.isFinite(Number(comparableSalePrice))
                      || Number(comparableSalePrice) <= 0
                      || !comparableClass.trim()
                      || !comparableSourceUrl.trim()
                      || (
                        Boolean(comparableAdjustment.trim())
                        && Number(comparableAdjustment) !== 0
                        && !comparableRationale.trim()
                      )
                    }
                    className="mt-3 min-h-11 rounded-xl bg-amber-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-amber-200 dark:text-amber-950"
                  >
                    Add comparable
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 p-4 text-sm dark:border-amber-800/70">
                  <h4 className="font-semibold">Evidence standard</h4>
                  <p className="mt-2">
                    The source must establish the factual mismatch or official exemption disposition. This workflow does not decide legal eligibility or predict the authority’s decision.
                  </p>
                </div>
              )}
            </div>

            {appealReadiness && appealReadiness.comparables.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold">Comparable qualification</h4>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {appealReadiness.comparables.map((comparable) => (
                    <div key={comparable.id} className="rounded-xl border border-amber-200 p-3 text-sm dark:border-amber-800/70">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold">{comparable.address}</span>
                        <span className="text-xs font-semibold">{comparable.qualification}</span>
                      </div>
                      <div className="mt-1 text-xs">
                        {new Date(comparable.saleDate).toLocaleDateString()} · {money(comparable.salePrice)} · adjusted {money(comparable.adjustedSalePrice)}
                      </div>
                      {comparable.reasons.length > 0 && (
                        <ul className="mt-2 list-disc pl-5 text-xs">
                          {comparable.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {appealReadiness && (
              <p className="mt-4 border-t border-amber-200 pt-3 text-xs dark:border-amber-800/70">
                {appealReadiness.professionalBoundary}
              </p>
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Planning and homeowner-reported inputs</h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Use values from the same current bill or notice. Refreshing updates only the estimate; saving creates a sourced homeowner-reported record.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Tax year</span>
            <input
              value={taxYear}
              onChange={(event) => setTaxYear(event.target.value)}
              inputMode="numeric"
              aria-invalid={invalidTaxYear}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {invalidTaxYear && <span className="mt-1 block text-xs text-red-600">Enter a valid tax year.</span>}
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Parcel ID</span>
            <input
              value={parcelId}
              onChange={(event) => setParcelId(event.target.value)}
              placeholder="From bill or notice"
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Assessed value (USD)</span>
            <input
              value={assessedValue}
              onChange={(event) => setAssessedValue(event.target.value)}
              placeholder="e.g. 425000"
              inputMode="decimal"
              aria-invalid={invalidAssessedValue}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {invalidAssessedValue && <span className="mt-1 block text-xs text-red-600">Enter a valid number.</span>}
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Effective tax rate (%)</span>
            <input
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.value)}
              placeholder="e.g. 1.85"
              inputMode="decimal"
              aria-invalid={invalidTaxRate}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {invalidTaxRate && <span className="mt-1 block text-xs text-red-600">Enter a valid number.</span>}
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Bill amount (USD)</span>
            <input
              value={billAmount}
              onChange={(event) => setBillAmount(event.target.value)}
              placeholder="e.g. 7800"
              inputMode="decimal"
              aria-invalid={invalidBillAmount}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {invalidBillAmount && <span className="mt-1 block text-xs text-red-600">Enter a valid number.</span>}
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || invalidAssessedValue || invalidTaxRate}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {loading ? 'Refreshing…' : 'Refresh planning estimate'}
          </button>
          <button
            type="button"
            onClick={() => void saveReportedRecord()}
            disabled={
              savingRecord
              || invalidTaxYear
              || invalidAssessedValue
              || invalidTaxRate
              || invalidBillAmount
              || !hasReportedValue
            }
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {savingRecord ? 'Saving record…' : 'Save as homeowner-reported'}
          </button>
        </div>

        {recordSaved && (
          <div role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">
            Saved as homeowner-reported facts. These values are not labeled official or document-verified.
          </div>
        )}

        {error && (
          <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/55 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Rough annual property-tax estimate</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{estimate?.input.addressLabel || '—'}</p>
            </div>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              {sourceLabel(estimate?.current.source)}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{money(estimate?.current.annualTax)}</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">About {money(estimate?.current.monthlyTax)} per month</div>
            </div>
            <div className="text-right text-sm">
              <div>Assessed value: {money(estimate?.current.assessedValue)}</div>
              <div className="mt-1">Effective rate: {estimate?.current.taxRate ? pct(estimate.current.taxRate) : '—'}</div>
            </div>
          </div>
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
            This is not an observed tax record. It must not be used to infer historical changes, peer standing, appeal merit, or a filing deadline.
          </p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/55">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Planning scenarios</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Forward projections only; these are not historical observations.</p>
          <div className="mt-4 space-y-3">
            {(estimate?.projection || []).map((projection) => (
              <div key={projection.years} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-xs text-slate-600 dark:text-slate-300">{projection.years}-year scenario</div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{money(projection.estimatedAnnualTax)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/55">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">What affects this estimate</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(estimate?.drivers || []).map((driver) => (
            <div key={driver.factor} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{driver.factor}</h3>
                <span className="text-xs text-slate-600 dark:text-slate-300">{driver.impact}</span>
              </div>
              <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">{driver.explanation}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/80 p-5 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/55">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Safe next step</h2>
        <p className="mt-2 text-slate-700 dark:text-slate-300">
          Verify the current parcel, classification, exemptions, assessed and taxable values, bill amount, and local process with the official assessor or collector.
        </p>
        <Link
          href={`/dashboard/properties/${propertyId}/tools/property-tax?mode=appeal`}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-slate-900 px-4 font-medium text-white dark:bg-white dark:text-slate-900"
        >
          Review appeal readiness
        </Link>
      </section>
    </ToolWorkspaceTemplate>
  );
}
