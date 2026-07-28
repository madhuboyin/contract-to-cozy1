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
  getPropertyTaxAppealCases,
  createPropertyTaxAppealCase,
  updatePropertyTaxAppealPacket,
  confirmPropertyTaxAppealFiling,
  trackPropertyTaxAppealEvent,
  savePropertyTaxAppealReminder,
  decidePropertyTaxAppealReminder,
  determinePropertyTaxAppealCase,
  saveHomeownerPropertyTaxRecord,
  type PropertyTaxCenterRecordDTO,
  type PropertyTaxCoverageDTO,
  type PropertyTaxRulesDTO,
  type PropertyTaxDocumentIntakeDTO,
  type PropertyTaxActionsDTO,
  type PropertyTaxAppealGround,
  type PropertyTaxAppealReadinessDTO,
  type PropertyTaxAppealCaseDTO,
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

const PROPERTY_TAX_STAGES = [
  { id: 'overview', label: 'Overview' },
  { id: 'bill', label: 'Bill' },
  { id: 'changes', label: 'Changes' },
  { id: 'exemptions', label: 'Exemptions' },
  { id: 'review', label: 'Review' },
  { id: 'appeal', label: 'Appeal' },
  { id: 'history', label: 'History' },
] as const;

type PropertyTaxStage = (typeof PROPERTY_TAX_STAGES)[number]['id'];

function isPropertyTaxStage(value: string | null): value is PropertyTaxStage {
  return PROPERTY_TAX_STAGES.some((stage) => stage.id === value);
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
  const requestedStage = searchParams.get('stage');
  const activeStage: PropertyTaxStage = isPropertyTaxStage(requestedStage)
    ? requestedStage
    : searchParams.get('mode') === 'appeal'
      ? 'appeal'
      : 'overview';
  const appealMode = activeStage === 'appeal';
  const requestedCaseId = searchParams.get('caseId');
  const stageHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStageRef = useRef<PropertyTaxStage>(activeStage);

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
  const [appealCases, setAppealCases] = useState<PropertyTaxAppealCaseDTO[]>([]);
  const [activeAppealCaseId, setActiveAppealCaseId] = useState<string | null>(null);
  const [appealCaseBusy, setAppealCaseBusy] = useState(false);
  const [packetNarrative, setPacketNarrative] = useState('');
  const [packetChecklist, setPacketChecklist] = useState<string[]>([]);
  const [packetPlaceholders, setPacketPlaceholders] = useState<Record<string, string>>({});
  const [packetReviewed, setPacketReviewed] = useState(false);
  const [filingReference, setFilingReference] = useState('');
  const [trackingType, setTrackingType] = useState<'RESPONSE_RECEIVED' | 'HEARING_SCHEDULED'>('RESPONSE_RECEIVED');
  const [trackingAt, setTrackingAt] = useState('');
  const [trackingSummary, setTrackingSummary] = useState('');
  const [hearingLocation, setHearingLocation] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDueDate, setReminderDueDate] = useState('');
  const [determination, setDetermination] = useState<'REDUCED' | 'UPHELD' | 'CLASS_CHANGED' | 'EXEMPTION_ADJUSTED' | 'PARTIAL' | 'WITHDRAWN' | 'OTHER'>('REDUCED');
  const [determinationReference, setDeterminationReference] = useState('');
  const [determinationSummary, setDeterminationSummary] = useState('');
  const [determinationFinalValue, setDeterminationFinalValue] = useState('');
  const [determinationRefund, setDeterminationRefund] = useState('');
  const [determinationCredit, setDeterminationCredit] = useState('');
  const [determinationClose, setDeterminationClose] = useState(true);
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
      const [nextRecord, nextCoverage, nextRules, nextIntakes, nextActions, nextCases] = await Promise.all([
        getPropertyTaxCenterRecord(propertyId),
        getPropertyTaxCoverage(propertyId),
        getPropertyTaxRules(propertyId),
        getPropertyTaxDocumentIntakes(propertyId),
        getPropertyTaxActions(propertyId),
        getPropertyTaxAppealCases(propertyId),
      ]);
      setRecord(nextRecord);
      setCoverage(nextCoverage);
      setRules(nextRules);
      setIntakes(nextIntakes);
      setTaxActions(nextActions);
      track('property_tax_outcome_recorded', {
        propertyId,
        outcome: 'DOCUMENT_REVIEW_CONFIRMED',
      });
      setAppealCases(nextCases);
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
      track('property_tax_outcome_recorded', {
        propertyId,
        outcome: action.type === 'EXEMPTION_REVIEW'
          ? 'EXEMPTION_DECISION'
          : action.type === 'FACTUAL_CORRECTION'
            ? 'CORRECTION_DECISION'
            : 'INFORMAL_REVIEW_DECISION',
        actionId: action.id,
        status,
      });
      if (['COMPLETED', 'NOT_APPLICABLE', 'DISMISSED'].includes(status)) {
        track('workflow_completed', { tool: 'property-tax', propertyId });
      }
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

  function openAppealCase(appealCase: PropertyTaxAppealCaseDTO) {
    setActiveAppealCaseId(appealCase.id);
    setPacketNarrative(appealCase.packet?.narrative ?? '');
    setPacketChecklist(appealCase.packet?.completedChecklistJson ?? []);
    setPacketPlaceholders(appealCase.packet?.placeholderValuesJson ?? {});
    setPacketReviewed(Boolean(appealCase.packet?.homeownerReviewedAt));
  }

  function replaceAppealCase(appealCase: PropertyTaxAppealCaseDTO) {
    setAppealCases((current) => {
      const found = current.some((item) => item.id === appealCase.id);
      return found
        ? current.map((item) => item.id === appealCase.id ? appealCase : item)
        : [appealCase, ...current];
    });
    openAppealCase(appealCase);
  }

  async function startAppealCase() {
    if (appealReadiness?.status !== 'READY') return;
    setAppealCaseBusy(true);
    setRecordError(null);
    try {
      replaceAppealCase(await createPropertyTaxAppealCase(propertyId, {
        ground: appealGround,
        revisedNoticeDate: appealRevisedNoticeDate || undefined,
        revisedNoticeQualifies: appealRevisedNoticeQualifies,
      }));
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error
        ? cause.message
        : 'Failed to start appeal case');
    } finally {
      setAppealCaseBusy(false);
    }
  }

  async function saveAppealPacket(caseId: string) {
    setAppealCaseBusy(true);
    setRecordError(null);
    try {
      replaceAppealCase(await updatePropertyTaxAppealPacket(
        propertyId,
        caseId,
        {
          narrative: packetNarrative,
          completedChecklist: packetChecklist,
          placeholderValues: packetPlaceholders,
          homeownerReviewed: packetReviewed,
        },
      ));
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error
        ? cause.message
        : 'Failed to save appeal packet');
    } finally {
      setAppealCaseBusy(false);
    }
  }

  async function confirmAppealFiled(caseId: string) {
    if (!filingReference.trim()) return;
    setAppealCaseBusy(true);
    setRecordError(null);
    try {
      const filedCase = await confirmPropertyTaxAppealFiling(
        propertyId,
        caseId,
        {
          filedAt: new Date().toISOString(),
          externalReference: filingReference.trim(),
        },
      );
      replaceAppealCase(filedCase);
      setFilingReference('');
      track('property_tax_outcome_recorded', {
        propertyId,
        outcome: 'EXTERNAL_FILING',
        caseId,
        status: filedCase.status,
      });
      track('workflow_completed', { tool: 'property-tax', propertyId });
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error
        ? cause.message
        : 'Failed to confirm external filing');
    } finally {
      setAppealCaseBusy(false);
    }
  }

  async function addAppealTrackingEvent(caseId: string) {
    if (!trackingAt || !trackingSummary.trim()) return;
    setAppealCaseBusy(true);
    setRecordError(null);
    try {
      replaceAppealCase(await trackPropertyTaxAppealEvent(
        propertyId,
        caseId,
        {
          type: trackingType,
          occurredAt: new Date(trackingAt).toISOString(),
          summary: trackingSummary.trim(),
          hearingLocation: trackingType === 'HEARING_SCHEDULED'
            ? hearingLocation.trim() || undefined
            : undefined,
        },
      ));
      setTrackingAt('');
      setTrackingSummary('');
      setHearingLocation('');
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error
        ? cause.message
        : 'Failed to record appeal event');
    } finally {
      setAppealCaseBusy(false);
    }
  }

  async function addAppealReminder(caseId: string) {
    if (!reminderTitle.trim() || !reminderDueDate) return;
    setAppealCaseBusy(true);
    setRecordError(null);
    try {
      await savePropertyTaxAppealReminder(propertyId, caseId, {
        reminderKey: globalThis.crypto.randomUUID(),
        title: reminderTitle.trim(),
        dueAt: new Date(`${reminderDueDate}T12:00:00`).toISOString(),
      });
      const cases = await getPropertyTaxAppealCases(propertyId);
      setAppealCases(cases);
      const refreshed = cases.find((item) => item.id === caseId);
      if (refreshed) openAppealCase(refreshed);
      setReminderTitle('');
      setReminderDueDate('');
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error
        ? cause.message
        : 'Failed to save appeal reminder');
    } finally {
      setAppealCaseBusy(false);
    }
  }

  async function finishAppealReminder(
    caseId: string,
    reminderId: string,
    status: 'COMPLETED' | 'DISMISSED',
  ) {
    setAppealCaseBusy(true);
    setRecordError(null);
    try {
      await decidePropertyTaxAppealReminder(
        propertyId,
        caseId,
        reminderId,
        status,
      );
      const cases = await getPropertyTaxAppealCases(propertyId);
      setAppealCases(cases);
      const refreshed = cases.find((item) => item.id === caseId);
      if (refreshed) openAppealCase(refreshed);
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error
        ? cause.message
        : 'Failed to update appeal reminder');
    } finally {
      setAppealCaseBusy(false);
    }
  }

  async function saveAppealDetermination(caseId: string) {
    if (!determinationReference.trim() || !determinationSummary.trim()) return;
    const numericInputs = [
      determinationFinalValue,
      determinationRefund,
      determinationCredit,
    ].filter((value) => value.trim());
    if (numericInputs.some((value) =>
      !Number.isFinite(Number(value)) || Number(value) < 0
    )) {
      setRecordError('Determination amounts must be valid non-negative numbers');
      return;
    }
    const optionalNumber = (value: string) => value.trim()
      ? Number(value)
      : undefined;
    setAppealCaseBusy(true);
    setRecordError(null);
    try {
      const determinedCase = await determinePropertyTaxAppealCase(
        propertyId,
        caseId,
        {
          determination,
          determinationAt: new Date().toISOString(),
          reference: determinationReference.trim(),
          summary: determinationSummary.trim(),
          finalAssessedValue: optionalNumber(determinationFinalValue),
          refundAmount: optionalNumber(determinationRefund),
          creditAmount: optionalNumber(determinationCredit),
          closeCase: determinationClose,
        },
      );
      replaceAppealCase(determinedCase);
      const assessedValueReduction = determinedCase.originalAssessedValue !== null
        && determinedCase.finalAssessedValue !== null
        ? Math.max(0, determinedCase.originalAssessedValue - determinedCase.finalAssessedValue)
        : undefined;
      track('property_tax_outcome_recorded', {
        propertyId,
        outcome: 'DETERMINATION',
        caseId,
        status: determinedCase.status,
        determination: determinedCase.determination ?? determination,
        assessedValueReduction,
        refundAmount: determinedCase.refundAmount ?? undefined,
        creditAmount: determinedCase.creditAmount ?? undefined,
      });
      const realizedSavings = (determinedCase.refundAmount ?? 0) + (determinedCase.creditAmount ?? 0);
      if (realizedSavings > 0) {
        track('savings_verified', {
          tool: 'property-tax',
          amountUsd: realizedSavings,
          propertyId,
        });
      }
      track('workflow_completed', { tool: 'property-tax', propertyId });
    } catch (cause: unknown) {
      setRecordError(cause instanceof Error
        ? cause.message
        : 'Failed to record appeal determination');
    } finally {
      setAppealCaseBusy(false);
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

  useEffect(() => {
    if (previousStageRef.current !== activeStage) {
      stageHeadingRef.current?.focus();
      previousStageRef.current = activeStage;
    }
  }, [activeStage]);

  useEffect(() => {
    if (!requestedCaseId) return;
    const requestedCase = appealCases.find((appealCase) => appealCase.id === requestedCaseId);
    if (!requestedCase || requestedCase.id === activeAppealCaseId) return;
    openAppealCase(requestedCase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appealCases, requestedCaseId]);

  const invalidAssessedValue = Boolean(assessedValue) && !Number.isFinite(Number(assessedValue));
  const invalidTaxRate = Boolean(taxRate) && !Number.isFinite(Number(taxRate));
  const invalidBillAmount = Boolean(billAmount) && !Number.isFinite(Number(billAmount));
  const invalidTaxYear = !Number.isInteger(Number(taxYear))
    || Number(taxYear) < 1900
    || Number(taxYear) > new Date().getFullYear() + 2;
  const hasReportedValue = Boolean(parcelId.trim() || assessedValue || taxRate || billAmount);
  const activeAppealCase = appealCases.find(
    (appealCase) => appealCase.id === activeAppealCaseId,
  ) ?? null;
  const missingFacts = [
    record?.parcel.fields.parcelId?.state !== 'KNOWN' && 'parcel ID',
    record?.assessment.fields.totalAssessedValue?.state !== 'KNOWN' && 'assessed value',
    record?.assessment.fields.taxableValue?.state !== 'KNOWN' && 'taxable value',
    record?.assessment.fields.classification?.state !== 'KNOWN' && 'classification',
    record?.bill.fields.billAmount?.state !== 'KNOWN' && 'bill amount',
    record?.bill.fields.dueDates?.state !== 'KNOWN' && 'bill due dates',
  ].filter((value): value is string => Boolean(value));
  const datedSourceRecords = Array.from(new Map(
    [...(record?.assessment.sourceRecords ?? []), ...(record?.bill.sourceRecords ?? [])]
      .map((sourceRecord) => [sourceRecord.id, sourceRecord]),
  ).values());
  const activeMaterialAppeal = appealCases.find((appealCase) => !['CLOSED', 'WITHDRAWN'].includes(appealCase.status));
  const dueDeadline = rules?.deadlines.find((deadline) => ['DUE_SOON', 'OPEN'].includes(deadline.status));
  const nextAction = recordLoading
    ? {
        title: 'Checking your property-tax record',
        why: 'The next action will appear after sources, deadlines, and active cases load.',
        stage: 'overview' as PropertyTaxStage,
        cta: 'Stay on overview',
      }
    : record?.conflicts.length
      ? {
          title: `Resolve ${record.conflicts.length} conflicting ${record.conflicts.length === 1 ? 'fact' : 'facts'}`,
          why: 'Sources disagree, so calculations and filing preparation should wait until the conflicting values are reviewed.',
          stage: 'changes' as PropertyTaxStage,
          cta: 'Review conflicts',
        }
      : activeMaterialAppeal
        ? {
            title: `Continue ${activeMaterialAppeal.title}`,
            why: `This case is ${activeMaterialAppeal.status.toLowerCase().replaceAll('_', ' ')} and has an unfinished external outcome.`,
            stage: 'appeal' as PropertyTaxStage,
            cta: 'Continue appeal case',
          }
        : dueDeadline
          ? {
              title: `Verify ${dueDeadline.label}`,
              why: dueDeadline.dueLocalDate
                ? `The reviewed rule lists ${dueDeadline.dueLocalDate} at ${dueDeadline.cutoffLocalTime} ${dueDeadline.timezone}; confirm it with the authority before relying on it.`
                : 'The reviewed rule needs an exact notice date or eligibility fact before a deadline can be calculated.',
              stage: 'appeal' as PropertyTaxStage,
              cta: 'Review deadline',
            }
          : missingFacts.length
            ? {
                title: `Confirm ${missingFacts.slice(0, 2).join(' and ')}`,
                why: `These facts are missing from the sourced record${missingFacts.length > 2 ? `, along with ${missingFacts.length - 2} more` : ''}. They are needed to understand the bill and assess the right path.`,
                stage: 'review' as PropertyTaxStage,
                cta: 'Verify a document',
              }
            : {
                title: 'Review the current bill and assessment',
                why: 'No urgent conflict, reviewed deadline, or active appeal case is currently surfaced.',
                stage: 'bill' as PropertyTaxStage,
                cta: 'Review bill',
              };

  function stageHref(stage: PropertyTaxStage, caseId?: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('mode');
    nextParams.set('stage', stage);
    if (caseId) nextParams.set('caseId', caseId);
    const query = nextParams.toString();
    return `/dashboard/properties/${propertyId}/tools/property-tax${query ? `?${query}` : ''}`;
  }

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

      <a
        href="#property-tax-stage-content"
        className="sr-only rounded-lg bg-slate-950 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:outline-none focus:ring-4 focus:ring-sky-400"
      >
        Skip to property-tax stage content
      </a>

      <nav
        aria-label="Property Tax Center stages"
        className="flex snap-x gap-2 overflow-x-auto pb-2 motion-reduce:scroll-auto"
      >
        {PROPERTY_TAX_STAGES.map((stage) => {
          const selected = stage.id === activeStage;
          return (
            <Link
              key={stage.id}
              href={stageHref(stage.id)}
              aria-current={selected ? 'page' : undefined}
              style={{ display: 'inline-flex', minHeight: 44 }}
              className={`inline-flex min-h-11 shrink-0 snap-start items-center rounded-full border px-4 py-2 text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-sky-400 ${
                selected
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {stage.label}
            </Link>
          );
        })}
      </nav>

      <div id="property-tax-stage-content">
        <h2
          ref={stageHeadingRef}
          tabIndex={-1}
          className="text-xl font-semibold capitalize text-slate-950 outline-none focus-visible:ring-4 focus-visible:ring-sky-400 dark:text-white"
        >
          {activeStage} stage
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          One focused step at a time. Your property, Radar event, match, action, and case context stay attached as you move between stages.
        </p>
      </div>

      <section
        aria-labelledby="property-tax-next-action"
        aria-live="polite"
        className="rounded-2xl border border-sky-200 bg-sky-50/85 p-5 shadow-sm dark:border-sky-800 dark:bg-sky-950/30"
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
          What matters now
        </div>
        <h2 id="property-tax-next-action" className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
          {nextAction.title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-700 dark:text-slate-200">{nextAction.why}</p>
        <Link
          href={stageHref(nextAction.stage, activeMaterialAppeal?.id)}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-sky-900 px-4 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-4 focus-visible:ring-sky-400 dark:bg-sky-200 dark:text-sky-950"
        >
          {nextAction.cta}
        </Link>
      </section>

      <section
        aria-labelledby="property-tax-source-legend"
        className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
      >
        <h2 id="property-tax-source-legend" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          How to read these values
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
            <strong className="block">Official</strong>
            Fetched from a reviewed assessor or collector source with its observed date and match method.
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
            <strong className="block">Confirmed</strong>
            Verified from a Vault document or explicitly saved by the homeowner; it is not relabeled as official.
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            <strong className="block">Estimated</strong>
            A planning calculation only. It cannot establish history, appeal merit, a deadline, or expected savings.
          </div>
        </div>
      </section>

      {(activeStage === 'overview' || activeStage === 'changes') && (
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
      )}

      {(activeStage === 'overview' || activeStage === 'bill' || activeStage === 'changes') && (
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
      )}

      {activeStage === 'review' && (
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
      )}

      {(activeStage === 'exemptions' || activeStage === 'review') && (
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
      )}

      {activeStage === 'changes' && (
        <section
          aria-labelledby="property-tax-changes-heading"
          className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
        >
          <h2 id="property-tax-changes-heading" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Observed changes and conflicts
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            These are dated source records and field observations. The center does not infer a historical change from an estimate or from two unmatched records.
          </p>

          {record?.conflicts.length ? (
            <div className="mt-4 space-y-4">
              {record.conflicts.map((conflict) => (
                <article key={conflict.fieldKey} className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                  <h3 className="font-semibold text-amber-950 dark:text-amber-100">{conflict.fieldKey}</h3>
                  <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
                    No value was selected automatically because these active observations disagree.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {conflict.observations.map((observation) => (
                      <li key={observation.id} className="rounded-lg border border-amber-200 bg-white/70 p-3 text-sm dark:border-amber-800 dark:bg-slate-950/30">
                        <div className="font-medium">{String(observation.value)}</div>
                        <div className="mt-1 text-xs">
                          {observation.sourceType.replaceAll('_', ' ')} · {observation.reviewStatus.replaceAll('_', ' ')} · observed {new Date(observation.observedAt).toLocaleDateString()}
                        </div>
                        {observation.sourceUrl && (
                          <a href={observation.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center font-semibold underline outline-none focus-visible:ring-4 focus-visible:ring-sky-400">
                            Open source record
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
              No unresolved source conflicts are currently stored.
            </div>
          )}

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Dated source records</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {datedSourceRecords.map((sourceRecord) => (
                <article key={sourceRecord.id} className="rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {sourceRecord.sourceType.replaceAll('_', ' ')} · tax year {sourceRecord.taxYear}
                  </div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {sourceRecord.stage ?? 'Stage unknown'} · observed {new Date(sourceRecord.observedAt).toLocaleDateString()} · {sourceRecord.confidence.toLowerCase()} confidence
                  </div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Match context: {sourceRecord.sourceExternalId ?? sourceRecord.radarProviderEventId ?? 'No external match identifier'}
                  </div>
                  {sourceRecord.sourceUrl && (
                    <a href={sourceRecord.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center font-semibold underline outline-none focus-visible:ring-4 focus-visible:ring-sky-400">
                      Verify source
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

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

          <div className="mt-5 rounded-xl border border-sky-300 bg-sky-50/80 p-4 text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Appeal case, packet, and tracking</h3>
                <p className="mt-1 text-xs">
                  Resume preparation here. Contract to Cozy does not submit the official form; filing is recorded only after you confirm the external submission.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void startAppealCase()}
                disabled={appealCaseBusy || appealReadiness?.status !== 'READY'}
                className="min-h-11 rounded-xl bg-sky-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-200 dark:text-sky-950"
              >
                Start or resume ready case
              </button>
            </div>

            {appealCases.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {appealCases.map((appealCase) => (
                  <button
                    key={appealCase.id}
                    type="button"
                    onClick={() => openAppealCase(appealCase)}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-left text-xs ${
                      activeAppealCaseId === appealCase.id
                        ? 'border-sky-900 bg-sky-900 text-white dark:border-sky-200 dark:bg-sky-200 dark:text-sky-950'
                        : 'border-sky-300 bg-white/70 dark:border-sky-800 dark:bg-slate-950/30'
                    }`}
                  >
                    <span className="block font-semibold">{appealCase.title}</span>
                    <span>{appealCase.status} · {appealCase.taxYear ?? 'tax year pending'}</span>
                  </button>
                ))}
              </div>
            )}

            {activeAppealCase && activeAppealCase.packet && (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-white/70 p-3 dark:border-sky-800/70 dark:bg-slate-950/35">
                  <div>
                    <div className="font-semibold">{activeAppealCase.title}</div>
                    <div className="mt-1 text-xs">
                      Case {activeAppealCase.status} · packet {activeAppealCase.packet.status} · reviewed rule v{activeAppealCase.ruleProfile.version}
                    </div>
                  </div>
                  <a
                    href={activeAppealCase.officialFormUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center font-semibold underline"
                  >
                    Open official {activeAppealCase.formCode ?? 'form'} instructions
                  </a>
                </div>

                {!['FILED', 'AWAITING_RESPONSE', 'RESPONSE_RECEIVED', 'HEARING_SCHEDULED', 'DETERMINED', 'CLOSED', 'WITHDRAWN'].includes(activeAppealCase.status) && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-sky-200 p-4 dark:border-sky-800/70">
                      <h4 className="text-sm font-semibold">Evidence-grounded editable narrative</h4>
                      <p className="mt-1 text-xs">
                        Initial mode: deterministic manual draft. No tax evidence is sent to an AI provider.
                      </p>
                      <textarea
                        value={packetNarrative}
                        onChange={(event) => setPacketNarrative(event.target.value)}
                        className="mt-3 min-h-52 w-full rounded-xl border border-sky-300 bg-white p-3 text-sm text-slate-900 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <div className="mt-3 text-xs">
                        Evidence citations: {(activeAppealCase.packet.narrativeEvidenceJson.evidenceIds ?? []).length} record(s) · {(activeAppealCase.packet.narrativeEvidenceJson.comparableIds ?? []).length} comparable(s)
                      </div>
                    </div>

                    <div className="rounded-xl border border-sky-200 p-4 dark:border-sky-800/70">
                      <h4 className="text-sm font-semibold">Resolve packet placeholders</h4>
                      <div className="mt-3 grid gap-2">
                        {[...new Set([
                          ...activeAppealCase.packet.unresolvedPlaceholdersJson,
                          ...Object.keys(activeAppealCase.packet.placeholderValuesJson),
                        ])].map((placeholder) => (
                          <label key={placeholder} className="text-xs font-semibold">
                            {placeholder.replaceAll('_', ' ').toLowerCase()}
                            <input
                              value={packetPlaceholders[placeholder] ?? ''}
                              onChange={(event) => setPacketPlaceholders((current) => ({
                                ...current,
                                [placeholder]: event.target.value,
                              }))}
                              className="mt-1 min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-sm text-slate-900 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100"
                            />
                          </label>
                        ))}
                      </div>
                      <h4 className="mt-4 text-sm font-semibold">Packet checklist</h4>
                      <div className="mt-2 space-y-2">
                        {activeAppealCase.packet.checklistJson.map((item) => (
                          <label key={item.code} className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={packetChecklist.includes(item.code)}
                              onChange={(event) => setPacketChecklist((current) =>
                                event.target.checked
                                  ? [...new Set([...current, item.code])]
                                  : current.filter((code) => code !== item.code)
                              )}
                              className="mt-0.5 h-4 w-4"
                            />
                            {item.label}
                          </label>
                        ))}
                      </div>
                      <label className="mt-4 flex items-start gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={packetReviewed}
                          onChange={(event) => setPacketReviewed(event.target.checked)}
                          className="mt-0.5 h-4 w-4"
                        />
                        I reviewed the narrative, citations, current official form, and unresolved fields.
                      </label>
                      <button
                        type="button"
                        onClick={() => void saveAppealPacket(activeAppealCase.id)}
                        disabled={appealCaseBusy || packetNarrative.trim().length < 50}
                        className="mt-4 min-h-11 rounded-xl bg-sky-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-200 dark:text-sky-950"
                      >
                        Save packet progress
                      </button>
                    </div>
                  </div>
                )}

                {activeAppealCase.status === 'PACKET_READY' && (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                    <h4 className="font-semibold">Confirm external filing</h4>
                    <p className="mt-1 text-xs">
                      Submit through the official authority first. Then record the receipt, confirmation number, or other external reference here.
                    </p>
                    <input
                      value={filingReference}
                      onChange={(event) => setFilingReference(event.target.value)}
                      placeholder="External filing confirmation reference"
                      className="mt-3 min-h-11 w-full rounded-xl border border-emerald-300 bg-white px-3 text-sm text-slate-900 dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => void confirmAppealFiled(activeAppealCase.id)}
                      disabled={appealCaseBusy || !filingReference.trim()}
                      className="mt-3 min-h-11 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Record externally filed now
                    </button>
                  </div>
                )}

                {activeAppealCase.filedAt && !['CLOSED', 'WITHDRAWN'].includes(activeAppealCase.status) && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-sky-200 p-4 dark:border-sky-800/70">
                      <h4 className="text-sm font-semibold">Response or hearing</h4>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <select
                          value={trackingType}
                          onChange={(event) => setTrackingType(event.target.value as typeof trackingType)}
                          className="min-h-11 rounded-xl border border-sky-300 bg-white px-3 text-sm text-slate-900 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="RESPONSE_RECEIVED">Response received</option>
                          <option value="HEARING_SCHEDULED">Hearing scheduled</option>
                        </select>
                        <input
                          type="datetime-local"
                          value={trackingAt}
                          onChange={(event) => setTrackingAt(event.target.value)}
                          className="min-h-11 rounded-xl border border-sky-300 bg-white px-3 text-sm text-slate-900 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <textarea
                          value={trackingSummary}
                          onChange={(event) => setTrackingSummary(event.target.value)}
                          placeholder="Response or hearing summary"
                          className="min-h-24 rounded-xl border border-sky-300 bg-white p-3 text-sm text-slate-900 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100 sm:col-span-2"
                        />
                        {trackingType === 'HEARING_SCHEDULED' && (
                          <input
                            value={hearingLocation}
                            onChange={(event) => setHearingLocation(event.target.value)}
                            placeholder="Hearing location or access instructions"
                            className="min-h-11 rounded-xl border border-sky-300 bg-white px-3 text-sm text-slate-900 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100 sm:col-span-2"
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void addAppealTrackingEvent(activeAppealCase.id)}
                        disabled={appealCaseBusy || !trackingAt || !trackingSummary.trim()}
                        className="mt-3 min-h-11 rounded-xl border border-sky-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      >
                        Record case event
                      </button>
                    </div>

                    <div className="rounded-xl border border-sky-200 p-4 dark:border-sky-800/70">
                      <h4 className="text-sm font-semibold">Case reminders</h4>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input
                          value={reminderTitle}
                          onChange={(event) => setReminderTitle(event.target.value)}
                          placeholder="Reminder title"
                          className="min-h-11 rounded-xl border border-sky-300 bg-white px-3 text-sm text-slate-900 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <input
                          type="date"
                          value={reminderDueDate}
                          onChange={(event) => setReminderDueDate(event.target.value)}
                          className="min-h-11 rounded-xl border border-sky-300 bg-white px-3 text-sm text-slate-900 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void addAppealReminder(activeAppealCase.id)}
                        disabled={appealCaseBusy || !reminderTitle.trim() || !reminderDueDate}
                        className="mt-3 min-h-11 rounded-xl border border-sky-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      >
                        Save reminder
                      </button>
                      <div className="mt-3 space-y-2">
                        {activeAppealCase.reminders.map((reminder) => (
                          <div key={reminder.id} className="rounded-lg border border-sky-200 p-2 text-xs dark:border-sky-800/70">
                            <div className="font-semibold">{reminder.title}</div>
                            <div>{new Date(reminder.dueAt).toLocaleDateString()} · {reminder.status}</div>
                            {reminder.status === 'PENDING' && (
                              <div className="mt-2 flex gap-2">
                                <button type="button" onClick={() => void finishAppealReminder(activeAppealCase.id, reminder.id, 'COMPLETED')} className="underline">Complete</button>
                                <button type="button" onClick={() => void finishAppealReminder(activeAppealCase.id, reminder.id, 'DISMISSED')} className="underline">Dismiss</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeAppealCase.filedAt && !['CLOSED', 'WITHDRAWN'].includes(activeAppealCase.status) && (
                  <div className="rounded-xl border border-violet-300 bg-violet-50 p-4 text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
                    <h4 className="font-semibold">Record determination and realized outcome</h4>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <select
                        value={determination}
                        onChange={(event) => setDetermination(event.target.value as typeof determination)}
                        className="min-h-11 rounded-xl border border-violet-300 bg-white px-3 text-sm text-slate-900 dark:border-violet-800 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="REDUCED">Assessment reduced</option>
                        <option value="UPHELD">Assessment upheld</option>
                        <option value="CLASS_CHANGED">Tax class changed</option>
                        <option value="EXEMPTION_ADJUSTED">Exemption adjusted</option>
                        <option value="PARTIAL">Partial relief</option>
                        <option value="WITHDRAWN">Withdrawn</option>
                        <option value="OTHER">Other</option>
                      </select>
                      <input value={determinationReference} onChange={(event) => setDeterminationReference(event.target.value)} placeholder="Decision reference" className="min-h-11 rounded-xl border border-violet-300 bg-white px-3 text-sm text-slate-900 dark:border-violet-800 dark:bg-slate-900 dark:text-slate-100" />
                      <input inputMode="decimal" value={determinationFinalValue} onChange={(event) => setDeterminationFinalValue(event.target.value)} placeholder="Final assessed value" className="min-h-11 rounded-xl border border-violet-300 bg-white px-3 text-sm text-slate-900 dark:border-violet-800 dark:bg-slate-900 dark:text-slate-100" />
                      <input inputMode="decimal" value={determinationRefund} onChange={(event) => setDeterminationRefund(event.target.value)} placeholder="Refund amount" className="min-h-11 rounded-xl border border-violet-300 bg-white px-3 text-sm text-slate-900 dark:border-violet-800 dark:bg-slate-900 dark:text-slate-100" />
                      <input inputMode="decimal" value={determinationCredit} onChange={(event) => setDeterminationCredit(event.target.value)} placeholder="Credit amount" className="min-h-11 rounded-xl border border-violet-300 bg-white px-3 text-sm text-slate-900 dark:border-violet-800 dark:bg-slate-900 dark:text-slate-100" />
                      <textarea value={determinationSummary} onChange={(event) => setDeterminationSummary(event.target.value)} placeholder="Decision summary" className="min-h-24 rounded-xl border border-violet-300 bg-white p-3 text-sm text-slate-900 dark:border-violet-800 dark:bg-slate-900 dark:text-slate-100 md:col-span-3" />
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" checked={determinationClose} onChange={(event) => setDeterminationClose(event.target.checked)} />
                      Close the case after recording this determination
                    </label>
                    <button
                      type="button"
                      onClick={() => void saveAppealDetermination(activeAppealCase.id)}
                      disabled={appealCaseBusy || !determinationReference.trim() || !determinationSummary.trim()}
                      className="mt-3 min-h-11 rounded-xl bg-violet-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Record determination
                    </button>
                  </div>
                )}

                <div className="rounded-xl border border-sky-200 p-4 dark:border-sky-800/70">
                  <h4 className="text-sm font-semibold">Case history and Home Timeline</h4>
                  <div className="mt-3 space-y-2">
                    {activeAppealCase.events.map((event) => (
                      <div key={event.id} className="border-l-2 border-sky-400 pl-3 text-sm">
                        <div className="font-semibold">{event.summary}</div>
                        <div className="text-xs">{new Date(event.occurredAt).toLocaleString()} · {event.type}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {activeStage === 'history' && (
        <section
          aria-labelledby="property-tax-history-heading"
          className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
        >
          <h2 id="property-tax-history-heading" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Property-tax history
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            A dated audit trail of documents, homeowner decisions, appeal events, and recorded outcomes. Planning estimates are intentionally excluded.
          </p>

          <div className="mt-5 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Vault documents</h3>
              <div className="mt-2 space-y-2">
                {intakes.length ? intakes.map((intake) => (
                  <div key={intake.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <div className="font-semibold">{intake.document.name}</div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {intake.kind.replaceAll('_', ' ')} · {intake.status.replaceAll('_', ' ')} · added {new Date(intake.createdAt).toLocaleString()}
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300">No property-tax documents have been added.</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Exemption and correction decisions</h3>
              <div className="mt-2 space-y-2">
                {taxActions?.actions.some((action) => action.decidedAt || action.completedAt)
                  ? taxActions.actions.filter((action) => action.decidedAt || action.completedAt).map((action) => (
                    <div key={action.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                      <div className="font-semibold">{action.title}</div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {action.status.replaceAll('_', ' ')} · {new Date(action.completedAt ?? action.decidedAt ?? '').toLocaleString()}
                      </div>
                    </div>
                  ))
                  : <p className="text-sm text-slate-600 dark:text-slate-300">No homeowner decisions have been recorded.</p>}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Appeal cases and outcomes</h3>
              <div className="mt-2 space-y-3">
                {appealCases.length ? appealCases.map((appealCase) => (
                  <article key={appealCase.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-slate-100">{appealCase.title}</h4>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {appealCase.status.replaceAll('_', ' ')} · created {new Date(appealCase.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Link
                        href={stageHref('appeal', appealCase.id)}
                        className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-sky-400 dark:border-slate-700"
                      >
                        Open case
                      </Link>
                    </div>
                    {appealCase.determination && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                        {appealCase.determination.replaceAll('_', ' ')} · {appealCase.determinationSummary ?? 'No determination summary'}
                        {(appealCase.refundAmount || appealCase.creditAmount) && (
                          <div className="mt-1 text-xs">
                            Realized refund {money(appealCase.refundAmount)} · credit {money(appealCase.creditAmount)}
                          </div>
                        )}
                      </div>
                    )}
                    <ol className="mt-3 space-y-2">
                      {appealCase.events.map((event) => (
                        <li key={event.id} className="border-l-2 border-sky-400 pl-3 text-sm">
                          <div className="font-medium">{event.summary}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            {new Date(event.occurredAt).toLocaleString()} · {event.type.replaceAll('_', ' ')}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </article>
                )) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300">No appeal cases have been started.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeStage === 'overview' && (
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
      )}

      {activeStage === 'bill' && (
      <>
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
          href={stageHref('appeal')}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-slate-900 px-4 font-medium text-white outline-none focus-visible:ring-4 focus-visible:ring-sky-400 dark:bg-white dark:text-slate-900"
        >
          Review appeal readiness
        </Link>
      </section>
      </>
      )}
    </ToolWorkspaceTemplate>
  );
}
