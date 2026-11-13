// Reliability FRD FR-REC-2, FR-REC-7 and FR-UND-12: every non-answer has its OWN reason code, telemetry code and (where the homeowner sees something) copy, and none is folded into another or into a generic "I couldn't find an
// answer". Pure: this module only names and words the outcomes; where each one is raised is in createAskExecution (model path) and recoveryCodeForReason (existing results).
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';

export type RecoveryCode =
  | 'OUT_OF_DOMAIN' | 'CAPABILITY_ABSENT' | 'DATA_POINT_UNREACHABLE' | 'MISSING_RECORD_DATA'
  | 'MODEL_NONE_FITS' | 'MODEL_INSUFFICIENT_TEXT' | 'UNINTERPRETABLE_AFTER_MINIMISATION'
  | 'MODEL_SCHEMA_INVALID' | 'STAGE1_UNAVAILABLE' | 'STAGE2_UNAVAILABLE' | 'MODEL_UNAVAILABLE';

/** How an outcome is counted in reports (FR-REC-2 / §4.3): a coverage defect and an unreachable data point are failures; none-fits is an unconfirmed gap, never proof a capability is missing. */
export type RecoveryReporting = 'RECOVERY_SHOWN' | 'COVERAGE_DEFECT' | 'UNCONFIRMED_GAP' | 'TELEMETRY_ONLY';
export interface RecoveryOutcome {
  readonly code: RecoveryCode;
  /** The reason code on the persisted result (stable, one per outcome, never shared). */
  readonly reasonCode: string;
  /** The telemetry code (FR-UND-12 table). */
  readonly telemetryCode: string;
  readonly reporting: RecoveryReporting;
  /** What the homeowner sees. Absent when the original local decision is restored and nothing about the model failure is shown (FR-UND-4). */
  readonly copy?: { readonly title: string; readonly body: string };
}

const outcome = (code: RecoveryCode, reporting: RecoveryReporting, copy?: RecoveryOutcome['copy']): RecoveryOutcome => ({ code, reasonCode: `ASK_RECOVERY_${code}`, telemetryCode: code, reporting, ...(copy ? { copy } : {}) });

export const RECOVERY_OUTCOMES: Readonly<Record<RecoveryCode, RecoveryOutcome>> = Object.freeze({
  OUT_OF_DOMAIN: outcome('OUT_OF_DOMAIN', 'RECOVERY_SHOWN', { title: 'That’s outside what I help with', body: 'That’s outside what I help with. I can help with questions about your home.' }),
  // Reserved for a human-labelled or deterministic absence (FR-REC-2): never raised automatically from a model result.
  CAPABILITY_ABSENT: outcome('CAPABILITY_ABSENT', 'RECOVERY_SHOWN', { title: 'I can’t do that analysis yet', body: 'I can’t do that analysis yet.' }),
  DATA_POINT_UNREACHABLE: outcome('DATA_POINT_UNREACHABLE', 'COVERAGE_DEFECT', { title: 'I can’t show that yet', body: 'Your home record includes that, but I can’t show it yet.' }),
  // The homeowner-facing copy of a missing record value is written by the handler that knows what is missing and how to add it (R2); this entry fixes the reason code and the reporting class.
  MISSING_RECORD_DATA: outcome('MISSING_RECORD_DATA', 'RECOVERY_SHOWN'),
  // FR-REC-7: never a capability-absence claim.
  MODEL_NONE_FITS: outcome('MODEL_NONE_FITS', 'UNCONFIRMED_GAP', { title: 'I couldn’t match that', body: 'I couldn’t confidently match that to a home task or question I can handle. Try rephrasing, or choose an area.' }),
  MODEL_INSUFFICIENT_TEXT: outcome('MODEL_INSUFFICIENT_TEXT', 'RECOVERY_SHOWN', { title: 'I need one more detail', body: 'I need a little more to go on. Tell me which part of your home or which question you mean, for example an item, a document or a cost.' }),
  UNINTERPRETABLE_AFTER_MINIMISATION: outcome('UNINTERPRETABLE_AFTER_MINIMISATION', 'RECOVERY_SHOWN', { title: 'Could you rephrase that?', body: 'I couldn’t work out what you meant from that. Could you say it a different way, without account or ID numbers?' }),
  MODEL_SCHEMA_INVALID: outcome('MODEL_SCHEMA_INVALID', 'TELEMETRY_ONLY'),
  STAGE1_UNAVAILABLE: outcome('STAGE1_UNAVAILABLE', 'TELEMETRY_ONLY'),
  STAGE2_UNAVAILABLE: outcome('STAGE2_UNAVAILABLE', 'TELEMETRY_ONLY'),
  MODEL_UNAVAILABLE: outcome('MODEL_UNAVAILABLE', 'TELEMETRY_ONLY'),
});

/** The outcomes whose recovery the homeowner sees when the model path ends this way and the local router matched nothing. */
export const MODEL_PATH_RECOVERIES: ReadonlySet<RecoveryCode> = new Set<RecoveryCode>(['MODEL_NONE_FITS', 'MODEL_INSUFFICIENT_TEXT', 'UNINTERPRETABLE_AFTER_MINIMISATION']);

/** The recovery card: the outcome's own copy, a way to rephrase (the message box) and the guided entry into the areas Ask covers (capability discovery). */
export function recoveryBlock(code: RecoveryCode): AskPresentationBlock {
  const entry = RECOVERY_OUTCOMES[code];
  if (!entry.copy) throw new Error(`${code} has no homeowner-facing copy`);
  return {
    type: 'SUMMARY', id: `recovery-${code.toLowerCase().replace(/_/g, '-')}`, title: entry.copy.title, body: entry.copy.body, tone: 'CAUTION',
    actions: [{ id: 'recovery-choose-an-area', label: 'Choose an area', interactionType: 'START_WORKFLOW', message: 'What can Ask help me with?', operationId: 'CAPABILITY_DISCOVERY', style: 'SECONDARY' }],
  } as AskPresentationBlock;
}

/**
 * Existing results that already ARE one of these outcomes, reported under the outcome's own code so the reports are separated even where the copy is written elsewhere (FR-REC-2: never mixed in reports). Returns null
 * for a result that is not a recovery outcome.
 */
const REASON_ALIASES: Readonly<Record<string, RecoveryCode>> = Object.freeze({
  NOT_HOMEOWNER_DOMAIN: 'OUT_OF_DOMAIN',
  DATA_POINT_NOT_RECORDED: 'MISSING_RECORD_DATA', DATA_POINT_NO_INVENTORY: 'MISSING_RECORD_DATA', DATA_POINT_PARTIAL: 'MISSING_RECORD_DATA', DATA_POINT_QUERY_PARTIAL: 'MISSING_RECORD_DATA',
});
export function recoveryCodeForReason(reasonCode: string | null | undefined): RecoveryCode | null {
  if (!reasonCode) return null;
  const own = Object.values(RECOVERY_OUTCOMES).find((entry) => entry.reasonCode === reasonCode);
  return own ? own.code : REASON_ALIASES[reasonCode] ?? null;
}
