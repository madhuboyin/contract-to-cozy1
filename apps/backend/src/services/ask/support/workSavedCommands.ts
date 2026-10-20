// Retry or dismiss a request from Work, and archive or restore a saved result (Sole Homeowner Interface FRD v1.3). Pure: the declared
// messages, entity types and action ids. These controls are declared row actions only (never typed), so a stray sentence can never reach
// them; each is confirmation-gated and scoped to the caller's own requests and the caller's own Saved list.
export const WORK_REQUEST_ENTITY_TYPE = 'AskExecution';
export const WORK_REQUEST_MESSAGES = { RETRY: 'Try this request again', DISMISS: 'Dismiss this pending request' } as const;
export type WorkRequestCommandKind = keyof typeof WORK_REQUEST_MESSAGES;
export const WORK_REQUEST_ACTION_IDS = { RETRY: 'work-request-retry', DISMISS: 'work-request-dismiss' } as const;
export const workRequestKindFromMessage = (message: string): WorkRequestCommandKind | null =>
  ((Object.entries(WORK_REQUEST_MESSAGES) as Array<[WorkRequestCommandKind, string]>).find(([, prefix]) => message.startsWith(prefix))?.[0]) ?? null;
export const workRequestMessage = (kind: WorkRequestCommandKind, question: string): string =>
  `${WORK_REQUEST_MESSAGES[kind]}: ${question.replace(/\s+/g, ' ').trim()}`.slice(0, 300);

export const SAVED_ARTIFACT_ENTITY_TYPE = 'SAVED_ARTIFACT';
export const SAVED_ARCHIVE_MESSAGES = { ARCHIVE: 'Archive this saved result', RESTORE: 'Restore this saved result' } as const;
export type SavedArchiveCommandKind = keyof typeof SAVED_ARCHIVE_MESSAGES;
export const SAVED_ARCHIVE_ACTION_IDS = { ARCHIVE: 'saved-archive', RESTORE: 'saved-restore' } as const;
export const savedArchiveKindFromMessage = (message: string): SavedArchiveCommandKind | null =>
  ((Object.entries(SAVED_ARCHIVE_MESSAGES) as Array<[SavedArchiveCommandKind, string]>).find(([, prefix]) => message.startsWith(prefix))?.[0]) ?? null;
export const savedArchiveMessage = (kind: SavedArchiveCommandKind, title: string): string =>
  `${SAVED_ARCHIVE_MESSAGES[kind]}: ${title.replace(/\s+/g, ' ').trim()}`.slice(0, 300);
