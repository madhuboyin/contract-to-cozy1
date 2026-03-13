'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clipboard,
  FileText,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import HomeToolsRail from '@/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileFilterSurface,
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

type ScenarioRouteValue = 'contractor-quote-review' | 'insurance-premium-increase';
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

const SCENARIO_OPTIONS: Array<{
  routeValue: ScenarioRouteValue;
  scenarioType: NegotiationShieldCaseScenarioType;
  label: string;
  shortDescription: string;
}> = [
  {
    routeValue: 'contractor-quote-review',
    scenarioType: 'CONTRACTOR_QUOTE_REVIEW',
    label: 'Contractor quote review',
    shortDescription: 'Review a contractor estimate, surface leverage, and draft a response before you approve the work.',
  },
  {
    routeValue: 'insurance-premium-increase',
    scenarioType: 'INSURANCE_PREMIUM_INCREASE',
    label: 'Insurance premium increase',
    shortDescription: 'Review a renewal jump, identify property-backed leverage, and prepare a firm request for review.',
  },
];

const DOCUMENT_TYPE_OPTIONS: Array<{
  value: NegotiationShieldDocumentType;
  label: string;
}> = [
  { value: 'QUOTE', label: 'Quote or estimate' },
  { value: 'PREMIUM_NOTICE', label: 'Premium notice' },
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

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapCaseDocumentToUploadType(documentType: NegotiationShieldDocumentType): DocumentType {
  switch (documentType) {
    case 'QUOTE':
      return 'ESTIMATE';
    case 'PREMIUM_NOTICE':
      return 'INSURANCE_CERTIFICATE';
    case 'SUPPORTING_DOCUMENT':
      return 'OTHER';
    default:
      return 'OTHER';
  }
}

function getInputTypeForScenario(scenarioType: NegotiationShieldCaseScenarioType): NegotiationShieldInputType {
  return scenarioType === 'CONTRACTOR_QUOTE_REVIEW' ? 'CONTRACTOR_QUOTE' : 'INSURANCE_PREMIUM';
}

function getAnalysisActionLabel(scenarioType: NegotiationShieldCaseScenarioType) {
  return scenarioType === 'CONTRACTOR_QUOTE_REVIEW' ? 'Analyze quote' : 'Review premium increase';
}

function getEmptyStateDescription(scenarioType: NegotiationShieldCaseScenarioType) {
  return scenarioType === 'CONTRACTOR_QUOTE_REVIEW'
    ? 'Add quote details or upload the estimate to surface leverage before you reply.'
    : 'Add renewal details or upload the notice to prepare a stronger review request.';
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
    <div className="grid gap-3">
      {SCENARIO_OPTIONS.map((option) => (
        <button
          key={option.routeValue}
          type="button"
          onClick={() => onStart(option.routeValue)}
          className="rounded-2xl border border-border bg-white p-3.5 text-left transition-colors hover:border-foreground/20 hover:bg-accent/40 sm:p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{option.label}</p>
              <p className="text-sm leading-6 text-muted-foreground">{option.shortDescription}</p>
            </div>
            <ShieldCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />
          </div>
        </button>
      ))}
    </div>
  );
}

function CreateCasePanel({
  initialScenario,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  initialScenario: NegotiationShieldCaseScenarioType;
  isSubmitting: boolean;
  onCancel: () => void;
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
                onClick={() => setScenarioType(option.scenarioType)}
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
              placeholder={
                selectedScenario.scenarioType === 'CONTRACTOR_QUOTE_REVIEW'
                  ? 'Example: Roof replacement estimate review'
                  : 'Example: Homeowners premium increase review'
              }
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
  isSaving,
  onSave,
}: {
  caseDetail: NegotiationShieldCaseDetail;
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

        <div className="flex justify-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onSave(buildContractorPayload(values, manualInput?.id ?? undefined))}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save input
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InsuranceManualInputSection({
  caseDetail,
  isSaving,
  onSave,
}: {
  caseDetail: NegotiationShieldCaseDetail;
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

        <div className="flex justify-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onSave(buildInsurancePayload(values, manualInput?.id ?? undefined))}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save input
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

  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <CardTitle>Analysis results</CardTitle>
            <CardDescription>Grounded guidance based on the case details currently saved for this property.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {pricingAssessment.status ? <Badge variant="secondary">{pricingAssessment.status.replace(/_/g, ' ')}</Badge> : null}
            {confidenceLabel ? <Badge variant="outline">{confidenceLabel}</Badge> : null}
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
          />
          <ResultList
            title="Negotiation leverage"
            emptyLabel="No leverage points were returned yet."
            items={leveragePoints}
            titleKey="title"
            bodyKey="detail"
            metaKey="strength"
          />
        </div>

        <ResultList
          title="Recommended actions"
          emptyLabel="No recommended actions were returned yet."
          items={recommendedActions}
          titleKey="title"
          bodyKey="detail"
          metaKey="priority"
          ordered
        />

        {(pricingAssessment.summary || pricingAssessment.rationale?.length || pricingAssessment.increaseAmount || pricingAssessment.quoteAmount) ? (
          <div className="rounded-2xl border border-border p-3.5 sm:p-4">
            <p className="text-sm font-semibold text-foreground">Pricing assessment</p>
            {pricingAssessment.summary ? <p className="mt-2 text-sm leading-6 text-foreground/85 sm:leading-7">{pricingAssessment.summary}</p> : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {typeof pricingAssessment.quoteAmount === 'number' ? (
                <Badge variant="outline">Quote amount: {pricingAssessment.quoteAmount}</Badge>
              ) : null}
              {typeof pricingAssessment.priorPremium === 'number' ? (
                <Badge variant="outline">Prior premium: {pricingAssessment.priorPremium}</Badge>
              ) : null}
              {typeof pricingAssessment.newPremium === 'number' ? (
                <Badge variant="outline">New premium: {pricingAssessment.newPremium}</Badge>
              ) : null}
              {typeof pricingAssessment.increaseAmount === 'number' ? (
                <Badge variant="outline">Increase: {pricingAssessment.increaseAmount}</Badge>
              ) : null}
              {typeof pricingAssessment.increasePercentage === 'number' ? (
                <Badge variant="outline">Increase %: {Math.round(pricingAssessment.increasePercentage)}%</Badge>
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
  ordered = false,
}: {
  title: string;
  emptyLabel: string;
  items: Array<Record<string, unknown>>;
  titleKey: string;
  bodyKey: string;
  metaKey?: string;
  ordered?: boolean;
}) {
  const ListTag = ordered ? 'ol' : 'ul';

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
            const itemMeta = metaKey && typeof item[metaKey] === 'string' ? String(item[metaKey]) : null;

            return (
              <li key={`${itemTitle}-${index}`} className="rounded-xl border border-border bg-background p-2.5 sm:p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{itemTitle}</p>
                    {itemBody ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{itemBody}</p> : null}
                  </div>
                  {itemMeta ? <Badge variant="outline">{itemMeta}</Badge> : null}
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
  draft,
}: {
  draft: NegotiationShieldDraft | null;
}) {
  const { toast } = useToast();

  async function handleCopy() {
    if (!draft) return;

    try {
      await navigator.clipboard.writeText(buildCopyText(draft));
      toast({ title: 'Draft copied', description: 'The latest message draft is ready to paste.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Your browser blocked clipboard access.', variant: 'destructive' });
    }
  }

  return (
    <Card className={SECTION_CARD_CLASS}>
      <CardHeader className={SECTION_HEADER_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <CardTitle>Negotiation draft</CardTitle>
            <CardDescription>A homeowner-ready message generated from the latest analysis.</CardDescription>
          </div>
          {draft ? (
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleCopy}>
              <Clipboard className="h-4 w-4" />
              Copy draft
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={SECTION_CONTENT_CLASS}>
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
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message</p>
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

function CaseWorkspace({
  propertyId,
  property,
  caseDetail,
  onBack,
}: {
  propertyId: string;
  property: Property | undefined;
  caseDetail: NegotiationShieldCaseDetail;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [documentType, setDocumentType] = useState<NegotiationShieldDocumentType>(
    caseDetail.case.scenarioType === 'CONTRACTOR_QUOTE_REVIEW' ? 'QUOTE' : 'PREMIUM_NOTICE'
  );

  useEffect(() => {
    setSelectedFile(null);
    setDocumentName('');
    setDocumentType(caseDetail.case.scenarioType === 'CONTRACTOR_QUOTE_REVIEW' ? 'QUOTE' : 'PREMIUM_NOTICE');
  }, [caseDetail.case.id, caseDetail.case.scenarioType]);

  const detailQueryKey = ['negotiation-shield-case', propertyId, caseDetail.case.id];
  const listQueryKey = ['negotiation-shield-cases', propertyId];

  function syncCaseDetail(nextDetail: NegotiationShieldCaseDetail) {
    queryClient.setQueryData(detailQueryKey, nextDetail);
    queryClient.invalidateQueries({ queryKey: listQueryKey });
  }

  const saveInputMutation = useMutation({
    mutationFn: (payload: SaveNegotiationShieldInputPayload) => saveNegotiationShieldInput(propertyId, caseDetail.case.id, payload),
    onSuccess: (nextDetail) => {
      syncCaseDetail(nextDetail);
      toast({ title: 'Input saved', description: 'Your case details were updated.' });
    },
    onError: (error) => {
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
    onSuccess: (nextDetail) => {
      syncCaseDetail(nextDetail);
      setSelectedFile(null);
      setDocumentName('');
      toast({ title: 'Document attached', description: 'The file is now available inside this review.' });
    },
    onError: (error) => {
      toast({ title: 'Upload failed', description: errorMessage(error, 'Unable to upload and attach this document.'), variant: 'destructive' });
    },
  });

  const parseDocumentMutation = useMutation({
    mutationFn: (caseDocumentId: string) => parseNegotiationShieldCaseDocument(propertyId, caseDetail.case.id, caseDocumentId),
    onSuccess: (nextDetail) => {
      syncCaseDetail(nextDetail);
      toast({ title: 'Document parsed', description: 'Parsed content is now available to the analysis flow.' });
    },
    onError: (error) => {
      toast({ title: 'Parse failed', description: errorMessage(error, 'Unable to parse this document.'), variant: 'destructive' });
    },
  });

  const analyzeCaseMutation = useMutation({
    mutationFn: () => analyzeNegotiationShieldCase(propertyId, caseDetail.case.id),
    onSuccess: (nextDetail) => {
      syncCaseDetail(nextDetail);
      toast({ title: 'Analysis complete', description: 'Negotiation guidance and a draft message are ready.' });
    },
    onError: (error) => {
      toast({ title: 'Analysis failed', description: errorMessage(error, 'Unable to analyze this case yet.'), variant: 'destructive' });
    },
  });

  const parsedDocumentsCount = caseDetail.documents.filter((document) => getDocumentParseInfo(document, caseDetail.inputs).isParsed).length;
  const needsDocumentParseReminder = caseDetail.documents.length > 0 && parsedDocumentsCount === 0;

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
                    `Use this workspace to gather context, run analysis, and prepare a response for ${property?.name || property?.address || 'this property'}.`}
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

      {caseDetail.case.scenarioType === 'CONTRACTOR_QUOTE_REVIEW' ? (
        <ContractorManualInputSection
          caseDetail={caseDetail}
          isSaving={saveInputMutation.isPending}
          onSave={(payload) => saveInputMutation.mutate(payload)}
        />
      ) : (
        <InsuranceManualInputSection
          caseDetail={caseDetail}
          isSaving={saveInputMutation.isPending}
          onSave={(payload) => saveInputMutation.mutate(payload)}
        />
      )}

      <Card className={SECTION_CARD_CLASS}>
        <CardHeader className={SECTION_HEADER_CLASS}>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Attach the quote, renewal notice, or supporting screenshots using the existing upload flow.</CardDescription>
        </CardHeader>
        <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-4 sm:space-y-6')}>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_auto] xl:items-end">
            <Field label="Document name">
              <Input
                value={documentName}
                onChange={(event) => setDocumentName(event.target.value)}
                placeholder={selectedFile?.name || 'Use the original filename or add a cleaner label'}
              />
            </Field>
            <Field label="Document type">
              <Select value={documentType} onValueChange={(nextValue: NegotiationShieldDocumentType) => setDocumentType(nextValue)}>
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
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.txt"
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
              disabled={uploadDocumentMutation.isPending || !selectedFile}
            >
              {uploadDocumentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload and attach
            </Button>
            <p className="text-sm leading-6 text-muted-foreground">
              Attach the source document first, then parse it to pull useful text into the case.
            </p>
          </div>

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
                          disabled={isParsingThisDocument}
                        >
                          {isParsingThisDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                          {parseInfo.isParsed ? 'Re-parse' : 'Parse'}
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

      <Card className={cn(SECTION_CARD_CLASS, needsDocumentParseReminder ? 'border-amber-200/80' : '')}>
        <CardHeader className={SECTION_HEADER_CLASS}>
          <CardTitle>Run analysis</CardTitle>
          <CardDescription>
            When your case has enough manual or parsed document context, run analysis to generate leverage points and a draft response.
          </CardDescription>
        </CardHeader>
        <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-3')}>
          {needsDocumentParseReminder ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-sm leading-6 text-amber-900">
              You can analyze with manual input only, but parsing your uploaded document first usually gives the review more context.
            </div>
          ) : null}
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => analyzeCaseMutation.mutate()}
            disabled={analyzeCaseMutation.isPending}
          >
            {analyzeCaseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {getAnalysisActionLabel(caseDetail.case.scenarioType)}
          </Button>
          <p className="text-sm leading-6 text-muted-foreground">
            Manual details always take priority. Parsed document fields fill in gaps when available.
          </p>
        </CardContent>
      </Card>

      <AnalysisResultsSection analysis={caseDetail.latestAnalysis} />
      <DraftSection draft={caseDetail.latestDraft} />
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

  const caseId = searchParams.get('caseId');
  const createMode = searchParams.get('create') === '1';
  const initialCreateScenario = getScenarioOptionByRouteValue(searchParams.get('scenario')).scenarioType;

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
    updateSearch({
      caseId: null,
      create: '1',
      scenario: routeValue ?? null,
    });
  }

  function openCase(nextCaseId: string) {
    updateSearch({
      caseId: nextCaseId,
      create: null,
      scenario: null,
    });
  }

  function goToList() {
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
      return response.data;
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
    enabled: Boolean(propertyId && caseId),
  });

  const createCaseMutation = useMutation({
    mutationFn: (payload: CreateNegotiationShieldCasePayload) => createNegotiationShieldCase(propertyId, payload),
    onSuccess: (nextDetail) => {
      queryClient.setQueryData(['negotiation-shield-case', propertyId, nextDetail.case.id], nextDetail);
      queryClient.invalidateQueries({ queryKey: ['negotiation-shield-cases', propertyId] });
      toast({ title: 'Case created', description: 'You can start adding input right away.' });
      openCase(nextDetail.case.id);
    },
    onError: (error) => {
      toast({ title: 'Unable to create case', description: errorMessage(error, 'Please try again.'), variant: 'destructive' });
    },
  });

  const property = propertyQuery.data;
  const cases = casesQuery.data ?? [];

  const introAction = (
    <Button type="button" className="hidden sm:inline-flex" onClick={() => openCreate()}>
      <Plus className="h-4 w-4" />
      Start new review
    </Button>
  );

  return (
    <MobilePageContainer className="space-y-4 sm:space-y-5">
      <HomeToolsRail propertyId={propertyId} />

      <MobilePageIntro
        eyebrow="Home Tool"
        title="Negotiation Shield"
        subtitle="Review quotes or premium increases and get a message you can actually send."
        action={introAction}
      />

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
        <div className="hidden xl:block xl:sticky xl:top-6 xl:space-y-4">
          <MobileFilterSurface className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Start a new review</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Create a case for a contractor quote or an insurance premium increase for {property?.name || property?.address || 'this property'}.
              </p>
            </div>
            <ScenarioQuickStart onStart={(scenario) => openCreate(scenario)} />
          </MobileFilterSurface>

          <Card className={SECTION_CARD_CLASS}>
            <CardHeader className={SECTION_HEADER_CLASS}>
              <CardTitle className="text-base">Recent cases</CardTitle>
              <CardDescription>Property-scoped reviews stay here so you can reopen them later.</CardDescription>
            </CardHeader>
            <CardContent className={SECTION_CONTENT_CLASS}>
              {casesQuery.isLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading cases...
                </div>
              ) : cases.length === 0 ? (
                <p className="text-sm leading-6 text-muted-foreground">No cases yet. Start with the scenario that matches what you need reviewed.</p>
              ) : (
                <div className="space-y-3">
                  {cases.map((item) => {
                    const active = caseId === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openCase(item.id)}
                        className={cn(
                          'w-full rounded-2xl border p-4 text-left transition-colors',
                          active ? 'border-foreground/20 bg-accent/40' : 'border-border bg-white hover:border-foreground/15 hover:bg-accent/30'
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

        <div className="space-y-4 xl:space-y-4">
          {selectedCaseQuery.isLoading ? (
            <DetailSkeleton />
          ) : selectedCaseQuery.data ? (
            <CaseWorkspace propertyId={propertyId} property={property} caseDetail={selectedCaseQuery.data} onBack={goToList} />
          ) : caseId && selectedCaseQuery.isError ? (
            <Card className={SECTION_CARD_CLASS}>
              <CardHeader className={SECTION_HEADER_CLASS}>
                <CardTitle>Unable to load this case</CardTitle>
                <CardDescription>{errorMessage(selectedCaseQuery.error, 'The case may have been removed or you may not have access to it.')}</CardDescription>
              </CardHeader>
              <CardContent className={SECTION_CONTENT_CLASS}>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={goToList}>
                  Return to case list
                </Button>
              </CardContent>
            </Card>
          ) : createMode ? (
            <CreateCasePanel
              initialScenario={initialCreateScenario}
              isSubmitting={createCaseMutation.isPending}
              onCancel={goToList}
              onSubmit={(payload) => createCaseMutation.mutate(payload)}
            />
          ) : (
            <Card className={SECTION_CARD_CLASS}>
              <CardHeader className={SECTION_HEADER_CLASS}>
                <CardTitle>Negotiation Shield workspace</CardTitle>
                <CardDescription>
                  Start with a scenario or reopen an existing review to keep moving.
                </CardDescription>
              </CardHeader>
              <CardContent className={cn(SECTION_CONTENT_CLASS, 'space-y-5 sm:space-y-6')}>
                <div className="sm:hidden">
                  <Button type="button" className="w-full" onClick={() => openCreate()}>
                    <Plus className="h-4 w-4" />
                    Start new review
                  </Button>
                </div>
                {casesQuery.isError ? (
                  <EmptyStateCard title="Unable to load cases" description={errorMessage(casesQuery.error, 'Try refreshing the page.')} />
                ) : cases.length === 0 ? (
                  <div className="space-y-4">
                    <EmptyStateCard
                      title="No reviews yet"
                      description="Use Negotiation Shield when you want a second pass on a contractor quote or when your insurance renewal jumps and you need better leverage."
                    />
                    <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                      {SCENARIO_OPTIONS.map((option) => (
                        <button
                          key={option.routeValue}
                          type="button"
                          onClick={() => openCreate(option.routeValue)}
                          className="rounded-2xl border border-border bg-white p-4 text-left transition-colors hover:border-foreground/15 hover:bg-accent/30 sm:p-5"
                        >
                          <p className="text-sm font-semibold text-foreground">{option.label}</p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">{option.shortDescription}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                      {SCENARIO_OPTIONS.map((option) => (
                        <button
                          key={option.routeValue}
                          type="button"
                          onClick={() => openCreate(option.routeValue)}
                          className="rounded-2xl border border-border bg-white p-4 text-left transition-colors hover:border-foreground/15 hover:bg-accent/30 sm:p-5"
                        >
                          <p className="text-sm font-semibold text-foreground">{option.label}</p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">{option.shortDescription}</p>
                        </button>
                      ))}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-foreground">Existing cases</p>
                      {cases.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openCase(item.id)}
                          className="flex w-full flex-col items-start gap-2.5 rounded-2xl border border-border bg-white p-3.5 text-left transition-colors hover:border-foreground/15 hover:bg-accent/30 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:p-4"
                        >
                          <div>
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
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <BottomSafeAreaReserve size="chatAware" />
    </MobilePageContainer>
  );
}
