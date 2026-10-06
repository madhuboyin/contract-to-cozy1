// apps/backend/src/services/diy/completionEffectsStatus.ts
//
// What a person is told about the records that follow a DIY completion (docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md section 3.4). PURE and
// read-only: it maps the project's status and its outbox event's status to fixed copy. The raw `lastError` is never shown.
//
//   event PENDING / PROCESSING        -> RECORDING        (no recovery)
//   event FAILED (will retry itself)  -> RECORDING        (no recovery: a reset would hide the retry count and could postpone dead-lettering)
//   event DEAD_LETTER                 -> NEEDS_ATTENTION  (recovery offered)
//   event PROCESSED                   -> RECORDED
//   completed project, no event       -> LEGACY_UNKNOWN   (completed before effect tracking existed; nothing is reconstructed)
//   project not completed             -> null
export type DiyCompletionEffectsState = 'RECORDING' | 'RECORDED' | 'NEEDS_ATTENTION' | 'LEGACY_UNKNOWN';

export type DiyCompletionEffectsView = { state: DiyCompletionEffectsState; summary: string; canRecover: boolean };

export const COMPLETION_EFFECTS_COPY: Record<DiyCompletionEffectsState, string> = {
  RECORDING: 'Recording your completion.',
  RECORDED: 'Completion recorded.',
  NEEDS_ATTENTION: 'Some records could not be updated.',
  LEGACY_UNKNOWN: 'Completion was recorded before effect tracking was added. Related record updates are not verified here.',
};

export function describeCompletionEffects(projectStatus: string, eventStatus: string | null): DiyCompletionEffectsView | null {
  if (projectStatus !== 'COMPLETED') return null;
  const state: DiyCompletionEffectsState =
    eventStatus === null ? 'LEGACY_UNKNOWN'
      : eventStatus === 'PROCESSED' ? 'RECORDED'
        : eventStatus === 'DEAD_LETTER' ? 'NEEDS_ATTENTION'
          : 'RECORDING'; // PENDING, PROCESSING, FAILED (retrying automatically)
  return { state, summary: COMPLETION_EFFECTS_COPY[state], canRecover: state === 'NEEDS_ATTENTION' };
}
