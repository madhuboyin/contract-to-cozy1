import { minimizeAskQuestion } from '../ask/askPromptMinimization';
import type { GuidanceAdviceContext } from './guidanceAdvisor.service';

// The only fields that may leave for the provider (BICC-OPS-007 for the Guidance Advisor flow). No user, property or journey identifier, no
// address, no home-record facts and no conversation history is serialised. Free-text fields are passed through the Ask minimiser (email,
// link, phone and account-number redaction) and length-capped.
export const GUIDANCE_ADVISOR_PERMITTED_FIELDS = Object.freeze([
  'issueDomain', 'assetName', 'signalIntentFamily', 'symptom', 'currentStepLabel', 'priorityBucket', 'costOfDelay', 'coverageImpact',
] as const);

const MAX_FREE_TEXT = 120;
const text = (value: string | null | undefined, fallback: string): string => {
  const cleaned = minimizeAskQuestion(value ?? '').slice(0, MAX_FREE_TEXT).trim();
  return cleaned || fallback;
};

export type GuidanceAdvicePayload = {
  issueDomain: string;
  assetName: string;
  signalIntentFamily: string;
  symptom: string;
  currentStepLabel: string;
  priorityBucket: string;
  /** Rounded to the nearest $100 so an exact figure is never transmitted. */
  costOfDelay: number | null;
  coverageImpact: string | null;
};

export function serializeGuidanceAdvicePayload(context: GuidanceAdviceContext): GuidanceAdvicePayload {
  const delay = typeof context.costOfDelay === 'number' && Number.isFinite(context.costOfDelay) && context.costOfDelay > 0
    ? Math.round(context.costOfDelay / 100) * 100
    : null;
  return {
    issueDomain: text(String(context.issueDomain), 'GENERAL'),
    assetName: text(context.assetName, 'Home System'),
    signalIntentFamily: text(context.signalIntentFamily, 'Detected Alert'),
    symptom: text(context.symptom, 'Not specified'),
    currentStepLabel: text(context.currentStepLabel, 'Initial Review'),
    priorityBucket: text(context.priorityBucket, 'Standard'),
    costOfDelay: delay,
    coverageImpact: context.coverageImpact ? text(context.coverageImpact, '') || null : null,
  };
}

export function buildGuidanceAdvicePrompt(payload: GuidanceAdvicePayload): string {
  return `You are a strategic home management advisor. Provide a concise, 1-2 sentence "Strategic Take" for a homeowner dealing with the following issue:
- Asset: ${payload.assetName}
- Issue Category: ${payload.issueDomain}
- Signal: ${payload.signalIntentFamily}
- Reported Symptom: ${payload.symptom}
- Current Step in Plan: ${payload.currentStepLabel}
- Priority: ${payload.priorityBucket}
${payload.costOfDelay ? `- Approximate Cost of Delay: about $${payload.costOfDelay}\n` : ''}${payload.coverageImpact ? `- Coverage Status: ${payload.coverageImpact}\n` : ''}
Guidelines:
1. Be professional and reassuring.
2. Focus on "Why this step matters" or "What to watch out for".
3. Keep it under 200 characters.
4. Do not use placeholders or technical jargon.
5. Use only the facts above; do not invent facts, numbers, dates or coverage.`;
}
