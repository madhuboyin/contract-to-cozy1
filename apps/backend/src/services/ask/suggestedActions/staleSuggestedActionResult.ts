// The result an operation returns when a selected Suggested Next Action's exact target changed after it was offered: the same
// copy as the typed recovery for an unverifiable selection (createAskExecution), so the homeowner sees one consistent message and
// nothing is done. Operations call this instead of falling back to a different record that happens to match the message.
import type { AskOperationResult } from '../askOperationRegistry';

export function staleSuggestedActionResult(): AskOperationResult {
  return {
    status: 'NOT_APPLICABLE', reasonCode: 'ASK_SUGGESTED_ACTION_STALE',
    blocks: [{
      type: 'SUMMARY', id: 'suggested-action-unavailable', title: 'That suggestion is no longer available',
      body: 'It was based on information that has since changed, so nothing was done. Your earlier answer is unchanged — ask again in your own words or pick a current suggestion.',
      tone: 'CAUTION', actions: [],
    }],
    suggestions: [],
  };
}
