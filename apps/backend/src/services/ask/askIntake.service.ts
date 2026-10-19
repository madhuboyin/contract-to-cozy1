import type { ExtractedFactCandidate, HouseholdRole, PropertyRecordType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { APIError } from '../../middleware/error.middleware';
import { visibleRecordWhere } from '../homeRecordsAccess';
import { homeRecordsService } from '../homeRecords.service';
import {
  DOCUMENT_TYPE_FIELD_KEY, EXPENSE_REQUIRED_FIELD_KEYS, INSURANCE_POLICY_REQUIRED_FIELD_KEYS, WARRANTY_REQUIRED_FIELD_KEYS, homeRecordsExtractionService,
} from '../homeRecordsExtraction.service';
import { documentIntelligenceService, type DocumentInsights } from '../documentIntelligence.service';
import { documentInsightsToExtractionEnvelope, DOCUMENT_INTELLIGENCE_MODEL_ID } from '../documentIntelligenceExtractionEnvelope.adapter';
import { createInspectionReportFromFindings, extractInspectionFindings, type ExtractedFinding } from '../inspectionExtraction.service';
import { describeLocation, excerptHash } from '../documentLocationEvidence';
import { scanLabelToDraft } from '../inventoryLabelScan.service';
import { InventoryDraftService } from '../inventoryDraft.service';
import { downloadObjectBuffer } from '../storage/reportStorage';
import {
  ASK_INTAKE_ACCEPTED_TYPES, ASK_INTAKE_CLASSIFICATION_FLOOR, ASK_INTAKE_CONTRACT_VERSION, ASK_INTAKE_DISCLOSURES, ASK_INTAKE_INSPECTION_REPORT_TYPES, ASK_INTAKE_KIND_OPTIONS,
  ASK_INTAKE_MAX_BYTES, ASK_INTAKE_SENSITIVITIES,
  type AskIntakeCandidate, type AskIntakeEvidence, type AskIntakeFacet, type AskIntakeFindingDetail, type AskIntakeInspectionReportType, type AskIntakeKind, type AskIntakeSensitivity, type AskIntakeState, type AskIntakeView,
} from './askIntake.contract';

export interface AskIntakeContext { propertyId: string; userId: string; role: HouseholdRole }

const draftService = new InventoryDraftService();

const RECORD_TYPE_FOR_KIND: Record<AskIntakeKind, PropertyRecordType> = {
  WARRANTY: 'WARRANTY', RECEIPT: 'RECEIPT', INSURANCE_POLICY: 'INSURANCE_POLICY', INSPECTION_REPORT: 'INSPECTION_REPORT', APPLIANCE_LABEL: 'PHOTO',
};
const DOMAIN_FOR_KIND = { WARRANTY: 'WARRANTY', RECEIPT: 'EXPENSE', INSURANCE_POLICY: 'INSURANCE_POLICY' } as const;
const RESULT_ENTITY_FOR_KIND = { WARRANTY: 'WARRANTY', RECEIPT: 'EXPENSE', INSURANCE_POLICY: 'INSURANCE_POLICY' } as const;
const REQUIRED_FOR_KIND: Record<'WARRANTY' | 'RECEIPT' | 'INSURANCE_POLICY', readonly string[]> = {
  WARRANTY: WARRANTY_REQUIRED_FIELD_KEYS, RECEIPT: EXPENSE_REQUIRED_FIELD_KEYS, INSURANCE_POLICY: INSURANCE_POLICY_REQUIRED_FIELD_KEYS,
};
const FIELD_LABELS: Record<string, string> = {
  providerName: 'Provider', startDate: 'Start date', expiryDate: 'End date', category: 'Category', coverageDetails: 'What is covered', cost: 'Cost',
  description: 'What it was for', amount: 'Amount', transactionDate: 'Date',
  carrierName: 'Carrier', policyNumber: 'Policy number', coverageType: 'Coverage type', premiumAmount: 'Premium', deductibleAmount: 'Deductible',
  dwellingLimit: 'Dwelling limit', personalPropertyLimit: 'Personal property limit', liabilityLimit: 'Liability limit', valuationBasis: 'Valuation basis',
  termStart: 'Policy start', termEnd: 'Policy end',
};
const LABEL_FIELDS: Array<{ key: 'manufacturer' | 'modelNumber' | 'serialNumber' | 'upc' | 'sku'; label: string }> = [
  { key: 'manufacturer', label: 'Brand' }, { key: 'modelNumber', label: 'Model number' }, { key: 'serialNumber', label: 'Serial number' }, { key: 'upc', label: 'Barcode (UPC)' }, { key: 'sku', label: 'SKU' },
];
const DOC_KIND_BY_MODEL_TYPE: Partial<Record<DocumentInsights['documentType'], AskIntakeKind>> = {
  WARRANTY: 'WARRANTY', RECEIPT: 'RECEIPT', INVOICE: 'RECEIPT', INSURANCE: 'INSURANCE_POLICY', INSPECTION: 'INSPECTION_REPORT',
};
const CONTENT_CHECKS = 'Checked that the file type matches its contents and scanned for embedded executables and active content. This is not a full antivirus scan.';

const invalid = (message: string, code = 'ASK_INVALID_REQUEST') => new APIError(message, 400, code);

/** Pure: which kind a model reading points to, or null when the person must choose. */
export function classifyReading(insights: Pick<DocumentInsights, 'documentType' | 'confidence'>, mimeType: string): { kind: AskIntakeKind | null; reason: string | null } {
  const kind = DOC_KIND_BY_MODEL_TYPE[insights.documentType] ?? null;
  if (!kind) return { kind: null, reason: insights.documentType === 'MANUAL' ? 'This looks like a manual, which is kept but has no details to propose.' : 'We could not tell what kind of document this is.' };
  if (insights.confidence < ASK_INTAKE_CLASSIFICATION_FLOOR) return { kind: null, reason: 'We are not sure what kind of document this is.' };
  if (kind === 'INSPECTION_REPORT' && mimeType !== 'application/pdf') return { kind: null, reason: 'An inspection report has to be a PDF.' };
  return { kind, reason: null };
}

function optionsFor(mimeType: string) {
  return ASK_INTAKE_KIND_OPTIONS.filter((option) => mimeType !== 'application/pdf' ? option.acceptsImages : option.kind !== 'APPLIANCE_LABEL').map(({ kind, label, description }) => ({ kind, label, description }));
}

function kindFromRecord(recordType: PropertyRecordType, hasLabelDraft: boolean): AskIntakeKind | null {
  if (recordType === 'WARRANTY' || recordType === 'RECEIPT' || recordType === 'INSURANCE_POLICY' || recordType === 'INSPECTION_REPORT') return recordType;
  if (recordType === 'PHOTO' && hasLabelDraft) return 'APPLIANCE_LABEL';
  return null;
}

async function loadRecord(ctx: AskIntakeContext, recordId: string) {
  const record = await prisma.propertyRecord.findFirst({
    where: { id: recordId, propertyId: ctx.propertyId, ...visibleRecordWhere(ctx.role) },
    include: { currentVersion: { include: { extractedFacts: { orderBy: { createdAt: 'asc' } } } } },
  });
  if (!record || !record.currentVersion) throw new APIError('File not found.', 404, 'ASK_INTAKE_NOT_FOUND');
  return { record, version: record.currentVersion };
}

async function findLabelDraft(ctx: AskIntakeContext, recordId: string) {
  return prisma.inventoryDraftItem.findFirst({
    where: { propertyId: ctx.propertyId, userId: ctx.userId, explanationJson: { path: ['intake', 'recordId'], equals: recordId } },
    orderBy: { createdAt: 'desc' },
  });
}

async function findInspectionReport(ctx: AskIntakeContext, recordId: string) {
  return prisma.inspectionReport.findFirst({
    where: { propertyId: ctx.propertyId, sourceEntityType: 'PROPERTY_RECORD', sourceEntityId: recordId },
    orderBy: { createdAt: 'desc' },
  });
}

const INSPECTION_DETAILS_KEY = '_inspectionDetails';
const INFORMATIONAL_KEYS = new Set<string>([DOCUMENT_TYPE_FIELD_KEY, INSPECTION_DETAILS_KEY]);
const SYSTEM_LABELS: Record<string, string> = {
  ROOF: 'Roof', EXTERIOR: 'Exterior', FOUNDATION: 'Foundation', BASEMENT_CRAWLSPACE: 'Basement or crawlspace', STRUCTURAL: 'Structure', ELECTRICAL: 'Electrical', PLUMBING: 'Plumbing', HVAC: 'Heating and cooling',
  INTERIOR: 'Interior', ATTIC_INSULATION: 'Attic and insulation', APPLIANCES: 'Appliances', GARAGE: 'Garage', SITE_GRADING: 'Site and grading',
};
const SEVERITY_LABELS: Record<string, string> = { SAFETY: 'Safety', MAJOR: 'Major', MINOR: 'Minor', MONITOR: 'Monitor', INFORMATIONAL: 'For information' };
const CONFIDENCE_BY_TIER: Record<string, number> = { HIGH: 0.9, MEDIUM: 0.6, LOW: 0.35 };

function parseFinding(raw: string | null): (ExtractedFinding & { evidence?: unknown }) | null {
  if (!raw) return null;
  try { const value = JSON.parse(raw); return value && typeof value.homeSystem === 'string' && typeof value.inspectorDescription === 'string' ? value : null; } catch { return null; }
}

function findingDetail(finding: ExtractedFinding): AskIntakeFindingDetail {
  return {
    homeSystem: SYSTEM_LABELS[finding.homeSystem] ?? finding.homeSystem, severity: SEVERITY_LABELS[finding.severity] ?? finding.severity, conditionRating: finding.conditionRating,
    recommendation: finding.inspectorRecommendation, interpretation: finding.aiInterpretation, location: [finding.subsystem, finding.location].filter(Boolean).join(', ') || null,
    costRangeCents: { low: finding.estimatedCostCentsLow ?? null, high: finding.estimatedCostCentsHigh ?? null },
  };
}

function evidenceFacet(row: ExtractedFactCandidate): AskIntakeFacet<AskIntakeEvidence> {
  const region = (row.sourceRegionJson ?? null) as { box?: number[] | null; excerpt?: string | null; basis?: 'TEXT_MATCH' | 'MODEL_REPORTED' } | null;
  if (row.sourcePage == null && !region?.box && !region?.excerpt) return { status: 'NOT_RECORDED', reason: 'The reader did not say where in the file this was found.' };
  const box = region?.box ?? null;
  return { status: 'AVAILABLE', value: { page: row.sourcePage, box, excerpt: region?.excerpt ?? null, basis: region?.basis ?? 'MODEL_REPORTED', description: describeLocation({ page: row.sourcePage, box }) } };
}

function candidateView(row: ExtractedFactCandidate, required: readonly string[]): AskIntakeCandidate {
  const finding = row.targetDomain === 'INSPECTION_FINDING' ? parseFinding(row.proposedValue) : null;
  return {
    id: row.id, fieldKey: row.fieldKey, label: finding ? `${SYSTEM_LABELS[finding.homeSystem] ?? finding.homeSystem} · ${SEVERITY_LABELS[finding.severity] ?? finding.severity}` : FIELD_LABELS[row.fieldKey] ?? row.fieldKey,
    proposedValue: finding ? finding.inspectorDescription : row.proposedValue, reviewedValue: row.reviewedValue,
    effectiveValue: row.reviewStatus === 'REJECTED' ? null : finding ? finding.inspectorDescription : row.reviewedValue ?? row.proposedValue, confidence: row.confidence, required: required.includes(row.fieldKey),
    reviewStatus: row.reviewStatus, citation: row.sourceCitation, promoted: Boolean(row.promotedEntityId), evidence: evidenceFacet(row), ...(finding ? { finding: findingDetail(finding) } : {}),
  };
}

export async function getAskIntake(ctx: AskIntakeContext, recordId: string): Promise<AskIntakeView> {
  const { record, version } = await loadRecord(ctx, recordId);
  const [draft, report] = await Promise.all([findLabelDraft(ctx, recordId), findInspectionReport(ctx, recordId)]);
  const kind = kindFromRecord(record.recordType, Boolean(draft));
  const documentKind = kind === 'WARRANTY' || kind === 'RECEIPT' || kind === 'INSURANCE_POLICY' ? kind : null;
  const required = documentKind ? REQUIRED_FOR_KIND[documentKind] : [];
  const facts = version.extractedFacts;
  const classificationRow = facts.find((row) => row.fieldKey === DOCUMENT_TYPE_FIELD_KEY);
  const candidates = facts.filter((row) => !INFORMATIONAL_KEYS.has(row.fieldKey)).map((row) => candidateView(row, required));
  const inspectionRead = facts.some((row) => row.fieldKey === INSPECTION_DETAILS_KEY);
  const missingRequired = documentKind && candidates.length > 0
    ? required.filter((key) => !candidates.some((candidate) => candidate.fieldKey === key && candidate.effectiveValue)).map((key) => FIELD_LABELS[key] ?? key)
    : [];
  const promoted = candidates.find((candidate) => candidate.promoted);
  const promotedRow = facts.find((row) => row.promotedEntityId);

  let state: AskIntakeState = 'UPLOADED';
  if (record.lifecycleStatus === 'TRASHED') state = 'DISCARDED';
  else if (kind === 'INSPECTION_REPORT') state = report?.status === 'CONFIRMED' ? 'COMPLETED' : report || inspectionRead || candidates.length > 0 ? 'REVIEW' : 'UPLOADED';
  else if (promoted || draft?.status === 'CONFIRMED' || draft?.status === 'DISMISSED') state = 'COMPLETED';
  else if (candidates.length > 0 || draft) state = 'REVIEW';

  const labelItem = draft?.status === 'CONFIRMED'
    ? await prisma.inventoryItem.findFirst({ where: { propertyId: ctx.propertyId, sourceOcrSessionId: draft.sessionId ?? '__none__' }, select: { id: true } })
    : null;
  const labelDraft: AskIntakeView['labelDraft'] = draft ? {
    id: draft.id, status: draft.status === 'CONFIRMED' ? 'CONFIRMED' : draft.status === 'DISMISSED' ? 'DISMISSED' : 'DRAFT',
    fields: LABEL_FIELDS.map(({ key, label }) => ({ key, label, value: (draft as unknown as Record<string, string | null>)[key] ?? null, confidence: ((draft.confidenceJson as Record<string, number> | null) ?? {})[key] ?? null })),
    itemId: labelItem?.id ?? null,
  } : null;

  const modelReader: AskIntakeFacet<{ kind: 'MODEL' | 'LOCAL_OCR'; name: string }> = kind === 'APPLIANCE_LABEL'
    ? { status: 'AVAILABLE', value: { kind: 'LOCAL_OCR', name: 'Text recognition on our server' } }
    : candidates.length > 0 || report || inspectionRead ? { status: 'AVAILABLE', value: { kind: 'MODEL', name: DOCUMENT_INTELLIGENCE_MODEL_ID } } : { status: 'NOT_RECORDED', reason: 'This file has not been read yet.' };

  return {
    contractVersion: ASK_INTAKE_CONTRACT_VERSION, generatedAt: new Date().toISOString(), propertyId: ctx.propertyId, recordId: record.id, versionId: version.id, title: record.title,
    state, kind,
    choice: null, needsDetails: null,
    classification: classificationRow ? { kind, modelLabel: classificationRow.proposedValue, confidence: classificationRow.confidence } : null,
    candidates, missingRequired, labelDraft,
    inspection: report ? { reportId: report.id, status: report.status, findingCount: report.totalFindings } : null,
    result: promoted && promotedRow?.promotedEntityId && documentKind ? { entityType: RESULT_ENTITY_FOR_KIND[documentKind], entityId: promotedRow.promotedEntityId }
      : labelItem ? { entityType: 'INVENTORY_ITEM', entityId: labelItem.id } : null,
    provenance: {
      original: {
        recordId: record.id, versionId: version.id, fileName: version.originalFileName, mimeType: version.mimeType, sizeBytes: version.fileSizeBytes, sha256: version.sha256,
        uploadedAt: version.createdAt.toISOString(), scanStatus: version.scanStatus, contentChecks: CONTENT_CHECKS,
      },
      reader: modelReader,
      pageAndRegion: candidates.some((candidate) => candidate.evidence.status === 'AVAILABLE')
        ? { status: 'AVAILABLE', value: { located: candidates.filter((candidate) => candidate.evidence.status === 'AVAILABLE').length, total: candidates.length } }
        : { status: 'NOT_RECORDED', reason: candidates.length === 0 ? 'Nothing has been read from this file yet.' : 'The reader did not say where in the file these details were found.' },
    },
    disclosures: ASK_INTAKE_DISCLOSURES,
  };
}

/** FR-INPUT-002: keep the original as a Home Record before anything is read. The upload itself has already passed the route's content validation. */
export async function stageAskIntakeFile(ctx: AskIntakeContext, file: { buffer: Buffer; originalname: string; mimetype: string; size: number }, options: { sensitivity?: string }): Promise<AskIntakeView> {
  if (!(ASK_INTAKE_ACCEPTED_TYPES as readonly string[]).includes(file.mimetype)) throw invalid('Choose a PDF, JPEG, PNG or WEBP file.', 'ASK_INTAKE_TYPE_UNSUPPORTED');
  if (file.size > ASK_INTAKE_MAX_BYTES) throw invalid('That file is larger than 10MB.', 'ASK_INTAKE_TOO_LARGE');
  const sensitivity = (options.sensitivity ?? 'STANDARD') as AskIntakeSensitivity;
  if (!ASK_INTAKE_SENSITIVITIES.includes(sensitivity)) throw invalid('Choose how sensitive this file is from the list.');
  const title = file.originalname.replace(/\.[^.]+$/, '').trim().slice(0, 240) || 'Uploaded file';
  const { record } = await homeRecordsService.create({
    propertyId: ctx.propertyId, role: ctx.role, userId: ctx.userId, file, title, recordType: 'OTHER', sensitivity, visibility: 'HOUSEHOLD',
  });
  return getAskIntake(ctx, record.id);
}

export interface AskIntakeAnalyzeInput {
  kind?: AskIntakeKind | 'AUTO';
  acknowledgedProcessing?: boolean;
  inspection?: { reportType: AskIntakeInspectionReportType; inspectionDate: string };
}

async function readOriginal(storageKey: string): Promise<Buffer> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new APIError('Storage is not configured.', 503, 'PROPERTY_RECORD_STORAGE_UNAVAILABLE');
  return downloadObjectBuffer(bucket, storageKey);
}

async function setRecordType(recordId: string, recordType: PropertyRecordType) {
  await prisma.propertyRecord.update({ where: { id: recordId }, data: { recordType } });
}

/**
 * FR-INPUT-002/003: read the file once the person has seen the disclosure. It either proposes candidates, asks the ONE question that is
 * needed (what kind of file this is, or an inspection's type and date), or reports that it could not be read. Nothing canonical is written.
 */
export async function analyzeAskIntake(ctx: AskIntakeContext, recordId: string, input: AskIntakeAnalyzeInput): Promise<AskIntakeView> {
  const { record, version } = await loadRecord(ctx, recordId);
  if (record.lifecycleStatus === 'TRASHED') throw new APIError('This file was removed. Restore it from Home Records first.', 409, 'PROPERTY_RECORD_TRASHED');
  if (version.scanStatus !== 'CLEAN') throw new APIError('This file has not passed content validation.', 409, 'PROPERTY_RECORD_VERSION_NOT_CLEAN');

  // Reading again never reprocesses a file that already has candidates, a draft or a report; it shows what is there.
  const existing = await getAskIntake(ctx, recordId);
  if (existing.state !== 'UPLOADED') return existing;

  const requested = input.kind ?? 'AUTO';
  const readsWithModel = requested !== 'APPLIANCE_LABEL';
  if (readsWithModel && !input.acknowledgedProcessing) {
    throw new APIError('Confirm that this file may be sent to an AI service to be read.', 422, 'ASK_INTAKE_DISCLOSURE_NOT_ACKNOWLEDGED');
  }
  const mime = version.mimeType;
  if (requested === 'APPLIANCE_LABEL' && mime === 'application/pdf') throw invalid('A label has to be a photo.', 'ASK_INTAKE_KIND_NOT_FOR_FILE');
  if (requested === 'INSPECTION_REPORT' && mime !== 'application/pdf') throw invalid('An inspection report has to be a PDF.', 'ASK_INTAKE_KIND_NOT_FOR_FILE');

  let kind: AskIntakeKind;
  let insights: DocumentInsights | undefined;
  if (requested === 'AUTO') {
    const buffer = await readOriginal(version.storageKey);
    insights = await documentIntelligenceService.analyzeDocument(buffer, mime);
    const envelope = documentInsightsToExtractionEnvelope(insights, { documentVersionId: version.id });
    if (envelope.parseStatus === 'FAILED') {
      return { ...existing, choice: { reason: 'We could not read this file automatically. Tell us what it is.', options: optionsFor(mime) } };
    }
    const classified = classifyReading(insights, mime);
    if (!classified.kind) return { ...existing, choice: { reason: classified.reason ?? 'We could not tell what kind of document this is.', options: optionsFor(mime) } };
    kind = classified.kind;
  } else {
    kind = requested;
  }

  if (kind === 'INSPECTION_REPORT') {
    const details = input.inspection;
    if (!details) return { ...existing, kind: null, needsDetails: { kind: 'INSPECTION_REPORT', reportTypes: ASK_INTAKE_INSPECTION_REPORT_TYPES } };
    if (!ASK_INTAKE_INSPECTION_REPORT_TYPES.includes(details.reportType) || Number.isNaN(Date.parse(details.inspectionDate)) || Date.parse(details.inspectionDate) > Date.now() + 86_400_000) {
      throw invalid('Choose the report type and the date the inspection happened.', 'ASK_INTAKE_INSPECTION_DETAILS_INVALID');
    }
    // Read first, write second: the findings are only PROPOSED here (as candidates on the file's version). Nothing becomes an inspection finding
    // until the person accepts it and asks for the report to be created.
    const buffer = await readOriginal(version.storageKey);
    const { findings, rawFindingCount } = await extractInspectionFindings(buffer);
    await setRecordType(record.id, RECORD_TYPE_FOR_KIND[kind]);
    const citation = `AI extraction from "${version.originalFileName}"`;
    await prisma.extractedFactCandidate.createMany({
      data: [
        { propertyRecordVersionId: version.id, targetDomain: 'INSPECTION_FINDING', fieldKey: INSPECTION_DETAILS_KEY, proposedValue: JSON.stringify({ reportType: details.reportType, inspectionDate: details.inspectionDate, rawFindingCount }), sourceCitation: citation, confidence: 1 },
        ...findings.map((finding, index) => {
          const { evidence, ...proposed } = finding;
          return {
            propertyRecordVersionId: version.id, targetDomain: 'INSPECTION_FINDING' as const, fieldKey: `finding:${index + 1}`, proposedValue: JSON.stringify(proposed), sourceCitation: citation,
            confidence: CONFIDENCE_BY_TIER[finding.extractionConfidence] ?? 0.5, sourcePage: evidence?.page ?? null,
            sourceRegionJson: evidence ? { box: evidence.box, excerpt: evidence.excerpt, basis: evidence.basis } : undefined, sourceExcerptHash: evidence?.excerpt ? excerptHash(evidence.excerpt) : null,
          };
        }),
      ],
    });
    return getAskIntake(ctx, record.id);
  }

  if (kind === 'APPLIANCE_LABEL') {
    const buffer = await readOriginal(version.storageKey);
    const { draft } = await scanLabelToDraft({ propertyId: ctx.propertyId, userId: ctx.userId, buffer });
    await prisma.inventoryDraftItem.update({ where: { id: draft.id }, data: { explanationJson: { intake: { recordId: record.id, versionId: version.id } } } });
    await setRecordType(record.id, RECORD_TYPE_FOR_KIND[kind]);
    return getAskIntake(ctx, record.id);
  }

  await setRecordType(record.id, RECORD_TYPE_FOR_KIND[kind]);
  await homeRecordsExtractionService.runExtraction({ propertyId: ctx.propertyId, recordId: record.id, versionId: version.id, role: ctx.role, insights });
  return getAskIntake(ctx, record.id);
}

/** Accept, edit or reject one proposed detail. "Decide later" is leaving it pending: it needs no call and writes nothing. */
export async function reviewAskIntakeCandidate(ctx: AskIntakeContext, recordId: string, candidateId: string, input: { action: 'CONFIRM' | 'CORRECT' | 'REJECT'; value?: string }): Promise<AskIntakeView> {
  const { record } = await loadRecord(ctx, recordId);
  if (record.recordType === 'INSPECTION_REPORT' && input.action === 'CORRECT') throw invalid('A finding can be accepted or rejected, not edited. Edit it after it is added.', 'ASK_INTAKE_FINDING_NOT_EDITABLE');
  await homeRecordsExtractionService.reviewCandidate({
    propertyId: ctx.propertyId, recordId, candidateId, userId: ctx.userId, role: ctx.role, action: input.action, reviewedValue: input.value ?? null,
  });
  return getAskIntake(ctx, recordId);
}

/**
 * Creates the inspection report from the findings the person ACCEPTED. Rejected and undecided findings are never written. A second request is
 * refused rather than creating a second report.
 */
async function promoteAcceptedFindings(ctx: AskIntakeContext, recordId: string, versionId: string): Promise<void> {
  if (await findInspectionReport(ctx, recordId)) throw new APIError('An inspection report was already created from this file.', 409, 'ASK_INTAKE_ALREADY_USED');
  const rows = await prisma.extractedFactCandidate.findMany({ where: { propertyRecordVersionId: versionId, targetDomain: 'INSPECTION_FINDING' }, orderBy: { createdAt: 'asc' } });
  const details = rows.find((row) => row.fieldKey === INSPECTION_DETAILS_KEY);
  const parsedDetails = details?.proposedValue ? (JSON.parse(details.proposedValue) as { reportType: string; inspectionDate: string }) : null;
  if (!parsedDetails) throw new APIError('Read the file as an inspection report first.', 409, 'ASK_INTAKE_NOT_READ');
  const accepted = rows.filter((row) => row.fieldKey !== INSPECTION_DETAILS_KEY && (row.reviewStatus === 'CONFIRMED' || row.reviewStatus === 'CORRECTED') && !row.promotedEntityId);
  const pairs = accepted.flatMap((row) => { const finding = parseFinding(row.proposedValue); return finding ? [{ row, finding: finding as ExtractedFinding }] : []; });
  const findings = pairs.map((pair) => pair.finding);
  if (findings.length === 0) throw new APIError('Accept at least one finding first.', 422, 'INSPECTION_NO_ACCEPTED_FINDINGS');
  const { version } = await loadRecord(ctx, recordId);
  const { findingIds } = await createInspectionReportFromFindings(
    { propertyId: ctx.propertyId, reportType: parsedDetails.reportType, inspectionDate: parsedDetails.inspectionDate, existingSourceFileKey: version.storageKey, sourceEntityType: 'PROPERTY_RECORD', sourceEntityId: recordId },
    findings,
  );
  await Promise.all(pairs.map((pair, index) => prisma.extractedFactCandidate.update({ where: { id: pair.row.id }, data: { promotedEntityType: 'INSPECTION_FINDING', promotedEntityId: findingIds[index] ?? null } })));
}

/** Create the warranty, expense or policy from the confirmed details. The existing promotion refuses when a required detail is missing or rejected. */
export async function promoteAskIntake(ctx: AskIntakeContext, recordId: string): Promise<AskIntakeView> {
  const { record, version } = await loadRecord(ctx, recordId);
  const base = { propertyId: ctx.propertyId, recordId, versionId: version.id, userId: ctx.userId, role: ctx.role };
  if (record.recordType === 'WARRANTY') await homeRecordsExtractionService.promoteWarranty(base);
  else if (record.recordType === 'RECEIPT') await homeRecordsExtractionService.promoteExpense(base);
  else if (record.recordType === 'INSURANCE_POLICY') await homeRecordsExtractionService.promoteInsurancePolicy(base);
  else if (record.recordType === 'INSPECTION_REPORT') await promoteAcceptedFindings(ctx, recordId, version.id);
  else throw invalid('Nothing from this file can be added this way.', 'ASK_INTAKE_NOT_PROMOTABLE');
  return getAskIntake(ctx, recordId);
}

const LABEL_PATCH_KEYS = ['manufacturer', 'modelNumber', 'serialNumber', 'upc', 'sku', 'name'] as const;

export async function updateAskIntakeLabel(ctx: AskIntakeContext, recordId: string, patch: Partial<Record<(typeof LABEL_PATCH_KEYS)[number], string | null>>): Promise<AskIntakeView> {
  await loadRecord(ctx, recordId);
  const draft = await findLabelDraft(ctx, recordId);
  if (!draft) throw new APIError('No label details to edit for this file.', 404, 'ASK_INTAKE_NOT_FOUND');
  const clean: Record<string, string | null> = {};
  for (const key of LABEL_PATCH_KEYS) {
    if (patch[key] === undefined) continue;
    const value = patch[key];
    clean[key] = value === null ? null : value.trim().slice(0, 160) || null;
  }
  await draftService.updateDraft({ propertyId: ctx.propertyId, userId: ctx.userId, draftId: draft.id, patch: clean });
  return getAskIntake(ctx, recordId);
}

/** Confirming a label creates the inventory item, then links the original to it as evidence. */
export async function confirmAskIntakeLabel(ctx: AskIntakeContext, recordId: string): Promise<AskIntakeView> {
  const { version } = await loadRecord(ctx, recordId);
  const draft = await findLabelDraft(ctx, recordId);
  if (!draft) throw new APIError('No label details to confirm for this file.', 404, 'ASK_INTAKE_NOT_FOUND');
  const item = await draftService.confirmDraftToInventoryItem(ctx.propertyId, ctx.userId, draft.id);
  await homeRecordsService.addLink({
    propertyId: ctx.propertyId, recordId, userId: ctx.userId, role: ctx.role, entityType: 'INVENTORY_ITEM', entityId: item.id, purpose: 'EVIDENCE', versionId: version.id, label: 'Appliance label photo',
  }).catch(() => undefined); // the item exists either way; a missing evidence link is shown by the original not being linked, never as a failed add
  return getAskIntake(ctx, recordId);
}

export async function dismissAskIntakeLabel(ctx: AskIntakeContext, recordId: string): Promise<AskIntakeView> {
  await loadRecord(ctx, recordId);
  const draft = await findLabelDraft(ctx, recordId);
  if (!draft) throw new APIError('No label details to reject for this file.', 404, 'ASK_INTAKE_NOT_FOUND');
  await draftService.dismissDraft(ctx.propertyId, ctx.userId, draft.id);
  return getAskIntake(ctx, recordId);
}

/** Remove the file the person no longer wants. It goes to the Home Records trash (recoverable); anything already created from it is left alone and the removal is refused. */
export async function discardAskIntake(ctx: AskIntakeContext, recordId: string): Promise<AskIntakeView> {
  const view = await getAskIntake(ctx, recordId);
  if (view.result || view.inspection) throw new APIError('Something was already created from this file. Remove it from your Home Records instead.', 409, 'ASK_INTAKE_ALREADY_USED');
  if (view.labelDraft?.status === 'DRAFT') await draftService.dismissDraft(ctx.propertyId, ctx.userId, view.labelDraft.id);
  await homeRecordsService.trash({ propertyId: ctx.propertyId, recordId, userId: ctx.userId, role: ctx.role });
  return getAskIntake(ctx, recordId);
}
