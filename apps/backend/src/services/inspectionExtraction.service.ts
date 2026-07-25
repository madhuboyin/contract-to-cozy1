import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { uploadPdfBuffer } from './storage/reportStorage';
import { APIError } from '../middleware/error.middleware';

type HomeSystem =
  | 'ROOF' | 'EXTERIOR' | 'FOUNDATION' | 'BASEMENT_CRAWLSPACE' | 'STRUCTURAL'
  | 'ELECTRICAL' | 'PLUMBING' | 'HVAC' | 'INTERIOR' | 'ATTIC_INSULATION'
  | 'APPLIANCES' | 'GARAGE' | 'SITE_GRADING';

type ConditionRating = 'GOOD' | 'FAIR' | 'POOR' | 'SAFETY_CONCERN';
type Severity = 'SAFETY' | 'MAJOR' | 'MINOR' | 'MONITOR' | 'INFORMATIONAL';
type InspectorRec = 'MONITOR' | 'REPAIR' | 'REPLACE' | 'FURTHER_EVALUATION' | 'SAFETY_IMMEDIATE';
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

interface ExtractedFinding {
  homeSystem: HomeSystem;
  subsystem?: string;
  location?: string;
  conditionRating: ConditionRating;
  severity: Severity;
  inspectorDescription: string;
  inspectorRecommendation: InspectorRec;
  aiInterpretation: string;
  estimatedCostCentsLow?: number;
  estimatedCostCentsHigh?: number;
  extractionConfidence: Confidence;
}

const SYSTEM_PROMPT = `You are an expert home inspection analyst. Extract every finding from the inspection report text below.

Return a JSON object with a "findings" array. Each finding must have exactly these fields:
- homeSystem: one of ROOF|EXTERIOR|FOUNDATION|BASEMENT_CRAWLSPACE|STRUCTURAL|ELECTRICAL|PLUMBING|HVAC|INTERIOR|ATTIC_INSULATION|APPLIANCES|GARAGE|SITE_GRADING
- subsystem: specific component (e.g. "Main electrical panel", "Supply line under kitchen sink") or null
- location: where in the home (e.g. "Northwest corner, master bathroom") or null
- conditionRating: one of GOOD|FAIR|POOR|SAFETY_CONCERN
- severity: one of SAFETY|MAJOR|MINOR|MONITOR|INFORMATIONAL
- inspectorDescription: verbatim text from the report describing this finding
- inspectorRecommendation: one of MONITOR|REPAIR|REPLACE|FURTHER_EVALUATION|SAFETY_IMMEDIATE
- aiInterpretation: plain-English homeowner-friendly restatement of what this means and what to do
- estimatedCostCentsLow: low end repair cost in US cents (integer) or null if unknown
- estimatedCostCentsHigh: high end repair cost in US cents (integer) or null if unknown
- extractionConfidence: HIGH if finding boundary was clear and severity was explicit; MEDIUM if inferred; LOW if ambiguous

Severity rules:
- SAFETY: immediate safety hazard (fire, electrocution, structural collapse risk)
- MAJOR: significant defect requiring prompt repair, >$1000 typical cost
- MINOR: defect that should be repaired, <$1000 typical cost
- MONITOR: condition to watch but no immediate action needed
- INFORMATIONAL: neutral observation, no action required

Return ONLY valid JSON. No markdown, no explanation.`;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new APIError('GEMINI_API_KEY not configured', 500, 'CONFIG_ERROR');
  return new GoogleGenAI({ apiKey });
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  if (!data.text || data.text.trim().length < 50) {
    throw new APIError('Could not extract readable text from PDF', 422, 'PDF_UNREADABLE');
  }
  return data.text;
}

async function callGemini(pdfText: string): Promise<ExtractedFinding[]> {
  const ai = getGeminiClient();
  const model = 'gemini-1.5-flash';

  const truncated = pdfText.length > 60_000 ? pdfText.slice(0, 60_000) + '\n[truncated]' : pdfText;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [{ text: `${SYSTEM_PROMPT}\n\nINSPECTION REPORT:\n${truncated}` }],
      },
    ],
    config: { responseMimeType: 'application/json' },
  });

  const raw = response.text ?? '';
  let parsed: { findings?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new APIError('AI returned malformed JSON', 502, 'AI_PARSE_ERROR');
  }

  if (!Array.isArray(parsed.findings)) {
    throw new APIError('AI response missing findings array', 502, 'AI_PARSE_ERROR');
  }

  const VALID_SYSTEMS = new Set([
    'ROOF','EXTERIOR','FOUNDATION','BASEMENT_CRAWLSPACE','STRUCTURAL',
    'ELECTRICAL','PLUMBING','HVAC','INTERIOR','ATTIC_INSULATION',
    'APPLIANCES','GARAGE','SITE_GRADING',
  ]);
  const VALID_CONDITION = new Set(['GOOD','FAIR','POOR','SAFETY_CONCERN']);
  const VALID_SEVERITY = new Set(['SAFETY','MAJOR','MINOR','MONITOR','INFORMATIONAL']);
  const VALID_REC = new Set(['MONITOR','REPAIR','REPLACE','FURTHER_EVALUATION','SAFETY_IMMEDIATE']);
  const VALID_CONF = new Set(['HIGH','MEDIUM','LOW']);

  return (parsed.findings as any[]).reduce<ExtractedFinding[]>((acc, f) => {
    if (!VALID_SYSTEMS.has(f.homeSystem)) return acc;
    if (!VALID_CONDITION.has(f.conditionRating)) f.conditionRating = 'FAIR';
    if (!VALID_SEVERITY.has(f.severity)) f.severity = 'MINOR';
    if (!VALID_REC.has(f.inspectorRecommendation)) f.inspectorRecommendation = 'MONITOR';
    if (!VALID_CONF.has(f.extractionConfidence)) f.extractionConfidence = 'MEDIUM';
    if (!f.inspectorDescription) return acc;

    acc.push({
      homeSystem: f.homeSystem,
      subsystem: f.subsystem || undefined,
      location: f.location || undefined,
      conditionRating: f.conditionRating,
      severity: f.severity,
      inspectorDescription: String(f.inspectorDescription),
      inspectorRecommendation: f.inspectorRecommendation,
      aiInterpretation: f.aiInterpretation || f.inspectorDescription,
      estimatedCostCentsLow: Number.isInteger(f.estimatedCostCentsLow) ? f.estimatedCostCentsLow : undefined,
      estimatedCostCentsHigh: Number.isInteger(f.estimatedCostCentsHigh) ? f.estimatedCostCentsHigh : undefined,
      extractionConfidence: f.extractionConfidence,
    });
    return acc;
  }, []);
}

export interface IngestArgs {
  propertyId: string;
  userId: string;
  pdfBuffer: Buffer;
  fileName: string;
  reportType: string;
  inspectionDate: string;
  inspectorName?: string;
  inspectorLicense?: string;
  inspectorCompany?: string;
  sourceActionId?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceJourneyId?: string;
}

export async function ingestInspectionReport(
  args: IngestArgs,
): Promise<{ reportId: string; findingCount: number }> {
  const { propertyId, userId, pdfBuffer, fileName, reportType, inspectionDate } = args;

  // Upload PDF to S3 (best-effort — fall back to a local key on error)
  let sourceFileKey = `inspection/${propertyId}/${Date.now()}-${fileName.replace(/\s+/g, '-')}`;
  try {
    const sha = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    const uploaded = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      checksumSha256: sha,
      propertyId,
      userId,
    });
    sourceFileKey = uploaded.key;
  } catch (err) {
    logger.warn({ err }, '[INSPECTION] S3 upload failed — storing key as local path reference');
  }

  // Create report record in PROCESSING state
  const report = await prisma.inspectionReport.create({
    data: {
      propertyId,
      reportType: reportType as any,
      inspectionDate: new Date(inspectionDate),
      inspectorName: args.inspectorName,
      inspectorLicense: args.inspectorLicense,
      inspectorCompany: args.inspectorCompany,
      sourceFileKey,
      status: 'PROCESSING',
      extractionModel: 'gemini-1.5-flash',
      sourceActionId: args.sourceActionId,
      sourceEntityType: args.sourceEntityType,
      sourceEntityId: args.sourceEntityId,
      sourceJourneyId: args.sourceJourneyId,
    },
  });

  logger.info({ reportId: report.id }, '[INSPECTION] Created report, starting extraction');

  let findingCount = 0;
  try {
    const pdfText = await extractPdfText(pdfBuffer);
    const findings = await callGemini(pdfText);
    findingCount = findings.length;

    if (findings.length > 0) {
      await prisma.inspectionFinding.createMany({
        data: findings.map((f) => ({
          reportId: report.id,
          propertyId,
          homeSystem: f.homeSystem,
          subsystem: f.subsystem,
          location: f.location,
          conditionRating: f.conditionRating,
          severity: f.severity,
          inspectorDescription: f.inspectorDescription,
          inspectorRecommendation: f.inspectorRecommendation,
          aiInterpretation: f.aiInterpretation,
          estimatedCostCentsLow: f.estimatedCostCentsLow,
          estimatedCostCentsHigh: f.estimatedCostCentsHigh,
          extractionConfidence: f.extractionConfidence,
          status: 'OPEN',
        })),
      });
    }

    const safetyCount = findings.filter((f) => f.severity === 'SAFETY').length;
    const majorCount = findings.filter((f) => f.severity === 'MAJOR').length;

    await prisma.inspectionReport.update({
      where: { id: report.id },
      data: {
        status: 'REVIEW_PENDING',
        processedAt: new Date(),
        totalFindings: findings.length,
        openFindings: findings.length,
        safetyFindings: safetyCount,
        majorFindings: majorCount,
      },
    });

    logger.info({ reportId: report.id, count: findings.length }, '[INSPECTION] Extraction complete');
  } catch (err) {
    logger.error({ err, reportId: report.id }, '[INSPECTION] Extraction failed');
    // Leave in PROCESSING so the frontend can show an error state and retry
    await prisma.inspectionReport.update({
      where: { id: report.id },
      data: { status: 'PROCESSING' },
    });
    throw err;
  }

  return { reportId: report.id, findingCount };
}
