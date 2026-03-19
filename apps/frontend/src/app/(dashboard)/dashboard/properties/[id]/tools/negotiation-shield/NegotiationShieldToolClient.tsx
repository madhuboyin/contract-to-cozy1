'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Clipboard,
  ClipboardCheck,
  FileText,
  HandCoins,
  Loader2,
  Plus,
  RefreshCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react';
import HomeToolsRail from '@/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobilePageContainer,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { DocumentType, Property } from '@/types';
import {
  analyzeNegotiationShieldCase,
  attachNegotiationShieldDocument,
  createNegotiationShieldCase,
  getNegotiationShieldCaseDetail,
  listNegotiationShieldCases,
  parseNegotiationShieldCaseDocument,
  saveNegotiationShieldInput,
  type CreateNegotiationShieldCasePayload,
  type NegotiationShieldAnalysis,
  type NegotiationShieldCaseDetail,
  type NegotiationShieldCaseScenarioType,
  type NegotiationShieldCaseStatus,
  type NegotiationShieldDocument,
  type NegotiationShieldDocumentType,
  type NegotiationShieldDraft,
  type NegotiationShieldInput,
  type NegotiationShieldInputType,
  type NegotiationShieldPricingAssessment,
  type NegotiationShieldSourceType,
  type SaveNegotiationShieldInputPayload,
} from './negotiationShieldApi';

type ScenarioRouteValue =
  | 'contractor-quote-review'
  | 'insurance-premium-increase'
  | 'insurance-claim-settlement'
  | 'buyer-inspection-negotiation'
  | 'contractor-urgency-pressure';
type ContractorFormValues = {
  contractorName: string;
  quoteAmount: string;
  quoteDate: string;
  serviceCategory: string;
  systemCategory: string;
  urgencyClaimed: 'unknown' | 'yes' | 'no';
  notes: string;
  rawText: string;
};
type InsuranceFormValues = {
  insurerName: string;
  priorPremium: string;
  newPremium: string;
  renewalDate: string;
  reasonProvided: string;
  notes: string;
  rawText: string;
};
type ClaimSettlementFormValues = {
  insurerName: string;
  claimType: string;
  settlementAmount: string;
  estimateAmount: string;
  claimDate: string;
  reasonProvided: string;
  notes: string;
  rawText: string;
};
type BuyerInspectionFormValues = {
  requestedConcessionAmount: string;
  inspectionIssuesSummary: string;
  requestedRepairs: string;
  recentUpgradeNotes: string;
  reportDate: string;
  notes: string;
  rawText: string;
};
type ContractorUrgencyFormValues = {
  contractorName: string;
  recommendedWork: string;
  urgencyClaimed: 'unknown' | 'yes' | 'no';
  sameDayPressure: 'unknown' | 'yes' | 'no';
  quoteAmount: string;
  repairOptionMentioned: 'unknown' | 'yes' | 'no';
  notes: string;
  rawText: string;
};

type InlineFeedbackState = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

const SCENARIO_OPTIONS: Array<{
  routeValue: ScenarioRouteValue;
  scenarioType: NegotiationShieldCaseScenarioType;
  label: string;
  shortDescription: string;
  Icon: typeof ShieldCheck;
}> = [
  {
    routeValue: 'contractor-quote-review',
    scenarioType: 'CONTRACTOR_QUOTE_REVIEW',
    label: 'Contractor quote review',
    shortDescription: 'Review a contractor estimate, surface leverage, and draft a response before you approve the work.',
    Icon: Wrench,
  },
  {
    routeValue: 'insurance-premium-increase',
    scenarioType: 'INSURANCE_PREMIUM_INCREASE',
    label: 'Insurance premium increase',
    shortDescription: 'Review a renewal jump, identify property-backed leverage, and prepare a firm request for review.',
    Icon: Shield,
  },
  {
    routeValue: 'insurance-claim-settlement',
    scenarioType: 'INSURANCE_CLAIM_SETTLEMENT',
    label: 'Insurance claim settlement',
    shortDescription: 'Compare a settlement against your repair estimate, surface leverage, and draft a review request.',
    Icon: HandCoins,
  },
  {
    routeValue: 'buyer-inspection-negotiation',
    scenarioType: 'BUYER_INSPECTION_NEGOTIATION',
    label: 'Buyer inspection negotiation',
    shortDescription: 'Review inspection-driven concession requests and prepare a calm, specific counter-response.',
    Icon: ClipboardCheck,
  },
  {
    routeValue: 'contractor-urgency-pressure',
    scenarioType: 'CONTRACTOR_URGENCY_PRESSURE',
    label: 'Contractor urgency pressure',
    shortDescription: 'Review same-day pressure, request evidence, and prepare a careful response before approving work.',
    Icon: AlertTriangle,
  },
];

const DOCUMENT_TYPE_OPTIONS: Array<{
  value: NegotiationShieldDocumentType;
  label: string;
}> = [
  { value: 'QUOTE', label: 'Quote or estimate' },
  { value: 'PREMIUM_NOTICE', label: 'Premium notice' },
  { value: 'CLAIM_SETTLEMENT_NOTICE', label: 'Claim settlement notice' },
  { value: 'CLAIM_ESTIMATE', label: 'Repair estimate' },
  { value: 'INSPECTION_REPORT', label: 'Inspection report' },
  { value: 'BUYER_REQUEST', label: 'Buyer request' },
  { value: 'CONTRACTOR_RECOMMENDATION', label: 'Contractor recommendation' },
  { value: 'CONTRACTOR_ESTIMATE', label: 'Contractor estimate' },
  { value: 'SUPPORTING_DOCUMENT', label: 'Supporting document' },
];

const CONTRACTOR_DEFAULTS: ContractorFormValues = {
  contractorName: '',
  quoteAmount: '',
  quoteDate: '',
  serviceCategory: '',
  systemCategory: '',
  urgencyClaimed: 'unknown',
  notes: '',
  rawText: '',
};

const INSURANCE_DEFAULTS: InsuranceFormValues = {
  insurerName: '',
  priorPremium: '',
  newPremium: '',
  renewalDate: '',
  reasonProvided: '',
  notes: '',
  rawText: '',
};

const CLAIM_SETTLEMENT_DEFAULTS: ClaimSettlementFormValues = {
  insurerName: '',
  claimType: '',
  settlementAmount: '',
  estimateAmount: '',
  claimDate: '',
  reasonProvided: '',
  notes: '',
  rawText: '',
};

const BUYER_INSPECTION_DEFAULTS: BuyerInspectionFormValues = {
  requestedConcessionAmount: '',
  inspectionIssuesSummary: '',
  requestedRepairs: '',
  recentUpgradeNotes: '',
  reportDate: '',
  notes: '',
  rawText: '',
};

const CONTRACTOR_URGENCY_DEFAULTS: ContractorUrgencyFormValues = {
  contractorName: '',
  recommendedWork: '',
  urgencyClaimed: 'unknown',
  sameDayPressure: 'unknown',
  quoteAmount: '',
  repairOptionMentioned: 'unknown',
  notes: '',
  rawText: '',
};

const SECTION_CARD_CLASS = 'rounded-2xl border-border/80 shadow-sm';
const SECTION_HEADER_CLASS = 'space-y-3 p-4 sm:p-6';
const SECTION_CONTENT_CLASS = 'p-4 pt-0 sm:p-6 sm:pt-0';

function asStringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function getScenarioOptionByRouteValue(routeValue: string | null) {
  return SCENARIO_OPTIONS.find((option) => option.routeValue === routeValue) ?? SCENARIO_OPTIONS[0];
}

function getScenarioOptionByType(scenarioType: NegotiationShieldCaseScenarioType) {
  return SCENARIO_OPTIONS.find((option) => option.scenarioType === scenarioType) ?? SCENARIO_OPTIONS[0];
}

function formatScenarioLabel(scenarioType: NegotiationShieldCaseScenarioType) {
  return getScenarioOptionByType(scenarioType).label;
}

function formatStatusLabel(status: NegotiationShieldCaseStatus) {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'READY_FOR_REVIEW':
      return 'Ready for review';
    case 'ANALYZED':
      return 'Analyzed';
    case 'ARCHIVED':
      return 'Archived';
    default:
      return status;
  }
}

function getStatusVariant(status: NegotiationShieldCaseStatus): 'outline' | 'secondary' | 'success' {
  if (status === 'ANALYZED') return 'success';
  if (status === 'READY_FOR_REVIEW') return 'secondary';
  return 'outline';
}

function formatSourceLabel(sourceType: NegotiationShieldSourceType) {
  switch (sourceType) {
    case 'MANUAL':
      return 'Manual';
    case 'DOCUMENT_UPLOAD':
      return 'Document upload';
    case 'HYBRID':
      return 'Hybrid';
    default:
      return sourceType;
  }
}

function formatDocumentTypeLabel(documentType: NegotiationShieldDocumentType) {
  return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === documentType)?.label ?? documentType;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Unavailable';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatDateInput(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatNumberInput(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return '';
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasMeaningfulValue);
  return false;
}

function countMeaningfulFields(data: Record<string, unknown>) {
  return Object.entries(data).filter(([key, value]) => key !== '_meta' && hasMeaningfulValue(value)).length;
}

function hasMeaningfulText(value: string | null | undefined, minLength = 20) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getInputMode(sourceType: NegotiationShieldSourceType): 'manual' | 'upload' | 'hybrid' {
  if (sourceType === 'HYBRID') return 'hybrid';
  if (sourceType === 'DOCUMENT_UPLOAD') return 'upload';
  return 'manual';
}

function upsertCaseSummary(
  current: NegotiationShieldCaseDetail['case'][] | undefined,
  nextCase: NegotiationShieldCaseDetail['case']
) {
  const existing = current ?? [];
  const next = [...existing.filter((item) => item.id !== nextCase.id), nextCase];

  return next.sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt).getTime();
    return rightTime - leftTime;
  });
}

function mapCaseDocumentToUploadType(documentType: NegotiationShieldDocumentType): DocumentType {
  switch (documentType) {
    case 'QUOTE':
    case 'CLAIM_ESTIMATE':
    case 'CONTRACTOR_ESTIMATE':
      return 'ESTIMATE';
    case 'PREMIUM_NOTICE':
    case 'CLAIM_SETTLEMENT_NOTICE':
      return 'INSURANCE_CERTIFICATE';
    case 'INSPECTION_REPORT':
      return 'INSPECTION_REPORT';
    case 'BUYER_REQUEST':
    case 'CONTRACTOR_RECOMMENDATION':
    case 'SUPPORTING_DOCUMENT':
      return 'OTHER';
    default:
      return 'OTHER';
  }
}

function getInputTypeForScenario(scenarioType: NegotiationShieldCaseScenarioType): NegotiationShieldInputType {
  switch (scenarioType) {
    case 'CONTRACTOR_QUOTE_REVIEW':
      return 'CONTRACTOR_QUOTE';
    case 'INSURANCE_PREMIUM_INCREASE':
      return 'INSURANCE_PREMIUM';
    case 'INSURANCE_CLAIM_SETTLEMENT':
      return 'INSURANCE_CLAIM_SETTLEMENT';
    case 'BUYER_INSPECTION_NEGOTIATION':
      return 'BUYER_INSPECTION';
    case 'CONTRACTOR_URGENCY_PRESSURE':
      return 'CONTRACTOR_URGENCY';
    default:
      return 'CONTRACTOR_QUOTE';
  }
}

function getDefaultDocumentTypeForScenario(
  scenarioType: NegotiationShieldCaseScenarioType
): NegotiationShieldDocumentType {
  switch (scenarioType) {
    case 'CONTRACTOR_QUOTE_REVIEW':
      return 'QUOTE';
    case 'INSURANCE_PREMIUM_INCREASE':
      return 'PREMIUM_NOTICE';
    case 'INSURANCE_CLAIM_SETTLEMENT':
      return 'CLAIM_SETTLEMENT_NOTICE';
    case 'BUYER_INSPECTION_NEGOTIATION':
      return 'INSPECTION_REPORT';
    case 'CONTRACTOR_URGENCY_PRESSURE':
      return 'CONTRACTOR_RECOMMENDATION';
    default:
      return 'SUPPORTING_DOCUMENT';
  }
}

function getAnalysisActionLabel(scenarioType: NegotiationShieldCaseScenarioType) {
  switch (scenarioType) {
    case 'CONTRACTOR_QUOTE_REVIEW':
      return 'Analyze quote';
    case 'INSURANCE_PREMIUM_INCREASE':
      return 'Review premium increase';
    case 'INSURANCE_CLAIM_SETTLEMENT':
      return 'Review settlement';
    case 'BUYER_INSPECTION_NEGOTIATION':
      return 'Review buyer request';
    case 'CONTRACTOR_URGENCY_PRESSURE':
      return 'Check urgency pressure';
    default:
      return 'Run analysis';
  }
}

function getEmptyStateDescription(scenarioType: NegotiationShieldCaseScenarioType) {
  switch (scenarioType) {
    case 'CONTRACTOR_QUOTE_REVIEW':
      return 'Add quote details or upload the estimate to surface leverage before you reply.';
    case 'INSURANCE_PREMIUM_INCREASE':
      return 'Add renewal details or upload the notice to prepare a stronger review request.';
    case 'INSURANCE_CLAIM_SETTLEMENT':
      return 'Add settlement details or upload the letter and estimate to compare the numbers before you reply.';
    case 'BUYER_INSPECTION_NEGOTIATION':
      return 'Add the buyer request or upload the inspection report so you can narrow the response clearly.';
    case 'CONTRACTOR_URGENCY_PRESSURE':
      return 'Add the recommendation or upload the contractor write-up to evaluate the urgency before approving work.';
    default:
      return 'Add case details or upload a document to continue.';
  }
}

function getCreateTitlePlaceholder(scenarioType: NegotiationShieldCaseScenarioType) {
  switch (scenarioType) {
    case 'CONTRACTOR_QUOTE_REVIEW':
      return 'Example: Roof replacement estimate review';
    case 'INSURANCE_PREMIUM_INCREASE':
      return 'Example: Homeowners premium increase review';
    case 'INSURANCE_CLAIM_SETTLEMENT':
      return 'Example: Storm claim settlement review';
    case 'BUYER_INSPECTION_NEGOTIATION':
      return 'Example: Buyer inspection concession response';
    case 'CONTRACTOR_URGENCY_PRESSURE':
      return 'Example: Same-day roof replacement pressure';
    default:
      return 'Example: Negotiation review';
  }
}

function getWorkspaceDescription(scenarioType: NegotiationShieldCaseScenarioType) {
  switch (scenarioType) {
    case 'CONTRACTOR_QUOTE_REVIEW':
      return 'Attach the estimate, add any quote details you have, and use the analysis to push for itemization and scope clarity.';
    case 'INSURANCE_PREMIUM_INCREASE':
      return 'Attach the renewal notice, add the premium details you know, and prepare a stronger review request.';
    case 'INSURANCE_CLAIM_SETTLEMENT':
      return 'Compare the settlement against your estimate, surface documentation-backed leverage, and draft a reconsideration request.';
    case 'BUYER_INSPECTION_NEGOTIATION':
      return 'Capture the buyer request, narrow the issues that matter, and prepare a calm inspection response.';
    case 'CONTRACTOR_URGENCY_PRESSURE':
      return 'Slow down same-day pressure, ask for written evidence, and prepare a response before approving work.';
    default:
      return 'Use this workspace to gather context, run analysis, and prepare a response.';
  }
}

function getDocumentSectionDescription(scenarioType: NegotiationShieldCaseScenarioType) {
  switch (scenarioType) {
    case 'CONTRACTOR_QUOTE_REVIEW':
      return 'Attach the quote, estimate, or supporting screenshots using the existing upload flow.';
    case 'INSURANCE_PREMIUM_INCREASE':
      return 'Attach the renewal notice or supporting screenshots using the existing upload flow.';
    case 'INSURANCE_CLAIM_SETTLEMENT':
      return 'Attach the settlement letter, repair estimate, or supporting claim documents using the existing upload flow.';
    case 'BUYER_INSPECTION_NEGOTIATION':
      return 'Attach the inspection report, buyer request, or supporting notes using the existing upload flow.';
    case 'CONTRACTOR_URGENCY_PRESSURE':
      return 'Attach the recommendation, estimate, or supporting screenshots using the existing upload flow.';
    default:
      return 'Attach the relevant source documents using the existing upload flow.';
  }
}

function getParsedMeta(input: NegotiationShieldInput) {
  const data = asRecord(input.structuredData);
  return asRecord(data._meta);
}

function isParsedInput(input: NegotiationShieldInput) {
  return String(getParsedMeta(input).origin ?? '') === 'PARSED_DOCUMENT';
}

function latestByDate<T extends { updatedAt?: string; createdAt?: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime();
    const rightTime = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime();
    return rightTime - leftTime;
  })[0] ?? null;
}

function mergeInputData(caseDetail: NegotiationShieldCaseDetail) {
  const scenarioInputType = getInputTypeForScenario(caseDetail.case.scenarioType);
  const relevantInputs = caseDetail.inputs.filter((input) => input.inputType === scenarioInputType);
  const manualInputs = relevantInputs.filter((input) => !isParsedInput(input));
  const parsedInputs = relevantInputs.filter((input) => isParsedInput(input));
  const manualInput = latestByDate(manualInputs);
  const parsedStructured = parsedInputs.reduce<Record<string, unknown>>((acc, input) => {
    const nextData = { ...asRecord(input.structuredData) };
    delete nextData._meta;
    return { ...acc, ...nextData };
  }, {});
  const manualStructured = manualInputs.reduce<Record<string, unknown>>((acc, input) => {
    const nextData = { ...asRecord(input.structuredData) };
    delete nextData._meta;
    return { ...acc, ...nextData };
  }, {});
  const effectiveStructured = { ...parsedStructured, ...manualStructured };
  const manualRawText = manualInputs
    .map((input) => input.rawText?.trim())
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
  const parsedRawText = parsedInputs
    .map((input) => input.rawText?.trim())
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
  const effectiveRawText = [manualRawText, parsedRawText].filter(Boolean).join('\n\n');

  return {
    manualInput,
    parsedInputs,
    effectiveStructured,
    effectiveRawText,
  };
}

function getDocumentParseInfo(document: NegotiationShieldDocument, inputs: NegotiationShieldInput[]) {
  const parsedInputs = inputs.filter((input) => {
    if (!isParsedInput(input)) return false;
    const meta = getParsedMeta(input);
    return String(meta.caseDocumentId ?? '') === document.id;
  });

  const latestParsedInput = latestByDate(parsedInputs);
  if (!latestParsedInput) {
    return {
      isParsed: false,
      parsedFieldCount: 0,
      warnings: [] as string[],
      parsedAt: null as string | null,
    };
  }

  const structuredData = asRecord(latestParsedInput.structuredData);
  const meta = getParsedMeta(latestParsedInput);
  const warnings = Array.isArray(meta.parseWarnings)
    ? meta.parseWarnings.filter((warning): warning is string => typeof warning === 'string')
    : [];

  return {
    isParsed: true,
    parsedFieldCount: countMeaningfulFields(structuredData),
    warnings,
    parsedAt: latestParsedInput.updatedAt,
  };
}

function normalizeObjectList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    );
  }

  return [];
}

function formatConfidence(confidence: number | null | undefined) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  const normalized = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(normalized)}% confidence`;
}

function formatConfidenceDescriptor(confidence: number | null | undefined) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  const normalized = confidence <= 1 ? confidence * 100 : confidence;
  if (normalized >= 75) return 'Stronger support';
  if (normalized >= 50) return 'Moderate support';
  return 'Limited support';
}

function formatTokenLabel(value: string | null | undefined) {
  if (!value) return null;

  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatMoneyValue(value: number) {
  const maximumFractionDigits = Number.isInteger(value) ? 0 : 2;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function normalizeMetaToken(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function getMetaValueChipClass(kind: 'signal' | 'strength' | 'priority', value: string | null) {
  const token = normalizeMetaToken(value);

  if (kind === 'signal') {
    if (token === 'INFO') return 'border-sky-200 bg-sky-50 text-sky-700';
    if (token === 'POSITIVE') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (token === 'CAUTION') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (token === 'MISSING') return 'border-slate-200 bg-slate-100 text-slate-700';
  }

  if (kind === 'strength') {
    if (token === 'HIGH') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (token === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (token === 'LOW') return 'border-slate-200 bg-slate-100 text-slate-700';
  }

  if (kind === 'priority') {
    if (token === 'HIGH') return 'border-rose-200 bg-rose-50 text-rose-700';
    if (token === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (token === 'LOW') return 'border-slate-200 bg-slate-100 text-slate-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function getMetaKind(metaLabel?: string): 'signal' | 'strength' | 'priority' | null {
  const token = normalizeMetaToken(metaLabel);
  if (token === 'SIGNAL') return 'signal';
  if (token === 'STRENGTH') return 'strength';
  if (token === 'PRIORITY') return 'priority';
  return null;
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return null;

  const payload = (error as { payload?: { code?: unknown } }).payload;
  if (payload && typeof payload.code === 'string') {
    return payload.code;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === 'string') return status;
  if (typeof status === 'number') return String(status);

  return null;
}

function getParseFailureMessage(error: unknown) {
  const code = getErrorCode(error);
  if (code === 'NEGOTIATION_SHIELD_DOCUMENT_PARSE_UNSUPPORTED') {
    return 'This file type is not supported for parsing yet. You can still add manual input and continue.';
  }
  if (code === 'NEGOTIATION_SHIELD_DOCUMENT_PARSE_EMPTY') {
    return 'No readable text was found in this file. Try a clearer PDF or image, or add manual input instead.';
  }
  if (code === 'NEGOTIATION_SHIELD_DOCUMENT_FETCH_FAILED') {
    return 'We could not retrieve the file for parsing. Try attaching it again.';
  }
  return errorMessage(error, 'We could not parse this document right now.');
}

function getAnalysisFailureMessage(error: unknown) {
  const code = getErrorCode(error);
  if (code === 'NEGOTIATION_SHIELD_ANALYSIS_INPUT_REQUIRED') {
    return 'Add manual details or parse a document before running analysis.';
  }
  if (code === 'NEGOTIATION_SHIELD_UNSUPPORTED_SCENARIO') {
    return 'This case is not set up for the selected analysis path.';
  }
  return errorMessage(error, 'We could not analyze this case right now.');
}

function getFailureCategory(error: unknown) {
  const code = getErrorCode(error);
  if (code) return code;

  const message = errorMessage(error, '').toLowerCase();
  if (message.includes('network')) return 'NETWORK';
  if (message.includes('support')) return 'UNSUPPORTED';
  if (message.includes('input')) return 'INPUT_REQUIRED';
  if (message.includes('property')) return 'PROPERTY';
  return 'UNKNOWN';
}

function hasMeaningfulAnalysisInput(caseDetail: NegotiationShieldCaseDetail) {
  const mergedInput = mergeInputData(caseDetail);
  return (
    countMeaningfulFields(mergedInput.effectiveStructured) > 0 ||
    hasMeaningfulText(mergedInput.effectiveRawText, 20)
  );
}

function InlineFeedback({
  feedback,
}: {
  feedback: InlineFeedbackState | null;
}) {
  if (!feedback) return null;

  const toneClass =
    feedback.tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : feedback.tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-sky-200 bg-sky-50 text-sky-800';

  return (
    <div className={cn('rounded-2xl border px-3.5 py-3 text-sm leading-6', toneClass)}>
      {feedback.message}
    </div>
  );
}

function resetFileInputValue(input: HTMLInputElement | null) {
  if (!input) return;

  input.value = '';
}

function buildContractorFormValues(caseDetail: NegotiationShieldCaseDetail): ContractorFormValues {
  const manualInput = mergeInputData(caseDetail).manualInput;
  const data = manualInput ? asRecord(manualInput.structuredData) : {};

  return {
    contractorName: typeof data.contractorName === 'string' ? data.contractorName : '',
    quoteAmount: formatNumberInput(data.quoteAmount),
    quoteDate: formatDateInput(data.quoteDate),
    serviceCategory: typeof data.serviceCategory === 'string' ? data.serviceCategory : '',
    systemCategory: typeof data.systemCategory === 'string' ? data.systemCategory : '',
    urgencyClaimed:
      data.urgencyClaimed === true
        ? 'yes'
        : data.urgencyClaimed === false
        ? 'no'
        : typeof data.urgencyClaimed === 'string'
        ? ((data.urgencyClaimed.toLowerCase() === 'yes' || data.urgencyClaimed.toLowerCase() === 'true' || data.urgencyClaimed.toLowerCase() === 'immediate')
            ? 'yes'
            : data.urgencyClaimed.toLowerCase() === 'no' || data.urgencyClaimed.toLowerCase() === 'false'
            ? 'no'
            : 'unknown')
        : 'unknown',
    notes: typeof data.notes === 'string' ? data.notes : '',
    rawText: manualInput?.rawText ?? '',
  };
}

function buildInsuranceFormValues(caseDetail: NegotiationShieldCaseDetail): InsuranceFormValues {
  const manualInput = mergeInputData(caseDetail).manualInput;
  const data = manualInput ? asRecord(manualInput.structuredData) : {};

  return {
    insurerName: typeof data.insurerName === 'string' ? data.insurerName : '',
    priorPremium: formatNumberInput(data.priorPremium),
    newPremium: formatNumberInput(data.newPremium),
    renewalDate: formatDateInput(data.renewalDate),
    reasonProvided: typeof data.reasonProvided === 'string' ? data.reasonProvided : '',
    notes: typeof data.notes === 'string' ? data.notes : '',
    rawText: manualInput?.rawText ?? '',
  };
}

function buildClaimSettlementFormValues(caseDetail: NegotiationShieldCaseDetail): ClaimSettlementFormValues {
  const manualInput = mergeInputData(caseDetail).manualInput;
  const data = manualInput ? asRecord(manualInput.structuredData) : {};

  return {
    insurerName: typeof data.insurerName === 'string' ? data.insurerName : '',
    claimType: typeof data.claimType === 'string' ? data.claimType : '',
    settlementAmount: formatNumberInput(data.settlementAmount),
    estimateAmount: formatNumberInput(data.estimateAmount),
    claimDate: formatDateInput(data.claimDate),
    reasonProvided: typeof data.reasonProvided === 'string' ? data.reasonProvided : '',
    notes: typeof data.notes === 'string' ? data.notes : '',
    rawText: manualInput?.rawText ?? '',
  };
}

function buildBuyerInspectionFormValues(caseDetail: NegotiationShieldCaseDetail): BuyerInspectionFormValues {
  const manualInput = mergeInputData(caseDetail).manualInput;
  const data = manualInput ? asRecord(manualInput.structuredData) : {};

  return {
    requestedConcessionAmount: formatNumberInput(data.requestedConcessionAmount),
    inspectionIssuesSummary:
      typeof data.inspectionIssuesSummary === 'string' ? data.inspectionIssuesSummary : '',
    requestedRepairs: typeof data.requestedRepairs === 'string' ? data.requestedRepairs : '',
    recentUpgradeNotes: typeof data.recentUpgradeNotes === 'string' ? data.recentUpgradeNotes : '',
    reportDate: formatDateInput(data.reportDate),
    notes: typeof data.notes === 'string' ? data.notes : '',
    rawText: manualInput?.rawText ?? '',
  };
}

function buildContractorUrgencyFormValues(caseDetail: NegotiationShieldCaseDetail): ContractorUrgencyFormValues {
  const manualInput = mergeInputData(caseDetail).manualInput;
  const data = manualInput ? asRecord(manualInput.structuredData) : {};

  const normalizeBooleanSelect = (value: unknown): ContractorUrgencyFormValues['urgencyClaimed'] => {
    if (value === true) return 'yes';
    if (value === false) return 'no';
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (['yes', 'true', 'immediate', 'urgent'].includes(normalized)) return 'yes';
      if (['no', 'false'].includes(normalized)) return 'no';
    }
    return 'unknown';
  };

  return {
    contractorName: typeof data.contractorName === 'string' ? data.contractorName : '',
    recommendedWork: typeof data.recommendedWork === 'string' ? data.recommendedWork : '',
    urgencyClaimed: normalizeBooleanSelect(data.urgencyClaimed),
    sameDayPressure: normalizeBooleanSelect(data.sameDayPressure),
    quoteAmount: formatNumberInput(data.quoteAmount),
    repairOptionMentioned: normalizeBooleanSelect(data.repairOptionMentioned),
    notes: typeof data.notes === 'string' ? data.notes : '',
    rawText: manualInput?.rawText ?? '',
  };
}

function buildContractorPayload(values: ContractorFormValues, inputId?: string): SaveNegotiationShieldInputPayload {
  const structuredData: Record<string, unknown> = {};

  if (values.contractorName.trim()) structuredData.contractorName = values.contractorName.trim();
  if (toNumber(values.quoteAmount) !== undefined) structuredData.quoteAmount = toNumber(values.quoteAmount);
  if (values.quoteDate) structuredData.quoteDate = values.quoteDate;
  if (values.serviceCategory.trim()) structuredData.serviceCategory = values.serviceCategory.trim();
  if (values.systemCategory.trim()) structuredData.systemCategory = values.systemCategory.trim();
  if (values.urgencyClaimed === 'yes') structuredData.urgencyClaimed = true;
  if (values.urgencyClaimed === 'no') structuredData.urgencyClaimed = false;
  if (values.notes.trim()) structuredData.notes = values.notes.trim();

  return {
    inputId,
    inputType: 'CONTRACTOR_QUOTE',
    rawText: values.rawText.trim() || null,
    structuredData,
  };
}

function buildInsurancePayload(values: InsuranceFormValues, inputId?: string): SaveNegotiationShieldInputPayload {
  const structuredData: Record<string, unknown> = {};

  if (values.insurerName.trim()) structuredData.insurerName = values.insurerName.trim();
  if (toNumber(values.priorPremium) !== undefined) structuredData.priorPremium = toNumber(values.priorPremium);
  if (toNumber(values.newPremium) !== undefined) structuredData.newPremium = toNumber(values.newPremium);
  if (values.renewalDate) structuredData.renewalDate = values.renewalDate;
  if (values.reasonProvided.trim()) structuredData.reasonProvided = values.reasonProvided.trim();
  if (values.notes.trim()) structuredData.notes = values.notes.trim();

  return {
    inputId,
    inputType: 'INSURANCE_PREMIUM',
    rawText: values.rawText.trim() || null,
    structuredData,
  };
}

function buildClaimSettlementPayload(
  values: ClaimSettlementFormValues,
  inputId?: string
): SaveNegotiationShieldInputPayload {
  const structuredData: Record<string, unknown> = {};

  if (values.insurerName.trim()) structuredData.insurerName = values.insurerName.trim();
  if (values.claimType.trim()) structuredData.claimType = values.claimType.trim();
  if (toNumber(values.settlementAmount) !== undefined) {
    structuredData.settlementAmount = toNumber(values.settlementAmount);
  }
  if (toNumber(values.estimateAmount) !== undefined) {
    structuredData.estimateAmount = toNumber(values.estimateAmount);
  }
  if (values.claimDate) structuredData.claimDate = values.claimDate;
  if (values.reasonProvided.trim()) structuredData.reasonProvided = values.reasonProvided.trim();
  if (values.notes.trim()) structuredData.notes = values.notes.trim();

  return {
    inputId,
    inputType: 'INSURANCE_CLAIM_SETTLEMENT',
    rawText: values.rawText.trim() || null,
    structuredData,
  };
}

function buildBuyerInspectionPayload(
  values: BuyerInspectionFormValues,
  inputId?: string
): SaveNegotiationShieldInputPayload {
  const structuredData: Record<string, unknown> = {};

  if (toNumber(values.requestedConcessionAmount) !== undefined) {
    structuredData.requestedConcessionAmount = toNumber(values.requestedConcessionAmount);
  }
  if (values.inspectionIssuesSummary.trim()) {
    structuredData.inspectionIssuesSummary = values.inspectionIssuesSummary.trim();
  }
  if (values.requestedRepairs.trim()) structuredData.requestedRepairs = values.requestedRepairs.trim();
  if (values.recentUpgradeNotes.trim()) {
    structuredData.recentUpgradeNotes = values.recentUpgradeNotes.trim();
  }
  if (values.reportDate) structuredData.reportDate = values.reportDate;
  if (values.notes.trim()) structuredData.notes = values.notes.trim();

  return {
    inputId,
    inputType: 'BUYER_INSPECTION',
    rawText: values.rawText.trim() || null,
    structuredData,
  };
}

function buildContractorUrgencyPayload(
  values: ContractorUrgencyFormValues,
  inputId?: string
): SaveNegotiationShieldInputPayload {
  const structuredData: Record<string, unknown> = {};

  if (values.contractorName.trim()) structuredData.contractorName = values.contractorName.trim();
  if (values.recommendedWork.trim()) structuredData.recommendedWork = values.recommendedWork.trim();
  if (values.urgencyClaimed === 'yes') structuredData.urgencyClaimed = true;
  if (values.urgencyClaimed === 'no') structuredData.urgencyClaimed = false;
  if (values.sameDayPressure === 'yes') structuredData.sameDayPressure = true;
  if (values.sameDayPressure === 'no') structuredData.sameDayPressure = false;
  if (toNumber(values.quoteAmount) !== undefined) structuredData.quoteAmount = toNumber(values.quoteAmount);
  if (values.repairOptionMentioned === 'yes') structuredData.repairOptionMentioned = true;
  if (values.repairOptionMentioned === 'no') structuredData.repairOptionMentioned = false;
  if (values.notes.trim()) structuredData.notes = values.notes.trim();

  return {
    inputId,
    inputType: 'CONTRACTOR_URGENCY',
    rawText: values.rawText.trim() || null,
    structuredData,
  };
}

function getPricingAssessment(analysis: NegotiationShieldAnalysis | null): NegotiationShieldPricingAssessment {
  return asRecord(analysis?.pricingAssessment) as NegotiationShieldPricingAssessment;
}

function buildCopyText(draft: NegotiationShieldDraft) {
  return draft.subject ? `Subject: ${draft.subject}\n\n${draft.body}` : draft.body;
}

function DetailSkeleton() {
  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground sm:py-12">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading case workspace...
      </CardContent>
    </Card>
  );
}

function ScenarioQuickStart({
  onStart,
}: {
  onStart: (scenario: ScenarioRouteValue) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {SCENARIO_OPTIONS.map((option) => (
        <button
          key={option.routeValue}
          type="button"
          onClick={() => onStart(option.routeValue)}
          className="group flex h-full flex-col rounded-2xl border border-border bg-white p-4 text-left transition-all hover:border-foreground/15 hover:bg-accent/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-5"
        >
          <div className="flex h-full items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-accent/30 text-foreground/80 transition-colors group-hover:border-foreground/10 group-hover:bg-accent/50">
              <option.Icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm font-semibold leading-5 text-foreground">{option.label}</p>
              <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">{option.shortDescription}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function CreateCasePanel({
  initialScenario,
  feedback,
  isSubmitting,
  onCancel,
  onScenarioSelected,
  onSubmit,
}: {
  initialScenario: NegotiationShieldCaseScenarioType;
  feedback: InlineFeedbackState | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onScenarioSelected: (scenarioType: NegotiationShieldCaseScenarioType) => void;
  onSubmit: (payload: CreateNegotiationShieldCasePayload) => void;
}) {
  const [scenarioType, setScenarioType] = useState<NegotiationShieldCaseScenarioType>(initialScenario);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    setScenarioType(initialScenario);
  }, [initialScenario]);

  const selectedScenario = getScenarioOptionByType(scenarioType);

  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <CardTitle>Start a new review</CardTitle>
        <CardDescription>
          Pick the situation you want reviewed, add a short title, and we will drop you into the workspace right away.
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-5 sm:space-y-6')}>
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          {SCENARIO_OPTIONS.map((option) => {
            const active = option.scenarioType === scenarioType;
            return (
              <button
                key={option.routeValue}
                type="button"
                onClick={() => {
                  setScenarioType(option.scenarioType);
                  onScenarioSelected(option.scenarioType);
                }}
                className={cn(
                  'rounded-2xl border p-3.5 text-left transition-colors sm:p-4',
                  active ? 'border-foreground/20 bg-accent/50' : 'border-border bg-white hover:border-foreground/15 hover:bg-accent/30'
                )}
              >
                <p className="text-sm font-semibold text-foreground">{option.label}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{option.shortDescription}</p>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="negotiation-title">Case title</Label>
            <Input
              id="negotiation-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={getCreateTitlePlaceholder(selectedScenario.scenarioType)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="negotiation-description">Description</Label>
            <Textarea
              id="negotiation-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional context for your review."
              className="min-h-[112px]"
            />
          </div>
        </div>

        <InlineFeedback feedback={feedback} />

        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() =>
              onSubmit({
                scenarioType,
                title: title.trim(),
                description: description.trim() || null,
                sourceType: 'MANUAL',
              })
            }
            disabled={isSubmitting || !title.trim()}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create case
          </Button>
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ContractorManualInputSection({
  caseDetail,
  feedback,
  isSaving,
  onSave,
}: {
  caseDetail: NegotiationShieldCaseDetail;
  feedback: InlineFeedbackState | null;
  isSaving: boolean;
  onSave: (payload: SaveNegotiationShieldInputPayload) => void;
}) {
  const [values, setValues] = useState<ContractorFormValues>(CONTRACTOR_DEFAULTS);
  const parsedInputs = mergeInputData(caseDetail).parsedInputs;

  useEffect(() => {
    setValues(buildContractorFormValues(caseDetail));
  }, [caseDetail]);

  const manualInput = mergeInputData(caseDetail).manualInput;

  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <CardTitle>Manual input</CardTitle>
        <CardDescription>
          Paste the quote details you have, or fill in only the fields that are easy to confirm.
          {parsedInputs.length ? ' Parsed document fields are already available in the background and will fill gaps during analysis.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-4 sm:space-y-5')}>
        <div className="grid gap-4 xl:grid-cols-2">
          <Field label="Contractor name">
            <Input value={values.contractorName} onChange={(event) => setValues((current) => ({ ...current, contractorName: event.target.value }))} />
          </Field>
          <Field label="Quote amount">
            <Input
              inputMode="decimal"
              placeholder="4500"
              value={values.quoteAmount}
              onChange={(event) => setValues((current) => ({ ...current, quoteAmount: event.target.value }))}
            />
          </Field>
          <Field label="Quote date">
            <Input
              type="date"
              value={values.quoteDate}
              onChange={(event) => setValues((current) => ({ ...current, quoteDate: event.target.value }))}
            />
          </Field>
          <Field label="Urgency claimed">
            <Select
              value={values.urgencyClaimed}
              onValueChange={(nextValue: ContractorFormValues['urgencyClaimed']) =>
                setValues((current) => ({ ...current, urgencyClaimed: nextValue }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Unclear</SelectItem>
                <SelectItem value="yes">Yes, urgent</SelectItem>
                <SelectItem value="no">No urgency claimed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Service category">
            <Input value={values.serviceCategory} onChange={(event) => setValues((current) => ({ ...current, serviceCategory: event.target.value }))} />
          </Field>
          <Field label="System category">
            <Input value={values.systemCategory} onChange={(event) => setValues((current) => ({ ...current, systemCategory: event.target.value }))} />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea
            value={values.notes}
            onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Any details you want the review to keep in mind."
            className="min-h-[96px] sm:min-h-[120px]"
          />
        </Field>

        <Field label="Pasted quote text">
          <Textarea
            value={values.rawText}
            onChange={(event) => setValues((current) => ({ ...current, rawText: event.target.value }))}
            placeholder="Paste estimate text, inspection notes, or contractor messages here."
            className="min-h-[136px] sm:min-h-[180px]"
          />
        </Field>

        <InlineFeedback feedback={feedback} />

        <div className="flex justify-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onSave(buildContractorPayload(values, manualInput?.id ?? undefined))}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving input...' : 'Save input'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InsuranceManualInputSection({
  caseDetail,
  feedback,
  isSaving,
  onSave,
}: {
  caseDetail: NegotiationShieldCaseDetail;
  feedback: InlineFeedbackState | null;
  isSaving: boolean;
  onSave: (payload: SaveNegotiationShieldInputPayload) => void;
}) {
  const [values, setValues] = useState<InsuranceFormValues>(INSURANCE_DEFAULTS);
  const parsedInputs = mergeInputData(caseDetail).parsedInputs;

  useEffect(() => {
    setValues(buildInsuranceFormValues(caseDetail));
  }, [caseDetail]);

  const manualInput = mergeInputData(caseDetail).manualInput;

  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <CardTitle>Manual input</CardTitle>
        <CardDescription>
          Capture the key renewal details here, even if you only have part of the notice handy.
          {parsedInputs.length ? ' Parsed document fields are already available in the background and will fill gaps during analysis.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-4 sm:space-y-5')}>
        <div className="grid gap-4 xl:grid-cols-2">
          <Field label="Insurer name">
            <Input value={values.insurerName} onChange={(event) => setValues((current) => ({ ...current, insurerName: event.target.value }))} />
          </Field>
          <Field label="Renewal date">
            <Input
              type="date"
              value={values.renewalDate}
              onChange={(event) => setValues((current) => ({ ...current, renewalDate: event.target.value }))}
            />
          </Field>
          <Field label="Prior premium">
            <Input
              inputMode="decimal"
              value={values.priorPremium}
              onChange={(event) => setValues((current) => ({ ...current, priorPremium: event.target.value }))}
            />
          </Field>
          <Field label="New premium">
            <Input
              inputMode="decimal"
              value={values.newPremium}
              onChange={(event) => setValues((current) => ({ ...current, newPremium: event.target.value }))}
            />
          </Field>
        </div>

        <Field label="Reason provided">
          <Textarea
            value={values.reasonProvided}
            onChange={(event) => setValues((current) => ({ ...current, reasonProvided: event.target.value }))}
            placeholder="Any explanation you received from the insurer or agent."
            className="min-h-[96px] sm:min-h-[110px]"
          />
        </Field>

        <Field label="Notes">
          <Textarea
            value={values.notes}
            onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Any policy context or questions you already have."
            className="min-h-[96px] sm:min-h-[120px]"
          />
        </Field>

        <Field label="Pasted notice text">
          <Textarea
            value={values.rawText}
            onChange={(event) => setValues((current) => ({ ...current, rawText: event.target.value }))}
            placeholder="Paste notice text, email content, or agent messages here."
            className="min-h-[136px] sm:min-h-[180px]"
          />
        </Field>

        <InlineFeedback feedback={feedback} />

        <div className="flex justify-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onSave(buildInsurancePayload(values, manualInput?.id ?? undefined))}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving input...' : 'Save input'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ClaimSettlementManualInputSection({
  caseDetail,
  feedback,
  isSaving,
  onSave,
}: {
  caseDetail: NegotiationShieldCaseDetail;
  feedback: InlineFeedbackState | null;
  isSaving: boolean;
  onSave: (payload: SaveNegotiationShieldInputPayload) => void;
}) {
  const [values, setValues] = useState<ClaimSettlementFormValues>(CLAIM_SETTLEMENT_DEFAULTS);
  const parsedInputs = mergeInputData(caseDetail).parsedInputs;

  useEffect(() => {
    setValues(buildClaimSettlementFormValues(caseDetail));
  }, [caseDetail]);

  const manualInput = mergeInputData(caseDetail).manualInput;

  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <CardTitle>Manual input</CardTitle>
        <CardDescription>
          Add the settlement, estimate, and claim context you already have.
          {parsedInputs.length ? ' Parsed document fields are already available in the background and will fill gaps during analysis.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-4 sm:space-y-5')}>
        <div className="grid gap-4 xl:grid-cols-2">
          <Field label="Insurer name">
            <Input value={values.insurerName} onChange={(event) => setValues((current) => ({ ...current, insurerName: event.target.value }))} />
          </Field>
          <Field label="Claim type">
            <Input value={values.claimType} onChange={(event) => setValues((current) => ({ ...current, claimType: event.target.value }))} />
          </Field>
          <Field label="Settlement amount">
            <Input inputMode="decimal" value={values.settlementAmount} onChange={(event) => setValues((current) => ({ ...current, settlementAmount: event.target.value }))} />
          </Field>
          <Field label="Repair estimate amount">
            <Input inputMode="decimal" value={values.estimateAmount} onChange={(event) => setValues((current) => ({ ...current, estimateAmount: event.target.value }))} />
          </Field>
          <Field label="Claim date">
            <Input type="date" value={values.claimDate} onChange={(event) => setValues((current) => ({ ...current, claimDate: event.target.value }))} />
          </Field>
        </div>

        <Field label="Reason provided">
          <Textarea
            value={values.reasonProvided}
            onChange={(event) => setValues((current) => ({ ...current, reasonProvided: event.target.value }))}
            placeholder="Any explanation the insurer gave for the settlement amount."
            className="min-h-[96px] sm:min-h-[110px]"
          />
        </Field>

        <Field label="Notes">
          <Textarea
            value={values.notes}
            onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Anything else you want the review to keep in mind."
            className="min-h-[96px] sm:min-h-[120px]"
          />
        </Field>

        <Field label="Pasted settlement text">
          <Textarea
            value={values.rawText}
            onChange={(event) => setValues((current) => ({ ...current, rawText: event.target.value }))}
            placeholder="Paste settlement letter text, adjuster notes, or estimate language here."
            className="min-h-[136px] sm:min-h-[180px]"
          />
        </Field>

        <InlineFeedback feedback={feedback} />

        <div className="flex justify-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onSave(buildClaimSettlementPayload(values, manualInput?.id ?? undefined))}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving input...' : 'Save input'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BuyerInspectionManualInputSection({
  caseDetail,
  feedback,
  isSaving,
  onSave,
}: {
  caseDetail: NegotiationShieldCaseDetail;
  feedback: InlineFeedbackState | null;
  isSaving: boolean;
  onSave: (payload: SaveNegotiationShieldInputPayload) => void;
}) {
  const [values, setValues] = useState<BuyerInspectionFormValues>(BUYER_INSPECTION_DEFAULTS);
  const parsedInputs = mergeInputData(caseDetail).parsedInputs;

  useEffect(() => {
    setValues(buildBuyerInspectionFormValues(caseDetail));
  }, [caseDetail]);

  const manualInput = mergeInputData(caseDetail).manualInput;

  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <CardTitle>Manual input</CardTitle>
        <CardDescription>
          Capture the buyer request and the inspection issues that seem most relevant.
          {parsedInputs.length ? ' Parsed document fields are already available in the background and will fill gaps during analysis.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-4 sm:space-y-5')}>
        <div className="grid gap-4 xl:grid-cols-2">
          <Field label="Requested concession amount">
            <Input inputMode="decimal" value={values.requestedConcessionAmount} onChange={(event) => setValues((current) => ({ ...current, requestedConcessionAmount: event.target.value }))} />
          </Field>
          <Field label="Inspection report date">
            <Input type="date" value={values.reportDate} onChange={(event) => setValues((current) => ({ ...current, reportDate: event.target.value }))} />
          </Field>
        </div>

        <Field label="Inspection issues summary">
          <Textarea
            value={values.inspectionIssuesSummary}
            onChange={(event) => setValues((current) => ({ ...current, inspectionIssuesSummary: event.target.value }))}
            placeholder="Summarize the main findings the buyer is relying on."
            className="min-h-[96px] sm:min-h-[120px]"
          />
        </Field>

        <Field label="Requested repairs">
          <Textarea
            value={values.requestedRepairs}
            onChange={(event) => setValues((current) => ({ ...current, requestedRepairs: event.target.value }))}
            placeholder="List the repairs or credits the buyer is asking for."
            className="min-h-[96px] sm:min-h-[120px]"
          />
        </Field>

        <Field label="Recent upgrade notes">
          <Textarea
            value={values.recentUpgradeNotes}
            onChange={(event) => setValues((current) => ({ ...current, recentUpgradeNotes: event.target.value }))}
            placeholder="Recent roof, HVAC, plumbing, electrical, or other work that may narrow the request."
            className="min-h-[96px] sm:min-h-[120px]"
          />
        </Field>

        <Field label="Pasted report or request text">
          <Textarea
            value={values.rawText}
            onChange={(event) => setValues((current) => ({ ...current, rawText: event.target.value }))}
            placeholder="Paste inspection report text, buyer repair requests, or agent notes here."
            className="min-h-[136px] sm:min-h-[180px]"
          />
        </Field>

        <Field label="Notes">
          <Textarea
            value={values.notes}
            onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Anything else you want the response to keep in mind."
            className="min-h-[96px] sm:min-h-[120px]"
          />
        </Field>

        <InlineFeedback feedback={feedback} />

        <div className="flex justify-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onSave(buildBuyerInspectionPayload(values, manualInput?.id ?? undefined))}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving input...' : 'Save input'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ContractorUrgencyManualInputSection({
  caseDetail,
  feedback,
  isSaving,
  onSave,
}: {
  caseDetail: NegotiationShieldCaseDetail;
  feedback: InlineFeedbackState | null;
  isSaving: boolean;
  onSave: (payload: SaveNegotiationShieldInputPayload) => void;
}) {
  const [values, setValues] = useState<ContractorUrgencyFormValues>(CONTRACTOR_URGENCY_DEFAULTS);
  const parsedInputs = mergeInputData(caseDetail).parsedInputs;

  useEffect(() => {
    setValues(buildContractorUrgencyFormValues(caseDetail));
  }, [caseDetail]);

  const manualInput = mergeInputData(caseDetail).manualInput;

  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <CardTitle>Manual input</CardTitle>
        <CardDescription>
          Capture the recommendation, the urgency framing, and anything that feels pushy or unclear.
          {parsedInputs.length ? ' Parsed document fields are already available in the background and will fill gaps during analysis.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-4 sm:space-y-5')}>
        <div className="grid gap-4 xl:grid-cols-2">
          <Field label="Contractor name">
            <Input value={values.contractorName} onChange={(event) => setValues((current) => ({ ...current, contractorName: event.target.value }))} />
          </Field>
          <Field label="Quote amount">
            <Input inputMode="decimal" value={values.quoteAmount} onChange={(event) => setValues((current) => ({ ...current, quoteAmount: event.target.value }))} />
          </Field>
          <Field label="Recommended work">
            <Input value={values.recommendedWork} onChange={(event) => setValues((current) => ({ ...current, recommendedWork: event.target.value }))} />
          </Field>
          <Field label="Urgency claimed">
            <Select
              value={values.urgencyClaimed}
              onValueChange={(nextValue: ContractorUrgencyFormValues['urgencyClaimed']) =>
                setValues((current) => ({ ...current, urgencyClaimed: nextValue }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Unclear</SelectItem>
                <SelectItem value="yes">Yes, urgent</SelectItem>
                <SelectItem value="no">No urgency claimed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Same-day pressure">
            <Select
              value={values.sameDayPressure}
              onValueChange={(nextValue: ContractorUrgencyFormValues['sameDayPressure']) =>
                setValues((current) => ({ ...current, sameDayPressure: nextValue }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select pressure level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Unclear</SelectItem>
                <SelectItem value="yes">Yes, same-day pressure</SelectItem>
                <SelectItem value="no">No same-day pressure</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Repair option mentioned">
            <Select
              value={values.repairOptionMentioned}
              onValueChange={(nextValue: ContractorUrgencyFormValues['repairOptionMentioned']) =>
                setValues((current) => ({ ...current, repairOptionMentioned: nextValue }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select repair option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Unclear</SelectItem>
                <SelectItem value="yes">Yes, repair discussed</SelectItem>
                <SelectItem value="no">No repair option discussed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Notes">
          <Textarea
            value={values.notes}
            onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Anything that feels rushed, unsupported, or worth pushing back on."
            className="min-h-[96px] sm:min-h-[120px]"
          />
        </Field>

        <Field label="Pasted recommendation text">
          <Textarea
            value={values.rawText}
            onChange={(event) => setValues((current) => ({ ...current, rawText: event.target.value }))}
            placeholder="Paste contractor messages, recommendation language, or notes here."
            className="min-h-[136px] sm:min-h-[180px]"
          />
        </Field>

        <InlineFeedback feedback={feedback} />

        <div className="flex justify-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onSave(buildContractorUrgencyPayload(values, manualInput?.id ?? undefined))}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving input...' : 'Save input'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function AnalysisResultsSection({
  analysis,
}: {
  analysis: NegotiationShieldAnalysis | null;
}) {
  if (!analysis) {
    return (
      <Card className={SECTION_CARD_CLASS}>
        <CardHeader className={SECTION_HEADER_CLASS}>
          <CardTitle>Analysis results</CardTitle>
          <CardDescription>The latest review will appear here after you run analysis.</CardDescription>
        </CardHeader>
        <CardContent className={SECTION_CONTENT_CLASS}>
          <EmptyStateCard
            title="No analysis yet"
            description="Once you have enough manual or parsed document input, run analysis to get leverage points and recommended next steps."
          />
        </CardContent>
      </Card>
    );
  }

  const findings = normalizeObjectList(analysis.findings);
  const leveragePoints = normalizeObjectList(analysis.negotiationLeverage);
  const recommendedActions = normalizeObjectList(analysis.recommendedActions);
  const pricingAssessment = getPricingAssessment(analysis);
  const confidenceLabel = formatConfidence(analysis.confidence);
  const confidenceDescriptor = formatConfidenceDescriptor(analysis.confidence);
  const assessmentLabel = formatTokenLabel(pricingAssessment.status) ?? 'Assessment pending';

  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div>
              <CardTitle>Analysis results</CardTitle>
              <CardDescription>Grounded guidance based on the case details currently saved for this property.</CardDescription>
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="rounded-2xl border border-border bg-accent/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assessment</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{assessmentLabel}</p>
              {pricingAssessment.summary ? (
                <p className="mt-2 text-sm leading-6 text-foreground/85">{pricingAssessment.summary}</p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confidence</p>
                <p className="mt-2 text-base font-semibold text-foreground">{confidenceDescriptor ?? 'Pending'}</p>
                {confidenceLabel ? <p className="mt-1 text-sm text-muted-foreground">{confidenceLabel}</p> : null}
              </div>
              {analysis.generatedAt ? (
                <div className="rounded-2xl border border-border bg-background p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Updated</p>
                  <p className="mt-2 text-base font-semibold text-foreground">{formatDateTime(analysis.generatedAt)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Based on the latest saved case input.</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-4 sm:space-y-6')}>
        {analysis.summary ? (
          <div className="rounded-2xl border border-border bg-accent/40 p-3.5 sm:p-4">
            <p className="text-sm font-semibold text-foreground">Summary</p>
            <p className="mt-2 text-sm leading-6 text-foreground/85 sm:leading-7">{analysis.summary}</p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <ResultList
            title="Findings"
            emptyLabel="No findings were returned yet."
            items={findings}
            titleKey="title"
            bodyKey="detail"
            metaKey="status"
            metaLabel="Signal"
          />
          <ResultList
            title="Negotiation leverage"
            emptyLabel="No leverage points were returned yet."
            items={leveragePoints}
            titleKey="title"
            bodyKey="detail"
            metaKey="strength"
            metaLabel="Strength"
            emphasis="leverage"
          />
        </div>

        <ResultList
          title="Recommended actions"
          emptyLabel="No recommended actions were returned yet."
          items={recommendedActions}
          titleKey="title"
          bodyKey="detail"
          metaKey="priority"
          metaLabel="Priority"
          ordered
        />

        {(pricingAssessment.summary ||
          pricingAssessment.rationale?.length ||
          pricingAssessment.increaseAmount ||
          pricingAssessment.quoteAmount ||
          pricingAssessment.settlementAmount ||
          pricingAssessment.estimateAmount ||
          pricingAssessment.gapAmount ||
          pricingAssessment.requestedConcessionAmount) ? (
          <div className="rounded-2xl border border-border p-3.5 sm:p-4">
            <p className="text-sm font-semibold text-foreground">Assessment</p>
            {pricingAssessment.summary ? <p className="mt-2 text-sm leading-6 text-foreground/85 sm:leading-7">{pricingAssessment.summary}</p> : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {typeof pricingAssessment.quoteAmount === 'number' ? (
                <Badge variant="outline">Quote amount: {formatMoneyValue(pricingAssessment.quoteAmount)}</Badge>
              ) : null}
              {typeof pricingAssessment.priorPremium === 'number' ? (
                <Badge variant="outline">Prior premium: {formatMoneyValue(pricingAssessment.priorPremium)}</Badge>
              ) : null}
              {typeof pricingAssessment.newPremium === 'number' ? (
                <Badge variant="outline">New premium: {formatMoneyValue(pricingAssessment.newPremium)}</Badge>
              ) : null}
              {typeof pricingAssessment.increaseAmount === 'number' ? (
                <Badge variant="outline">Increase: {formatMoneyValue(pricingAssessment.increaseAmount)}</Badge>
              ) : null}
              {typeof pricingAssessment.increasePercentage === 'number' ? (
                <Badge variant="outline">Increase %: {Math.round(pricingAssessment.increasePercentage)}%</Badge>
              ) : null}
              {typeof pricingAssessment.settlementAmount === 'number' ? (
                <Badge variant="outline">Settlement: {formatMoneyValue(pricingAssessment.settlementAmount)}</Badge>
              ) : null}
              {typeof pricingAssessment.estimateAmount === 'number' ? (
                <Badge variant="outline">Estimate: {formatMoneyValue(pricingAssessment.estimateAmount)}</Badge>
              ) : null}
              {typeof pricingAssessment.gapAmount === 'number' ? (
                <Badge variant="outline">Gap: {formatMoneyValue(pricingAssessment.gapAmount)}</Badge>
              ) : null}
              {typeof pricingAssessment.gapPercentage === 'number' ? (
                <Badge variant="outline">Gap %: {Math.round(pricingAssessment.gapPercentage)}%</Badge>
              ) : null}
              {typeof pricingAssessment.requestedConcessionAmount === 'number' ? (
                <Badge variant="outline">
                  Concession request: {formatMoneyValue(pricingAssessment.requestedConcessionAmount)}
                </Badge>
              ) : null}
            </div>

            {pricingAssessment.rationale?.length ? (
              <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground sm:leading-7">
                {pricingAssessment.rationale.map((reason) => (
                  <li key={reason} className="list-disc ml-5">
                    {reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResultList({
  title,
  emptyLabel,
  items,
  titleKey,
  bodyKey,
  metaKey,
  metaLabel,
  ordered = false,
  emphasis = 'default',
}: {
  title: string;
  emptyLabel: string;
  items: Array<Record<string, unknown>>;
  titleKey: string;
  bodyKey: string;
  metaKey?: string;
  metaLabel?: string;
  ordered?: boolean;
  emphasis?: 'default' | 'leverage';
}) {
  const ListTag = ordered ? 'ol' : 'ul';
  const metaKind = getMetaKind(metaLabel);

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3.5 sm:p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ListTag className="space-y-3">
          {items.map((item, index) => {
            const itemTitle = typeof item[titleKey] === 'string' ? String(item[titleKey]) : `Item ${index + 1}`;
            const itemBody = typeof item[bodyKey] === 'string' ? String(item[bodyKey]) : '';
            const itemMeta = metaKey && typeof item[metaKey] === 'string' ? formatTokenLabel(String(item[metaKey])) : null;

            return (
              <li
                key={`${itemTitle}-${index}`}
                className={cn(
                  'rounded-xl border border-border bg-background p-2.5 sm:p-3',
                  emphasis === 'leverage' ? 'border-sky-200/80 bg-sky-50/40' : null
                )}
              >
                <div className="space-y-3">
                  <div className={cn('flex flex-wrap gap-2', ordered ? 'justify-between' : 'justify-end')}>
                    {ordered ? (
                      <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                        Step {index + 1}
                      </span>
                    ) : null}
                    {itemMeta ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {metaLabel ? (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {metaLabel}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                            metaKind ? getMetaValueChipClass(metaKind, itemMeta) : 'border-slate-200 bg-slate-50 text-slate-700'
                          )}
                        >
                          {itemMeta}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className={cn('text-sm font-medium text-foreground', emphasis === 'leverage' ? 'text-[15px]' : null)}>
                      {itemTitle}
                    </p>
                    {itemBody ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{itemBody}</p> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ListTag>
      )}
    </div>
  );
}

function DraftSection({
  caseId,
  draft,
  feedback,
  onCopy,
}: {
  caseId: string;
  draft: NegotiationShieldDraft | null;
  feedback: InlineFeedbackState | null;
  onCopy: (draft: NegotiationShieldDraft) => Promise<void>;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle');

  useEffect(() => {
    setCopyState('idle');
  }, [caseId, draft?.id]);

  async function handleCopy() {
    if (!draft || copyState === 'copying') return;

    setCopyState('copying');
    try {
      await onCopy(draft);
      setCopyState('copied');
      window.setTimeout(() => {
        setCopyState('idle');
      }, 2000);
    } catch {
      setCopyState('idle');
    }
  }

  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <CardTitle>Message draft</CardTitle>
            <CardDescription>A ready-to-send response based on the latest saved analysis.</CardDescription>
          </div>
          {draft ? (
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleCopy} disabled={copyState === 'copying'}>
              <Clipboard className="h-4 w-4" />
              {copyState === 'copying' ? 'Copying...' : copyState === 'copied' ? 'Copied' : 'Copy draft'}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={SECTION_CONTENT_CLASS}>
        <InlineFeedback feedback={feedback} />
        {!draft ? (
          <EmptyStateCard
            title="No draft yet"
            description="Run analysis to generate a message you can copy into an email or portal response."
          />
        ) : (
          <div className="space-y-3 rounded-2xl border border-border bg-background p-3.5 sm:space-y-4 sm:p-4">
            {draft.subject ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subject</p>
                <p className="mt-1 text-sm font-medium text-foreground">{draft.subject}</p>
              </div>
            ) : null}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ready-to-send message</p>
              <div className="mt-2 whitespace-pre-wrap rounded-xl border border-border bg-white p-3.5 text-sm leading-6 text-foreground/90 sm:p-4 sm:leading-7">
                {draft.body}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DesktopCaseRail({
  cases,
  activeCaseId,
  isLoading,
  isError,
  isWorkspaceMode,
  onOpenCase,
  onOpenCreate,
  onRefetch,
}: {
  cases: NegotiationShieldCaseDetail['case'][];
  activeCaseId: string | null;
  isLoading: boolean;
  isError: boolean;
  isWorkspaceMode: boolean;
  onOpenCase: (caseId: string) => void;
  onOpenCreate: (scenario?: ScenarioRouteValue) => void;
  onRefetch: () => void;
}) {
  if (!isWorkspaceMode) {
    return null;
  }

  return (
    <div className="hidden xl:block xl:sticky xl:top-6 xl:space-y-4">
      <Card className={SECTION_CARD_CLASS}>
        <CardHeader className={cn(SECTION_HEADER_CLASS, 'pb-4')}>
          <div className="space-y-2">
            <CardTitle className="text-base">New review</CardTitle>
            <CardDescription>
              Need a separate negotiation? Start a fresh case without leaving the current workspace.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className={cn(SECTION_CONTENT_CLASS, 'pt-0')}>
          <Button type="button" className="w-full" onClick={() => onOpenCreate()}>
            <Plus className="h-4 w-4" />
            Start new review
          </Button>
        </CardContent>
      </Card>

      <Card className={SECTION_CARD_CLASS}>
        <CardHeader className={SECTION_HEADER_CLASS}>
          <CardTitle className="text-base">Other cases</CardTitle>
          <CardDescription>Jump to another property-scoped review without losing this workflow.</CardDescription>
        </CardHeader>
        <CardContent className={SECTION_CONTENT_CLASS}>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading cases...
            </div>
          ) : isError ? (
            <div className="space-y-3 py-1">
              <p className="text-sm leading-6 text-muted-foreground">
                We could not load the latest reviews for this property.
              </p>
              <Button type="button" variant="outline" className="w-full" onClick={onRefetch}>
                Try again
              </Button>
            </div>
          ) : cases.length === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">
              No cases yet. Start with the scenario that matches what you need reviewed.
            </p>
          ) : (
            <div className="space-y-3">
              {cases.map((item) => {
                const active = activeCaseId === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenCase(item.id)}
                    className={cn(
                      'w-full rounded-2xl border p-4 text-left transition-colors',
                      active
                        ? 'border-foreground/20 bg-accent/40 shadow-sm'
                        : 'border-border bg-white hover:border-foreground/15 hover:bg-accent/30'
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <Badge variant={getStatusVariant(item.status)}>{formatStatusLabel(item.status)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{formatScenarioLabel(item.scenarioType)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Updated {formatDateTime(item.updatedAt)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CaseWorkspace({
  propertyId,
  property,
  caseDetail,
  onBack,
  trackEvent,
}: {
  propertyId: string;
  property: Property | undefined;
  caseDetail: NegotiationShieldCaseDetail;
  onBack: () => void;
  trackEvent: (event: string, section?: string, metadata?: Record<string, unknown>) => void;
}) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [documentType, setDocumentType] = useState<NegotiationShieldDocumentType>(
    getDefaultDocumentTypeForScenario(caseDetail.case.scenarioType)
  );
  const [manualFeedback, setManualFeedback] = useState<InlineFeedbackState | null>(null);
  const [documentFeedback, setDocumentFeedback] = useState<InlineFeedbackState | null>(null);
  const [analysisFeedback, setAnalysisFeedback] = useState<InlineFeedbackState | null>(null);
  const [draftFeedback, setDraftFeedback] = useState<InlineFeedbackState | null>(null);

  useEffect(() => {
    setSelectedFile(null);
    setDocumentName('');
    resetFileInputValue(fileInputRef.current);
    setDocumentType(getDefaultDocumentTypeForScenario(caseDetail.case.scenarioType));
    setManualFeedback(null);
    setDocumentFeedback(null);
    setAnalysisFeedback(null);
    setDraftFeedback(null);
  }, [caseDetail.case.id, caseDetail.case.scenarioType]);

  const detailQueryKey = ['negotiation-shield-case', propertyId, caseDetail.case.id];
  const listQueryKey = ['negotiation-shield-cases', propertyId];

  function syncCaseDetail(nextDetail: NegotiationShieldCaseDetail) {
    queryClient.setQueryData(detailQueryKey, nextDetail);
    queryClient.setQueryData<NegotiationShieldCaseDetail['case'][] | undefined>(listQueryKey, (current) =>
      upsertCaseSummary(current, nextDetail.case)
    );
  }

  const saveInputMutation = useMutation({
    mutationFn: (payload: SaveNegotiationShieldInputPayload) => saveNegotiationShieldInput(propertyId, caseDetail.case.id, payload),
    onMutate: () => {
      setManualFeedback({
        tone: 'info',
        message: 'Saving your latest manual input...',
      });
    },
    onSuccess: (nextDetail) => {
      syncCaseDetail(nextDetail);
      setManualFeedback({
        tone: 'success',
        message: 'Manual input saved. The latest case details are now ready for analysis.',
      });
      trackEvent('MANUAL_INPUT_SAVED', 'manual-input', {
        caseId: nextDetail.case.id,
        scenarioType: nextDetail.case.scenarioType,
        sourceType: nextDetail.case.sourceType,
        inputMode: getInputMode(nextDetail.case.sourceType),
        hasDocument: nextDetail.documents.length > 0,
        status: nextDetail.case.status,
      });
      toast({ title: 'Input saved', description: 'Your case details were updated.' });
    },
    onError: (error) => {
      setManualFeedback({
        tone: 'error',
        message: errorMessage(error, 'Unable to save case input. Your edits are still on screen, so you can try again.'),
      });
      toast({ title: 'Save failed', description: errorMessage(error, 'Unable to save case input.'), variant: 'destructive' });
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error('Select a file to upload.');
      }

      const uploadResponse = await api.uploadDocument(selectedFile, {
        propertyId,
        name: documentName.trim() || selectedFile.name,
        type: mapCaseDocumentToUploadType(documentType),
      });

      if (!uploadResponse.success) {
        throw new Error(uploadResponse.message || 'Upload failed.');
      }

      return attachNegotiationShieldDocument(propertyId, caseDetail.case.id, {
        documentType,
        documentId: uploadResponse.data.id,
      });
    },
    onMutate: () => {
      setDocumentFeedback({
        tone: 'info',
        message: 'Attaching your selected document to this case...',
      });
    },
    onSuccess: (nextDetail) => {
      syncCaseDetail(nextDetail);
      setSelectedFile(null);
      setDocumentName('');
      resetFileInputValue(fileInputRef.current);
      setDocumentFeedback({
        tone: 'success',
        message: 'Document attached. Parse it when you want Negotiation Shield to pull details into the case.',
      });
      trackEvent('DOCUMENT_ATTACHED', 'documents', {
        caseId: nextDetail.case.id,
        scenarioType: nextDetail.case.scenarioType,
        sourceType: nextDetail.case.sourceType,
        inputMode: getInputMode(nextDetail.case.sourceType),
        hasDocument: nextDetail.documents.length > 0,
        documentCount: nextDetail.documents.length,
      });
      toast({ title: 'Document attached', description: 'The file is now available inside this review.' });
    },
    onError: (error) => {
      setDocumentFeedback({
        tone: 'error',
        message: errorMessage(error, 'Unable to upload and attach this document. Your selected file is still available so you can try again.'),
      });
      toast({ title: 'Upload failed', description: errorMessage(error, 'Unable to upload and attach this document.'), variant: 'destructive' });
    },
  });

  const parseDocumentMutation = useMutation({
    mutationFn: (caseDocumentId: string) => {
      const targetDocument = caseDetail.documents.find((document) => document.id === caseDocumentId);
      trackEvent('DOCUMENT_PARSE_TRIGGERED', 'documents', {
        caseId: caseDetail.case.id,
        scenarioType: caseDetail.case.scenarioType,
        sourceType: caseDetail.case.sourceType,
        inputMode: getInputMode(caseDetail.case.sourceType),
        hasDocument: caseDetail.documents.length > 0,
        caseDocumentId,
        documentType: targetDocument?.documentType ?? null,
      });
      return parseNegotiationShieldCaseDocument(propertyId, caseDetail.case.id, caseDocumentId);
    },
    onMutate: () => {
      setDocumentFeedback({
        tone: 'info',
        message: 'Parsing the document now. This can take a few seconds for larger files.',
      });
    },
    onSuccess: (nextDetail) => {
      syncCaseDetail(nextDetail);
      const parsedDocument = nextDetail.documents.find((document) => document.id === parseDocumentMutation.variables);
      setDocumentFeedback({
        tone: 'success',
        message: parsedDocument
          ? `${parsedDocument.fileName} was parsed and is now available during analysis.`
          : 'The document was parsed and its extracted content is now available during analysis.',
      });
      trackEvent('DOCUMENT_PARSE_SUCCEEDED', 'documents', {
        caseId: nextDetail.case.id,
        scenarioType: nextDetail.case.scenarioType,
        sourceType: nextDetail.case.sourceType,
        inputMode: getInputMode(nextDetail.case.sourceType),
        hasDocument: nextDetail.documents.length > 0,
        caseDocumentId: parseDocumentMutation.variables ?? null,
        parsedDocumentCount: nextDetail.documents.filter((document) => getDocumentParseInfo(document, nextDetail.inputs).isParsed).length,
      });
      toast({ title: 'Document parsed', description: 'Parsed content is now available to the analysis flow.' });
    },
    onError: (error) => {
      const failureMessage = getParseFailureMessage(error);
      setDocumentFeedback({
        tone: 'error',
        message: failureMessage,
      });
      trackEvent('DOCUMENT_PARSE_FAILED', 'documents', {
        caseId: caseDetail.case.id,
        scenarioType: caseDetail.case.scenarioType,
        sourceType: caseDetail.case.sourceType,
        inputMode: getInputMode(caseDetail.case.sourceType),
        hasDocument: caseDetail.documents.length > 0,
        caseDocumentId: parseDocumentMutation.variables ?? null,
        parseResult: getFailureCategory(error),
      });
      toast({ title: 'Parse failed', description: failureMessage, variant: 'destructive' });
    },
  });

  const analyzeCaseMutation = useMutation({
    mutationFn: () => {
      trackEvent('ANALYSIS_TRIGGERED', 'analysis', {
        caseId: caseDetail.case.id,
        scenarioType: caseDetail.case.scenarioType,
        sourceType: caseDetail.case.sourceType,
        inputMode: getInputMode(caseDetail.case.sourceType),
        hasDocument: caseDetail.documents.length > 0,
        analysisType: caseDetail.case.scenarioType,
      });
      return analyzeNegotiationShieldCase(propertyId, caseDetail.case.id, {
        guidanceJourneyId: searchParams.get('guidanceJourneyId'),
        guidanceStepKey: searchParams.get('guidanceStepKey'),
        guidanceSignalIntentFamily: searchParams.get('guidanceSignalIntentFamily'),
      });
    },
    onMutate: () => {
      setAnalysisFeedback({
        tone: 'info',
        message: 'Analyzing the latest case input and generating updated guidance...',
      });
    },
    onSuccess: (nextDetail) => {
      syncCaseDetail(nextDetail);
      setAnalysisFeedback({
        tone: 'success',
        message: 'Analysis updated. Review the summary, leverage points, and draft message below.',
      });
      trackEvent('ANALYSIS_SUCCEEDED', 'analysis', {
        caseId: nextDetail.case.id,
        scenarioType: nextDetail.case.scenarioType,
        sourceType: nextDetail.case.sourceType,
        inputMode: getInputMode(nextDetail.case.sourceType),
        hasDocument: nextDetail.documents.length > 0,
        status: nextDetail.case.status,
        analysisType: nextDetail.case.scenarioType,
      });
      toast({ title: 'Analysis complete', description: 'Negotiation guidance and a draft message are ready.' });
    },
    onError: (error) => {
      const failureMessage = getAnalysisFailureMessage(error);
      setAnalysisFeedback({
        tone: 'error',
        message: failureMessage,
      });
      trackEvent('ANALYSIS_FAILED', 'analysis', {
        caseId: caseDetail.case.id,
        scenarioType: caseDetail.case.scenarioType,
        sourceType: caseDetail.case.sourceType,
        inputMode: getInputMode(caseDetail.case.sourceType),
        hasDocument: caseDetail.documents.length > 0,
        analysisType: caseDetail.case.scenarioType,
        parseResult: getFailureCategory(error),
      });
      toast({ title: 'Analysis failed', description: failureMessage, variant: 'destructive' });
    },
  });

  const parsedDocumentsCount = caseDetail.documents.filter((document) => getDocumentParseInfo(document, caseDetail.inputs).isParsed).length;
  const needsDocumentParseReminder = caseDetail.documents.length > 0 && parsedDocumentsCount === 0;
  const hasUsableInput = hasMeaningfulAnalysisInput(caseDetail);
  const hasAnalysis = Boolean(caseDetail.latestAnalysis);
  const manualActionInFlight =
    saveInputMutation.isPending || parseDocumentMutation.isPending || analyzeCaseMutation.isPending;
  const documentActionInFlight =
    uploadDocumentMutation.isPending || parseDocumentMutation.isPending || analyzeCaseMutation.isPending;
  const actionInFlight =
    manualActionInFlight || documentActionInFlight;
  const analyzeBlockedReason =
    parseDocumentMutation.isPending
      ? 'Document parsing is still running. Wait for it to finish before analyzing.'
      : !hasUsableInput && caseDetail.documents.length > 0 && parsedDocumentsCount === 0
      ? 'Parse an attached document or add manual input before analyzing.'
      : !hasUsableInput
      ? 'Add manual input or a parsed document before analyzing this case.'
      : null;
  const canAnalyze = !actionInFlight && !analyzeBlockedReason;

  async function handleDraftCopy(draft: NegotiationShieldDraft) {
    try {
      await navigator.clipboard.writeText(buildCopyText(draft));
      setDraftFeedback({
        tone: 'success',
        message: 'Draft copied. You can paste it into an email or portal message now.',
      });
      trackEvent('DRAFT_COPIED', 'draft', {
        caseId: caseDetail.case.id,
        scenarioType: caseDetail.case.scenarioType,
        sourceType: caseDetail.case.sourceType,
        inputMode: getInputMode(caseDetail.case.sourceType),
        draftType: draft.draftType,
        hasDocument: caseDetail.documents.length > 0,
      });
      toast({ title: 'Draft copied', description: 'The latest message draft is ready to paste.' });
    } catch {
      setDraftFeedback({
        tone: 'error',
        message: 'Clipboard access was blocked. You can still select and copy the message manually.',
      });
      toast({ title: 'Copy failed', description: 'Your browser blocked clipboard access.', variant: 'destructive' });
      throw new Error('clipboard-copy-failed');
    }
  }

  const manualInputSection =
    caseDetail.case.scenarioType === 'CONTRACTOR_QUOTE_REVIEW' ? (
      <ContractorManualInputSection
        caseDetail={caseDetail}
        feedback={manualFeedback}
        isSaving={manualActionInFlight}
        onSave={(payload) => saveInputMutation.mutate(payload)}
      />
    ) : caseDetail.case.scenarioType === 'INSURANCE_PREMIUM_INCREASE' ? (
      <InsuranceManualInputSection
        caseDetail={caseDetail}
        feedback={manualFeedback}
        isSaving={manualActionInFlight}
        onSave={(payload) => saveInputMutation.mutate(payload)}
      />
    ) : caseDetail.case.scenarioType === 'INSURANCE_CLAIM_SETTLEMENT' ? (
      <ClaimSettlementManualInputSection
        caseDetail={caseDetail}
        feedback={manualFeedback}
        isSaving={manualActionInFlight}
        onSave={(payload) => saveInputMutation.mutate(payload)}
      />
    ) : caseDetail.case.scenarioType === 'BUYER_INSPECTION_NEGOTIATION' ? (
      <BuyerInspectionManualInputSection
        caseDetail={caseDetail}
        feedback={manualFeedback}
        isSaving={manualActionInFlight}
        onSave={(payload) => saveInputMutation.mutate(payload)}
      />
    ) : (
      <ContractorUrgencyManualInputSection
        caseDetail={caseDetail}
        feedback={manualFeedback}
        isSaving={manualActionInFlight}
        onSave={(payload) => saveInputMutation.mutate(payload)}
      />
    );

  const documentSection = (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <CardTitle>Documents</CardTitle>
        <CardDescription>{getDocumentSectionDescription(caseDetail.case.scenarioType)}</CardDescription>
      </CardHeader>
      <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-4 sm:space-y-6')}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_auto] xl:items-end">
          <Field label="Document name">
            <Input
              value={documentName}
              onChange={(event) => setDocumentName(event.target.value)}
              placeholder={selectedFile?.name || 'Use the original filename or add a cleaner label'}
              disabled={documentActionInFlight}
            />
          </Field>
          <Field label="Document type">
            <Select
              value={documentType}
              onValueChange={(nextValue: NegotiationShieldDocumentType) => setDocumentType(nextValue)}
              disabled={documentActionInFlight}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a document type" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="File">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.txt"
              disabled={documentActionInFlight}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                if (file && !documentName.trim()) {
                  setDocumentName(file.name);
                }
              }}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => uploadDocumentMutation.mutate()}
            disabled={documentActionInFlight || !selectedFile}
          >
            {uploadDocumentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploadDocumentMutation.isPending ? 'Attaching document...' : 'Upload and attach'}
          </Button>
          <p className="text-sm leading-6 text-muted-foreground">
            Attach the source document first, then parse it to pull useful text into the case.
          </p>
        </div>

        <InlineFeedback feedback={documentFeedback} />

        <Separator />

        {caseDetail.documents.length === 0 ? (
          <EmptyStateCard
            title="No documents attached yet"
            description={getEmptyStateDescription(caseDetail.case.scenarioType)}
          />
        ) : (
          <div className="space-y-3">
            {caseDetail.documents.map((document) => {
              const parseInfo = getDocumentParseInfo(document, caseDetail.inputs);
              const isParsingThisDocument =
                parseDocumentMutation.isPending && parseDocumentMutation.variables === document.id;

              return (
                <div key={document.id} className="rounded-2xl border border-border p-3.5 sm:p-4">
                  <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{document.fileName}</p>
                        <Badge variant="outline">{formatDocumentTypeLabel(document.documentType)}</Badge>
                        {parseInfo.isParsed ? <Badge variant="success">Parsed</Badge> : <Badge variant="outline">Not parsed yet</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Attached {formatDateTime(document.uploadedAt)}
                        {parseInfo.isParsed && parseInfo.parsedAt ? ` • Last parsed ${formatDateTime(parseInfo.parsedAt)}` : ''}
                      </p>
                      {parseInfo.isParsed ? (
                        <p className="text-sm text-muted-foreground">
                          Parsed fields: {parseInfo.parsedFieldCount}
                          {parseInfo.warnings.length ? ` • ${parseInfo.warnings.length} warning${parseInfo.warnings.length === 1 ? '' : 's'}` : ''}
                        </p>
                      ) : null}
                      {parseInfo.warnings.length ? (
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {parseInfo.warnings.map((warning) => (
                            <li key={warning} className="list-disc ml-5">
                              {warning}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      {document.fileUrl ? (
                        <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
                          <a href={document.fileUrl} target="_blank" rel="noreferrer">
                            <FileText className="h-4 w-4" />
                            View file
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => parseDocumentMutation.mutate(document.id)}
                        disabled={documentActionInFlight}
                      >
                        {isParsingThisDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                        {isParsingThisDocument ? 'Parsing...' : parseInfo.isParsed ? 'Re-parse' : 'Parse'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const analysisActionSection = (
    <Card className={cn(SECTION_CARD_CLASS, needsDocumentParseReminder ? 'border-amber-200/80' : '')}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <CardTitle>{hasAnalysis ? 'Refresh analysis' : 'Run analysis'}</CardTitle>
        <CardDescription>
          {hasAnalysis
            ? 'Update the guidance when your case changes so the leverage points and draft stay current.'
            : 'When your case has enough manual or parsed document context, run analysis to generate leverage points and a draft response.'}
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-3')}>
        {needsDocumentParseReminder ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-sm leading-6 text-amber-900">
            You can analyze with manual input only, but parsing your uploaded document first usually gives the review more context.
          </div>
        ) : null}
        {analyzeBlockedReason ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm leading-6 text-slate-700">
            {analyzeBlockedReason}
          </div>
        ) : null}
        <InlineFeedback feedback={analysisFeedback} />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => analyzeCaseMutation.mutate()}
            disabled={!canAnalyze}
          >
            {analyzeCaseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzeCaseMutation.isPending ? 'Analyzing...' : getAnalysisActionLabel(caseDetail.case.scenarioType)}
          </Button>
          <p className="text-sm leading-6 text-muted-foreground lg:max-w-xl lg:text-right">
            Manual details always take priority. Parsed document fields fill in gaps when available.
          </p>
        </div>
      </CardContent>
    </Card>
  );

  const resultsSection = <AnalysisResultsSection analysis={caseDetail.latestAnalysis} />;
  const draftSection = (
    <DraftSection
      caseId={caseDetail.case.id}
      draft={caseDetail.latestDraft}
      feedback={draftFeedback}
      onCopy={handleDraftCopy}
    />
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card className={SECTION_CARD_CLASS}>
        <CardHeader className={cn(SECTION_HEADER_CLASS, 'space-y-4')}>
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Button type="button" variant="ghost" className="-ml-3 w-fit" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
                Back to cases
              </Button>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getStatusVariant(caseDetail.case.status)}>{formatStatusLabel(caseDetail.case.status)}</Badge>
                  <Badge variant="outline">{formatScenarioLabel(caseDetail.case.scenarioType)}</Badge>
                  <Badge variant="outline">{formatSourceLabel(caseDetail.case.sourceType)}</Badge>
                </div>
                <CardTitle className="text-xl leading-tight sm:text-2xl">{caseDetail.case.title}</CardTitle>
                <CardDescription className="max-w-3xl">
                  {caseDetail.case.description ||
                    `${getWorkspaceDescription(caseDetail.case.scenarioType)} for ${property?.name || property?.address || 'this property'}.`}
                </CardDescription>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background px-3.5 py-3 text-sm text-muted-foreground sm:px-4">
              <p>Last updated {formatDateTime(caseDetail.case.updatedAt)}</p>
              <p className="mt-1">
                {caseDetail.documents.length} document{caseDetail.documents.length === 1 ? '' : 's'} attached
                {caseDetail.documents.length ? `, ${parsedDocumentsCount} parsed` : ''}
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {hasAnalysis ? (
        <>
          {resultsSection}
          {draftSection}
          {analysisActionSection}
          {manualInputSection}
          {documentSection}
        </>
      ) : (
        <>
          {manualInputSection}
          {documentSection}
          {analysisActionSection}
          {resultsSection}
          {draftSection}
        </>
      )}
    </div>
  );
}

export default function NegotiationShieldToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = asStringParam(params?.id);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const openedViewRef = useRef<string | null>(null);
  const previousPropertyIdRef = useRef<string | null>(null);
  const [createFeedback, setCreateFeedback] = useState<InlineFeedbackState | null>(null);

  const caseId = searchParams.get('caseId');
  const createMode = searchParams.get('create') === '1';
  const initialCreateScenario = getScenarioOptionByRouteValue(searchParams.get('scenario')).scenarioType;
  const hasStaleCaseSelectionForNewProperty = Boolean(
    previousPropertyIdRef.current &&
      previousPropertyIdRef.current !== propertyId &&
      caseId
  );

  function trackNegotiationEvent(event: string, section?: string, metadata?: Record<string, unknown>) {
    if (!propertyId) return;
    api.trackNegotiationShieldEvent(propertyId, { event, section, metadata }).catch(() => undefined);
  }

  function updateSearch(nextValues: Record<string, string | null | undefined>) {
    const nextParams = new URLSearchParams(searchParams.toString());

    Object.entries(nextValues).forEach(([key, value]) => {
      if (!value) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });

    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false });
  }

  function openCreate(routeValue?: ScenarioRouteValue) {
    setCreateFeedback(null);
    if (routeValue) {
      const scenarioType = getScenarioOptionByRouteValue(routeValue).scenarioType;
      trackNegotiationEvent('SCENARIO_SELECTED', 'entry', {
        scenarioType,
        source: 'entry',
        view: caseId ? 'detail' : createMode ? 'create' : 'list',
      });
    }

    updateSearch({
      caseId: null,
      create: '1',
      scenario: routeValue ?? null,
    });
  }

  function openCase(nextCaseId: string) {
    setCreateFeedback(null);
    updateSearch({
      caseId: nextCaseId,
      create: null,
      scenario: null,
    });
  }

  function goToList() {
    setCreateFeedback(null);
    updateSearch({
      caseId: null,
      create: null,
      scenario: null,
    });
  }

  const propertyQuery = useQuery({
    queryKey: ['property', propertyId],
    queryFn: async () => {
      const response = await api.getProperty(propertyId);
      if (response.success && response.data) {
        return response.data;
      }

      throw new Error(response.message || 'Failed to load property.');
    },
    enabled: Boolean(propertyId),
  });

  const casesQuery = useQuery({
    queryKey: ['negotiation-shield-cases', propertyId],
    queryFn: () => listNegotiationShieldCases(propertyId),
    enabled: Boolean(propertyId),
  });

  const selectedCaseQuery = useQuery({
    queryKey: ['negotiation-shield-case', propertyId, caseId],
    queryFn: () => getNegotiationShieldCaseDetail(propertyId, caseId as string),
    enabled: Boolean(propertyId && caseId && !hasStaleCaseSelectionForNewProperty),
  });

  const createCaseMutation = useMutation({
    mutationFn: (payload: CreateNegotiationShieldCasePayload) => createNegotiationShieldCase(propertyId, payload),
    onMutate: () => {
      setCreateFeedback({
        tone: 'info',
        message: 'Creating your review workspace...',
      });
    },
    onSuccess: (nextDetail) => {
      queryClient.setQueryData(['negotiation-shield-case', propertyId, nextDetail.case.id], nextDetail);
      queryClient.setQueryData<NegotiationShieldCaseDetail['case'][] | undefined>(
        ['negotiation-shield-cases', propertyId],
        (current) => upsertCaseSummary(current, nextDetail.case)
      );
      setCreateFeedback({
        tone: 'success',
        message: 'Case created. You can start adding input right away.',
      });
      trackNegotiationEvent('CASE_CREATED', 'create', {
        caseId: nextDetail.case.id,
        scenarioType: nextDetail.case.scenarioType,
        sourceType: nextDetail.case.sourceType,
        inputMode: getInputMode(nextDetail.case.sourceType),
        status: nextDetail.case.status,
      });
      toast({ title: 'Case created', description: 'You can start adding input right away.' });
      openCase(nextDetail.case.id);
    },
    onError: (error) => {
      setCreateFeedback({
        tone: 'error',
        message: errorMessage(error, 'We could not create the case yet. Your selections are still here, so you can try again.'),
      });
      toast({ title: 'Unable to create case', description: errorMessage(error, 'Please try again.'), variant: 'destructive' });
    },
  });

  const property = propertyQuery.data;
  const cases = casesQuery.data ?? [];
  const hasOpenCase = Boolean(caseId);

  const introAction = (
    <Button type="button" variant={hasOpenCase ? 'outline' : 'default'} className="hidden sm:inline-flex" onClick={() => openCreate()}>
      <Plus className="h-4 w-4" />
      Start review
    </Button>
  );

  useEffect(() => {
    if (!propertyId) return;

    if (previousPropertyIdRef.current && previousPropertyIdRef.current !== propertyId && caseId) {
      updateSearch({
        caseId: null,
        create: null,
        scenario: null,
      });
    }

    previousPropertyIdRef.current = propertyId;
  }, [caseId, propertyId]);

  useEffect(() => {
    if (!propertyId) return;

    const viewKey = `${propertyId}:${caseId ? 'detail' : createMode ? 'create' : 'list'}`;
    if (openedViewRef.current === viewKey) return;
    openedViewRef.current = viewKey;

    trackNegotiationEvent('OPENED', 'page', {
      view: caseId ? 'detail' : createMode ? 'create' : 'list',
      hasCaseSelection: Boolean(caseId),
      propertyLoaded: Boolean(property),
    });
  }, [caseId, createMode, property, propertyId]);

  if (!propertyId) {
    return (
      <MobilePageContainer className="space-y-4 sm:space-y-5 lg:max-w-7xl lg:px-8 lg:pb-10">
        <MobilePageIntro
          eyebrow="Home Tool"
          title="Negotiation Shield"
          subtitle="This route is missing the property context Negotiation Shield needs."
         className="lg:hidden"/>
        <Card className={SECTION_CARD_CLASS}>
          <CardHeader className={SECTION_HEADER_CLASS}>
            <CardTitle>Property context missing</CardTitle>
            <CardDescription>Return to your properties and reopen Negotiation Shield from the correct home.</CardDescription>
          </CardHeader>
          <CardContent className={SECTION_CONTENT_CLASS}>
            <Button type="button" className="w-full sm:w-auto" onClick={() => router.push('/dashboard/properties')}>
              Return to properties
            </Button>
          </CardContent>
        </Card>
      </MobilePageContainer>
    );
  }

  if (propertyQuery.isLoading && !property) {
    return (
      <MobilePageContainer className="space-y-4 sm:space-y-5 lg:max-w-7xl lg:px-8 lg:pb-10">
        <HomeToolsRail propertyId={propertyId} context="negotiation-shield" currentToolId="negotiation-shield" />
        <MobilePageIntro
          eyebrow="Home Tool"
          title="Negotiation Shield"
          subtitle="Loading the property context for this review..."
         className="lg:hidden"/>
        <DetailSkeleton />
      </MobilePageContainer>
    );
  }

  if (propertyQuery.isError && !property) {
    return (
      <MobilePageContainer className="space-y-4 sm:space-y-5 lg:max-w-7xl lg:px-8 lg:pb-10">
        <HomeToolsRail propertyId={propertyId} context="negotiation-shield" currentToolId="negotiation-shield" />
        <MobilePageIntro
          eyebrow="Home Tool"
          title="Negotiation Shield"
          subtitle="We could not load the property context for this tool."
         className="lg:hidden"/>
        <Card className={SECTION_CARD_CLASS}>
          <CardHeader className={SECTION_HEADER_CLASS}>
            <CardTitle>Property unavailable</CardTitle>
            <CardDescription>
              This property may be unavailable or you may not have access to it right now.
            </CardDescription>
          </CardHeader>
          <CardContent className={cn(SECTION_CONTENT_CLASS, 'flex flex-col gap-2.5 sm:flex-row sm:flex-wrap')}>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => propertyQuery.refetch()}>
              Try again
            </Button>
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => router.push('/dashboard/properties')}>
              Return to properties
            </Button>
          </CardContent>
        </Card>
      </MobilePageContainer>
    );
  }

  return (
    <MobilePageContainer className="space-y-4 sm:space-y-5 lg:max-w-7xl lg:px-8 lg:pb-10">
      <HomeToolsRail propertyId={propertyId} context="negotiation-shield" currentToolId="negotiation-shield" />

      <MobilePageIntro
        eyebrow="Home Tool"
        title="Negotiation Shield"
        subtitle="Review quotes, insurance disputes, and buyer requests, then get a message you can actually send."
        action={introAction}
       className="lg:hidden"/>

      <div className={cn(hasOpenCase ? 'grid gap-5 xl:items-start xl:grid-cols-[280px_minmax(0,1fr)]' : 'space-y-4 xl:space-y-5')}>
        {hasOpenCase ? (
          <DesktopCaseRail
            cases={cases}
            activeCaseId={caseId}
            isLoading={casesQuery.isLoading}
            isError={casesQuery.isError}
            isWorkspaceMode={hasOpenCase}
            onOpenCase={openCase}
            onOpenCreate={openCreate}
            onRefetch={() => casesQuery.refetch()}
          />
        ) : null}
        <div className="space-y-4 xl:space-y-4">
          {selectedCaseQuery.isLoading ? (
            <DetailSkeleton />
          ) : selectedCaseQuery.data ? (
            <CaseWorkspace
              propertyId={propertyId}
              property={property}
              caseDetail={selectedCaseQuery.data}
              onBack={goToList}
              trackEvent={trackNegotiationEvent}
            />
          ) : caseId && selectedCaseQuery.isError ? (
            <Card className={SECTION_CARD_CLASS}>
              <CardHeader className={SECTION_HEADER_CLASS}>
                <CardTitle>Unable to load this case</CardTitle>
                <CardDescription>
                  This case may have moved, been removed, or be unavailable for the current property.
                </CardDescription>
              </CardHeader>
              <CardContent className={cn(SECTION_CONTENT_CLASS, 'flex flex-col gap-2.5 sm:flex-row sm:flex-wrap')}>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => selectedCaseQuery.refetch()}>
                  Try again
                </Button>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={goToList}>
                  Return to case list
                </Button>
              </CardContent>
            </Card>
          ) : createMode ? (
            <CreateCasePanel
              initialScenario={initialCreateScenario}
              feedback={createFeedback}
              isSubmitting={createCaseMutation.isPending}
              onCancel={goToList}
              onScenarioSelected={(scenarioType) =>
                trackNegotiationEvent('SCENARIO_SELECTED', 'create', {
                  scenarioType,
                  source: 'create-panel',
                })
              }
              onSubmit={(payload) => createCaseMutation.mutate(payload)}
            />
          ) : (
            <div className="space-y-4 xl:space-y-5">
              <Card className={SECTION_CARD_CLASS} id="negotiation-shield-launcher">
                <CardHeader className={SECTION_HEADER_CLASS}>
                  <CardTitle>Start a new review</CardTitle>
                  <CardDescription>
                    Pick the situation you want reviewed, then build the case from there.
                  </CardDescription>
                </CardHeader>
                <CardContent className={SECTION_CONTENT_CLASS}>
                  <ScenarioQuickStart onStart={(scenario) => openCreate(scenario)} />
                </CardContent>
              </Card>

              <Card className={SECTION_CARD_CLASS}>
                <CardHeader className={SECTION_HEADER_CLASS}>
                  <CardTitle className="text-base">Existing cases</CardTitle>
                  <CardDescription>Reopen a saved review for this property.</CardDescription>
                </CardHeader>
                <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-4')}>
                  {casesQuery.isLoading ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading your recent reviews...
                    </div>
                  ) : casesQuery.isError ? (
                    <div className="space-y-3">
                      <EmptyStateCard
                        title="Unable to load cases"
                        description="We could not load the latest reviews for this property."
                      />
                      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => casesQuery.refetch()}>
                        Try again
                      </Button>
                    </div>
                  ) : cases.length === 0 ? (
                    <EmptyStateCard
                      title="No reviews yet"
                      description="Your saved Negotiation Shield cases will appear here once you start one."
                    />
                  ) : (
                    <div className="space-y-3">
                      {cases.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openCase(item.id)}
                          className="flex w-full flex-col items-start gap-2 rounded-2xl border border-border bg-white p-3.5 text-left transition-colors hover:border-foreground/15 hover:bg-accent/20 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:p-4"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{item.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{formatScenarioLabel(item.scenarioType)}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={getStatusVariant(item.status)}>{formatStatusLabel(item.status)}</Badge>
                            <span className="text-xs text-muted-foreground">Updated {formatDateTime(item.updatedAt)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      <BottomSafeAreaReserve size="chatAware" />
    </MobilePageContainer>
  );
}
