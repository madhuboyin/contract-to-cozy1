import sharp from 'sharp';
import { APIError } from '../middleware/error.middleware';
import { extractInsuranceFieldsFromImage } from './insuranceOcr.service';
import {
  NegotiationShieldInputType,
  NegotiationShieldScenarioType,
} from './negotiationShield.types';
import { presignGetObject } from './storage/presign';
import { assertSafeUrl } from '../utils/ssrfGuard';

const NEGOTIATION_SHIELD_PARSER_VERSION = 'negotiation-shield-parser-v1';

type ParsedDocumentSource = {
  fileUrl: string;
  fileName: string;
  mimeType: string | null;
  metadata?: unknown;
};

export type ParsedNegotiationShieldDocument = {
  inputType: NegotiationShieldInputType;
  rawText: string;
  structuredData: Record<string, unknown>;
  parserVersion: string;
  parsedFieldCount: number;
  warnings: string[];
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function cleanText(value: string) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐-–—]/g, '-')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateText(value: string, maxLength = 12000) {
  const normalized = cleanText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 16).trimEnd()}\n\n[truncated]`;
}

function parseMoney(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = String(value).replace(/[$,\s]/g, '');
  if (!normalized.length) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function parsePercent(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = String(value).replace(/[%\s]/g, '');
  if (!normalized.length) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(1)) : null;
}

function parseDataUrl(fileUrl: string): { buffer: Buffer; mimeType: string | null } {
  const match = fileUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (!match) {
    throw new APIError(
      'Unsupported inline document encoding.',
      400,
      'NEGOTIATION_SHIELD_DOCUMENT_PARSE_UNSUPPORTED'
    );
  }

  return {
    mimeType: match[1] ?? null,
    buffer: Buffer.from(match[2], 'base64'),
  };
}

async function fetchRemoteBuffer(url: string) {
  await assertSafeUrl(url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new APIError(
      'Unable to retrieve the document for parsing.',
      422,
      'NEGOTIATION_SHIELD_DOCUMENT_FETCH_FAILED'
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function loadDocumentBuffer(source: ParsedDocumentSource): Promise<{
  buffer: Buffer;
  mimeType: string | null;
}> {
  if (source.fileUrl.startsWith('data:')) {
    const parsed = parseDataUrl(source.fileUrl);
    return {
      buffer: parsed.buffer,
      mimeType: source.mimeType ?? parsed.mimeType,
    };
  }

  let resolvedUrl = source.fileUrl;
  if (source.fileUrl.startsWith('storage://')) {
    const metadata = asObject(source.metadata);
    const bucket =
      metadata.bucket && typeof metadata.bucket === 'string'
        ? String(metadata.bucket)
        : process.env.S3_BUCKET;
    const key = source.fileUrl.slice('storage://'.length).trim();

    if (!bucket || !key) {
      throw new APIError(
        'The document storage reference is incomplete.',
        422,
        'NEGOTIATION_SHIELD_DOCUMENT_FETCH_FAILED'
      );
    }

    resolvedUrl = await presignGetObject({
      bucket,
      key,
      expiresInSeconds: 180,
    });
  }

  if (!/^https?:\/\//i.test(resolvedUrl)) {
    throw new APIError(
      'This document reference is not supported for parsing.',
      400,
      'NEGOTIATION_SHIELD_DOCUMENT_PARSE_UNSUPPORTED'
    );
  }

  return {
    buffer: await fetchRemoteBuffer(resolvedUrl),
    mimeType: source.mimeType,
  };
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return cleanText(data?.text || '');
  } catch (error: any) {
    throw new APIError(
      error?.message || 'Unable to parse PDF content.',
      422,
      'NEGOTIATION_SHIELD_DOCUMENT_PARSE_FAILED'
    );
  }
}

async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const preprocessed = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 2200, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.0 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const { createWorker } = await import('tesseract.js');
  const worker: any = await createWorker('eng');

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });

    const result = await worker.recognize(preprocessed);
    return cleanText(String(result?.data?.text || ''));
  } finally {
    await worker.terminate();
  }
}

async function extractDocumentText(
  source: ParsedDocumentSource,
  scenarioType: NegotiationShieldScenarioType
): Promise<{ text: string; warnings: string[] }> {
  const { buffer, mimeType } = await loadDocumentBuffer(source);
  const normalizedMimeType = (mimeType || '').toLowerCase();
  const warnings: string[] = [];

  if (normalizedMimeType === 'application/pdf' || source.fileName.toLowerCase().endsWith('.pdf')) {
    return { text: await extractTextFromPdf(buffer), warnings };
  }

  if (normalizedMimeType.startsWith('image/')) {
    if (scenarioType === 'INSURANCE_PREMIUM_INCREASE') {
      const imageResult = await extractInsuranceFieldsFromImage(buffer);
      if (!imageResult.rawText) {
        throw new APIError(
          'No readable text was extracted from this image.',
          422,
          'NEGOTIATION_SHIELD_DOCUMENT_PARSE_EMPTY'
        );
      }
      return { text: cleanText(imageResult.rawText), warnings };
    }

    return { text: await extractTextFromImage(buffer), warnings };
  }

  if (
    normalizedMimeType.startsWith('text/') ||
    normalizedMimeType === 'application/json' ||
    normalizedMimeType === 'application/xml' ||
    normalizedMimeType === 'text/csv'
  ) {
    return { text: cleanText(buffer.toString('utf8')), warnings };
  }

  throw new APIError(
    'This file type is not supported for parsing yet.',
    400,
    'NEGOTIATION_SHIELD_DOCUMENT_PARSE_UNSUPPORTED'
  );
}

function extractLabeledValue(text: string, labels: string[], maxLength = 120): string | null {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    for (const label of labels) {
      const pattern = new RegExp(`${label}\\s*[:\\-]\\s*(.+)$`, 'i');
      const match = line.match(pattern);
      if (match?.[1]) {
        const candidate = cleanText(match[1]).slice(0, maxLength).trim();
        if (candidate.length > 0) return candidate;
      }
    }
  }

  return null;
}

function extractAmountNearLabels(text: string, labels: string[]): number | null {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const upper = line.toUpperCase();
    const matched = labels.some((label) => upper.includes(label.toUpperCase()));
    if (!matched) continue;

    const amountMatch = line.match(/([$]?\s*[\d,]+(?:\.\d{2})?)/);
    const amount = parseMoney(amountMatch?.[1]);
    if (amount !== null) return amount;
  }

  return null;
}

function extractDateNearLabels(text: string, labels: string[]): string | null {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const datePattern =
    /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/;

  for (const line of lines) {
    const upper = line.toUpperCase();
    const matched = labels.some((label) => upper.includes(label.toUpperCase()));
    if (!matched) continue;
    const match = line.match(datePattern);
    if (match?.[1]) return match[1];
  }

  const anywhere = text.match(datePattern);
  return anywhere?.[1] ?? null;
}

function extractPercentNearLabels(text: string, labels: string[]): number | null {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const upper = line.toUpperCase();
    const matched = labels.some((label) => upper.includes(label.toUpperCase()));
    if (!matched) continue;

    const percentMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
    const percentage = parsePercent(percentMatch?.[1]);
    if (percentage !== null) return percentage;
  }

  return null;
}

function detectContractorCategory(text: string): { serviceCategory: string | null; systemCategory: string | null } {
  const normalized = text.toLowerCase();
  const categories: Array<{ serviceCategory: string; systemCategory: string; patterns: RegExp[] }> = [
    {
      serviceCategory: 'Roofing',
      systemCategory: 'Roof',
      patterns: [/\broof\b/, /\bshingle\b/, /\bflashing\b/, /\bgutter\b/],
    },
    {
      serviceCategory: 'HVAC',
      systemCategory: 'HVAC',
      patterns: [/\bhvac\b/, /\bfurnace\b/, /\bair conditioner\b/, /\bac unit\b/, /\bheat pump\b/],
    },
    {
      serviceCategory: 'Plumbing',
      systemCategory: 'Plumbing',
      patterns: [/\bplumb/i, /\bpipe\b/, /\bwater heater\b/, /\bleak\b/],
    },
    {
      serviceCategory: 'Electrical',
      systemCategory: 'Electrical',
      patterns: [/\belectrical\b/, /\bpanel\b/, /\bwiring\b/, /\bbreaker\b/],
    },
    {
      serviceCategory: 'Foundation',
      systemCategory: 'Foundation',
      patterns: [/\bfoundation\b/, /\bsettlement\b/, /\bstructural\b/],
    },
    {
      serviceCategory: 'Windows',
      systemCategory: 'Windows',
      patterns: [/\bwindow\b/, /\bglass\b/],
    },
    {
      serviceCategory: 'Siding',
      systemCategory: 'Exterior',
      patterns: [/\bsiding\b/, /\bexterior cladding\b/],
    },
  ];

  for (const category of categories) {
    if (category.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        serviceCategory: category.serviceCategory,
        systemCategory: category.systemCategory,
      };
    }
  }

  return { serviceCategory: null, systemCategory: null };
}

function buildTextSummary(text: string, maxLines = 4): string | null {
  const lines = text
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter((line) => line.length >= 8)
    .slice(0, maxLines);

  return lines.length > 0 ? lines.join(' ') : null;
}

function parseContractorQuoteText(text: string): Record<string, unknown> {
  const structuredData: Record<string, unknown> = {};
  const contractorName = extractLabeledValue(text, [
    'contractor',
    'company',
    'vendor',
    'prepared by',
    'estimate from',
  ]);
  const quoteAmount =
    extractAmountNearLabels(text, ['total', 'estimate', 'quote amount', 'proposal total']) ??
    parseMoney(text.match(/\btotal\b[^\d$]{0,20}([$]?\s*[\d,]+(?:\.\d{2})?)/i)?.[1] ?? null);
  const quoteDate = extractDateNearLabels(text, ['date', 'quote date', 'estimate date', 'proposal date']);
  const serviceCategory = extractLabeledValue(text, ['service category', 'job category', 'trade']) ?? detectContractorCategory(text).serviceCategory;
  const systemCategory = extractLabeledValue(text, ['system', 'system category', 'component']) ?? detectContractorCategory(text).systemCategory;
  const urgencyClaimed = /\b(urgent|immediate|same day|same-day|asap|emergency|today)\b/i.test(text)
    ? true
    : null;
  const notes = buildTextSummary(text);

  if (contractorName) structuredData.contractorName = contractorName;
  if (quoteAmount !== null) structuredData.quoteAmount = quoteAmount;
  if (quoteDate) structuredData.quoteDate = quoteDate;
  if (serviceCategory) structuredData.serviceCategory = serviceCategory;
  if (systemCategory) structuredData.systemCategory = systemCategory;
  if (urgencyClaimed !== null) structuredData.urgencyClaimed = urgencyClaimed;
  if (notes) structuredData.notes = notes;

  return structuredData;
}

function parseInsurancePremiumText(text: string): Record<string, unknown> {
  const structuredData: Record<string, unknown> = {};
  const insurerName = extractLabeledValue(text, [
    'carrier',
    'insurer',
    'insurance company',
    'company',
  ]);
  const priorPremium = extractAmountNearLabels(text, [
    'prior premium',
    'previous premium',
    'expiring premium',
    'current premium',
  ]);
  const newPremium = extractAmountNearLabels(text, [
    'new premium',
    'renewal premium',
    'annual premium',
    'premium due',
  ]);
  const increaseAmount = extractAmountNearLabels(text, [
    'increase amount',
    'premium increase',
    'amount increase',
  ]);
  const increasePercentage = extractPercentNearLabels(text, [
    'increase percentage',
    'premium increase',
    'rate change',
  ]);
  const renewalDate = extractDateNearLabels(text, [
    'renewal date',
    'effective date',
    'renewal',
  ]);
  const reasonProvided =
    extractLabeledValue(text, ['reason', 'reason provided', 'increase reason', 'because', 'due to'], 240) ??
    null;
  const notes = buildTextSummary(text);

  if (insurerName) structuredData.insurerName = insurerName;
  if (priorPremium !== null) structuredData.priorPremium = priorPremium;
  if (newPremium !== null) structuredData.newPremium = newPremium;

  const computedIncreaseAmount =
    increaseAmount !== null
      ? increaseAmount
      : priorPremium !== null && newPremium !== null
        ? Number((newPremium - priorPremium).toFixed(2))
        : null;
  const computedIncreasePercentage =
    increasePercentage !== null
      ? increasePercentage
      : priorPremium !== null && newPremium !== null && priorPremium > 0
        ? Number((((newPremium - priorPremium) / priorPremium) * 100).toFixed(1))
        : null;

  if (computedIncreaseAmount !== null) structuredData.increaseAmount = computedIncreaseAmount;
  if (computedIncreasePercentage !== null) structuredData.increasePercentage = computedIncreasePercentage;
  if (renewalDate) structuredData.renewalDate = renewalDate;
  if (reasonProvided) structuredData.reasonProvided = reasonProvided;
  if (notes) structuredData.notes = notes;

  return structuredData;
}

function parseInsuranceClaimSettlementText(text: string): Record<string, unknown> {
  const structuredData: Record<string, unknown> = {};
  const insurerName = extractLabeledValue(text, [
    'carrier',
    'insurer',
    'insurance company',
    'company',
  ]);
  const claimType = extractLabeledValue(text, [
    'claim type',
    'loss type',
    'coverage',
    'claim for',
  ]);
  const settlementAmount = extractAmountNearLabels(text, [
    'settlement amount',
    'claim payment',
    'net payment',
    'approved amount',
    'amount paid',
  ]);
  const estimateAmount = extractAmountNearLabels(text, [
    'estimate amount',
    'repair estimate',
    'contractor estimate',
    'replacement cost',
  ]);
  const claimDate = extractDateNearLabels(text, [
    'claim date',
    'loss date',
    'date of loss',
    'settlement date',
  ]);
  const reasonProvided =
    extractLabeledValue(text, ['reason', 'because', 'explanation', 'basis', 'settlement rationale'], 240) ??
    null;
  const notes = buildTextSummary(text);

  if (insurerName) structuredData.insurerName = insurerName;
  if (claimType) structuredData.claimType = claimType;
  if (settlementAmount !== null) structuredData.settlementAmount = settlementAmount;
  if (estimateAmount !== null) structuredData.estimateAmount = estimateAmount;
  if (claimDate) structuredData.claimDate = claimDate;
  if (reasonProvided) structuredData.reasonProvided = reasonProvided;
  if (settlementAmount !== null && estimateAmount !== null) {
    structuredData.gapAmount = Number((estimateAmount - settlementAmount).toFixed(2));
    if (settlementAmount > 0) {
      structuredData.gapPercentage = Number((((estimateAmount - settlementAmount) / settlementAmount) * 100).toFixed(1));
    }
  }
  if (notes) structuredData.notes = notes;

  return structuredData;
}

function parseBuyerInspectionText(text: string): Record<string, unknown> {
  const structuredData: Record<string, unknown> = {};
  const requestedConcessionAmount = extractAmountNearLabels(text, [
    'credit requested',
    'concession requested',
    'requested concession',
    'seller credit',
    'buyer request',
  ]);
  const reportDate = extractDateNearLabels(text, [
    'report date',
    'inspection date',
    'date',
  ]);
  const inspectionIssuesSummary =
    extractLabeledValue(text, ['inspection summary', 'issue summary', 'findings', 'major findings'], 320) ??
    null;
  const requestedRepairs =
    extractLabeledValue(text, ['requested repairs', 'repair request', 'repairs requested'], 320) ??
    null;
  const buyerRequestText =
    extractLabeledValue(text, ['buyer request', 'buyer comments', 'buyer notes'], 320) ??
    null;
  const notes = buildTextSummary(text);

  if (requestedConcessionAmount !== null) {
    structuredData.requestedConcessionAmount = requestedConcessionAmount;
  }
  if (reportDate) structuredData.reportDate = reportDate;
  if (inspectionIssuesSummary) structuredData.inspectionIssuesSummary = inspectionIssuesSummary;
  if (requestedRepairs) structuredData.requestedRepairs = requestedRepairs;
  if (buyerRequestText) structuredData.notes = buyerRequestText;
  else if (notes) structuredData.notes = notes;

  return structuredData;
}

function parseContractorUrgencyText(text: string): Record<string, unknown> {
  const structuredData: Record<string, unknown> = {};
  const contractorName = extractLabeledValue(text, [
    'contractor',
    'company',
    'vendor',
    'prepared by',
    'estimate from',
  ]);
  const recommendedWork =
    extractLabeledValue(text, ['recommended work', 'scope', 'recommendation', 'work recommended'], 220) ??
    buildTextSummary(text, 2);
  const quoteAmount =
    extractAmountNearLabels(text, ['total', 'estimate', 'quote amount', 'proposal total']) ??
    parseMoney(text.match(/\btotal\b[^\d$]{0,20}([$]?\s*[\d,]+(?:\.\d{2})?)/i)?.[1] ?? null);
  const urgencyClaimed = /\b(urgent|immediate|emergency|critical|asap)\b/i.test(text) ? true : null;
  const sameDayPressure = /\b(same day|same-day|today only|approve today|sign today)\b/i.test(text)
    ? true
    : null;
  const replacementRecommended = /\b(full replacement|replace(?:ment)? recommended|needs replacement)\b/i.test(text)
    ? true
    : null;
  const repairOptionMentioned = /\brepair\b/i.test(text) ? true : null;
  const inspectionEvidenceProvided = /\b(photo|photos|inspection|image|evidence|moisture reading)\b/i.test(text)
    ? true
    : null;
  const itemizedExplanationProvided = /\b(line item|itemized|materials|labor|scope)\b/i.test(text)
    ? true
    : null;
  const notes = buildTextSummary(text);

  if (contractorName) structuredData.contractorName = contractorName;
  if (recommendedWork) structuredData.recommendedWork = recommendedWork;
  if (quoteAmount !== null) structuredData.quoteAmount = quoteAmount;
  if (urgencyClaimed !== null) structuredData.urgencyClaimed = urgencyClaimed;
  if (sameDayPressure !== null) structuredData.sameDayPressure = sameDayPressure;
  if (replacementRecommended !== null) structuredData.replacementRecommended = replacementRecommended;
  if (repairOptionMentioned !== null) structuredData.repairOptionMentioned = repairOptionMentioned;
  if (inspectionEvidenceProvided !== null) structuredData.inspectionEvidenceProvided = inspectionEvidenceProvided;
  if (itemizedExplanationProvided !== null) structuredData.itemizedExplanationProvided = itemizedExplanationProvided;
  if (notes) structuredData.notes = notes;

  return structuredData;
}

export async function parseNegotiationShieldDocument(args: {
  scenarioType: NegotiationShieldScenarioType;
  source: ParsedDocumentSource;
}): Promise<ParsedNegotiationShieldDocument> {
  const extraction = await extractDocumentText(args.source, args.scenarioType);
  const rawText = truncateText(extraction.text);

  if (rawText.length < 20) {
    throw new APIError(
      'No meaningful text could be extracted from this document.',
      422,
      'NEGOTIATION_SHIELD_DOCUMENT_PARSE_EMPTY'
    );
  }

  const structuredData =
    args.scenarioType === 'CONTRACTOR_QUOTE_REVIEW'
      ? parseContractorQuoteText(rawText)
      : args.scenarioType === 'INSURANCE_PREMIUM_INCREASE'
        ? parseInsurancePremiumText(rawText)
        : args.scenarioType === 'INSURANCE_CLAIM_SETTLEMENT'
          ? parseInsuranceClaimSettlementText(rawText)
          : args.scenarioType === 'BUYER_INSPECTION_NEGOTIATION'
            ? parseBuyerInspectionText(rawText)
            : parseContractorUrgencyText(rawText);

  return {
    inputType:
      args.scenarioType === 'CONTRACTOR_QUOTE_REVIEW'
        ? 'CONTRACTOR_QUOTE'
        : args.scenarioType === 'INSURANCE_PREMIUM_INCREASE'
          ? 'INSURANCE_PREMIUM'
          : args.scenarioType === 'INSURANCE_CLAIM_SETTLEMENT'
            ? 'INSURANCE_CLAIM_SETTLEMENT'
            : args.scenarioType === 'BUYER_INSPECTION_NEGOTIATION'
              ? 'BUYER_INSPECTION'
              : 'CONTRACTOR_URGENCY',
    rawText,
    structuredData,
    parserVersion: NEGOTIATION_SHIELD_PARSER_VERSION,
    parsedFieldCount: Object.keys(structuredData).length,
    warnings: extraction.warnings,
  };
}
