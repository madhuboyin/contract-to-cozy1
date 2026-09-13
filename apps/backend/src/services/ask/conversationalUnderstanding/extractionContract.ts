// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §14).
//
// The structured-extraction LLM call: one bounded, schema-constrained
// request per turn the pre-filter fires on. Output is always a typed
// candidate list -- the model never writes to a canonical domain model
// directly (FRD §14/§22's unconditional confirmation-required rule). Follows
// this codebase's own established Gemini structured-output convention
// (inspectionExtraction.service.ts: GoogleGenAI + executeGovernedAIRequest +
// resolveGovernedAIModel + responseMimeType: 'application/json'), with Zod
// validation replacing that file's hand-rolled Set-membership checks.
import { GoogleGenAI } from '@google/genai';
import { logger } from '../../../lib/logger';
import { executeGovernedAIRequest, resolveGovernedAIModel } from '../../ai/aiRequestGovernance.service';
import { FINANCING_CAPTURE_FACT_KEY } from '../../../modules/propertyContext/application/capturePropertyFinancingFact';
import {
  ExtractionCandidateSchema,
  ExtractionResultSchema,
  MAX_EXTRACTION_CANDIDATES_PER_TURN,
  type ExtractionCandidate,
} from './extractionCandidateSchema';

// A bounded, illustrative subset of capturable factKeys -- not the full
// catalog (propertyFacts/exteriorFacts/salePrepFacts/responsibilityScopes in
// capturePropertyFact.ts run to 50+ keys). Listing every one in-prompt would
// bloat the call for little benefit: extractionCandidateSchema.ts's own
// isContextCaptureSupported() refinement is the real gate, dropping any
// factKey the model invents outside the supported set. This list exists
// only to bias the model toward the keys a homeowner is actually likely to
// state in passing conversation.
const ILLUSTRATIVE_FACT_KEYS = [
  'core.yearBuilt', 'core.bedrooms', 'core.bathrooms',
  'structure.roofType', 'structure.roofReplacementYear', 'structure.foundationType',
  'systems.heatingType', 'systems.coolingType', 'systems.waterHeaterType',
  'systems.hvacInstallYear', 'systems.waterHeaterInstallYear',
  'safety.hasSmokeDetectors', 'safety.hasCoDetectors', 'safety.hasSumpPump',
  FINANCING_CAPTURE_FACT_KEY,
];

const SYSTEM_PROMPT = `You are a conversational information-extraction module for a home-management assistant. A homeowner sent a message inside an ordinary chat conversation. Extract ONLY information they stated about their home that should become durable, structured home knowledge -- never information from a question they asked, a hypothetical, or small talk unrelated to their home.

Return a JSON object: { "candidates": [...] }, an array of at most ${MAX_EXTRACTION_CANDIDATES_PER_TURN} candidates (empty array if nothing qualifies).

Each candidate is EITHER a FACT or an EVENT:

FACT -- a scalar attribute of the home itself (e.g. a mortgage rate, roof type, year built):
{
  "category": "FACT",
  "factKey": one of [${ILLUSTRATIVE_FACT_KEYS.map((key) => `"${key}"`).join(', ')}] -- only use one of these; if the stated fact does not match any of them, omit the candidate entirely,
  "value": the stated value, typed appropriately (number for numeric facts, boolean for yes/no facts, string otherwise),
  "extractionConfidence": 0 to 1, how confident you are this was correctly parsed,
  "attribution": "FIRSTHAND" (the homeowner's own direct statement), "THIRD_PARTY_RELAYED" (they are relaying what someone else -- an inspector, contractor, provider -- told them), or "INFERRED" (implied, not directly stated),
  "sourceSentence": the exact sentence this was extracted from
}

EVENT -- something that happened to the home (a repair, replacement, install, service visit, purchase):
{
  "category": "EVENT",
  "eventType": one of PURCHASE|DOCUMENT|REPAIR|MAINTENANCE|CLAIM|IMPROVEMENT|VALUE_UPDATE|INSPECTION|NOTE|MILESTONE|OTHER,
  "title": a short homeowner-facing title (e.g. "Roof replacement"),
  "summary": one sentence of additional detail, or null,
  "datePrecision": "EXACT_DATE" | "MONTH" | "YEAR" | "RANGE" | "UNKNOWN" -- NEVER invent more precision than the homeowner actually stated. "last summer" is RANGE, not a fabricated exact date. "a few years ago" or no time reference at all is UNKNOWN.
  "occurredAt": an ISO 8601 datetime, required when datePrecision is EXACT_DATE/MONTH/YEAR (use a reasonable date within that month/year if only a month/year was given), null when datePrecision is RANGE or UNKNOWN,
  "dateRangeStart": ISO 8601 datetime, required when datePrecision is RANGE (a reasonable lower bound for the stated range), otherwise null,
  "dateRangeEnd": ISO 8601 datetime, required when datePrecision is RANGE (a reasonable upper bound), otherwise null,
  "amount": the cost in dollars as a plain number if stated, otherwise null,
  "currency": "USD" if an amount was given, otherwise null,
  "providerName": the name of a contractor/company mentioned, otherwise null,
  "extractionConfidence": 0 to 1,
  "attribution": "FIRSTHAND" | "THIRD_PARTY_RELAYED" | "INFERRED",
  "sourceSentence": the exact sentence this was extracted from
}

Rules:
- If the message is only a question, a hypothetical, or unrelated to the home, return { "candidates": [] }.
- A message can contain both a question and a genuine statement (e.g. "I serviced the HVAC yesterday for $275. Was that too expensive?") -- extract only the statement half.
- Never fabricate a value, date, or amount that was not stated or clearly implied.
- Return ONLY valid JSON. No markdown, no explanation.`;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenAI({ apiKey });
}

export interface RunStructuredExtractionResult {
  candidates: ExtractionCandidate[];
  droppedCount: number;
}

/**
 * The one bounded, schema-constrained LLM call FRD §14 specifies. Never
 * throws for a malformed or unsupported individual candidate -- those are
 * silently dropped (droppedCount reflects how many) so one bad candidate
 * never sinks the others. Throws only when the call itself fails (network,
 * config, or completely unparseable JSON) -- the caller (conversationalCapture.ts)
 * treats that identically to "extraction found nothing," per FRD §13's
 * fail-safe requirement that a missed trigger never blocks the routed
 * answer.
 */
export async function runStructuredExtraction(message: string): Promise<RunStructuredExtractionResult> {
  const ai = getGeminiClient();
  const model = resolveGovernedAIModel('FAST');

  const response = await executeGovernedAIRequest({
    routeId: 'ai:ask-conversational-capture-extraction',
    model,
    structuredOutputRequired: true,
    structuredOutputConfigured: true,
    work: () => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\nHOMEOWNER MESSAGE:\n${message}` }] }],
      config: { responseMimeType: 'application/json' },
    }),
  });

  const raw = response.text ?? '';
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error('Extraction model returned malformed JSON');
  }

  const parsed = ExtractionResultSchema.safeParse(parsedJson);
  if (parsed.success) return { candidates: parsed.data.candidates, droppedCount: 0 };

  // The envelope itself may be well-formed ({ candidates: [...] }) even when
  // one element inside it fails validation (an invented factKey, a
  // datePrecision/occurredAt mismatch). Re-validate element-by-element so a
  // single bad candidate doesn't discard every other candidate in the same
  // response.
  const rawCandidates = Array.isArray((parsedJson as { candidates?: unknown })?.candidates)
    ? (parsedJson as { candidates: unknown[] }).candidates
    : [];
  const candidates: ExtractionCandidate[] = [];
  let droppedCount = 0;
  for (const rawCandidate of rawCandidates.slice(0, MAX_EXTRACTION_CANDIDATES_PER_TURN)) {
    const result = ExtractionCandidateSchema.safeParse(rawCandidate);
    if (result.success) candidates.push(result.data);
    else droppedCount += 1;
  }
  if (droppedCount > 0) {
    logger.warn({ droppedCount }, '[ask-conversational-capture] dropped invalid extraction candidate(s)');
  }
  return { candidates, droppedCount };
}
