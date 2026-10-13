// Following, dismissing or setting aside a local change inside Ask (register P1 "Neighborhood Change Radar"; FRD v1.326). Pure: declared messages, action
// ids and the entity type.
//
// A person's reading of a local change is their own: the interaction is stored per user and match, so a viewer may set it for themselves (the owner rule:
// a viewer may change only state scoped exclusively to their own account) and it changes nothing for anyone else.
export const NEIGHBORHOOD_RECORD_ENTITY_TYPE = 'AROUND_YOUR_HOME_RECORD';
export const NEIGHBORHOOD_COMMAND_MESSAGES = {
  FOLLOW: 'Follow this local change.',
  DISMISS: 'Dismiss this local change.',
  NOT_RELEVANT: 'Mark this local change as not relevant to me.',
} as const;
export type NeighborhoodCommandKind = keyof typeof NEIGHBORHOOD_COMMAND_MESSAGES;
export const NEIGHBORHOOD_COMMAND_ACTION_IDS = { FOLLOW: 'neighborhood-follow', DISMISS: 'neighborhood-dismiss', NOT_RELEVANT: 'neighborhood-not-relevant' } as const;
export const neighborhoodCommandKindFromMessage = (message: string): NeighborhoodCommandKind | null =>
  ((Object.entries(NEIGHBORHOOD_COMMAND_MESSAGES) as Array<[NeighborhoodCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const NEIGHBORHOOD_KIND_LABELS: Record<NeighborhoodCommandKind, { title: string; confirm: string; description: string; receipt: string }> = {
  FOLLOW: { title: 'Follow this change?', confirm: 'Follow it', description: 'It is marked as one you are following, and it is flagged when the source revises it. This is only your own view; nothing changes for anyone else.', receipt: 'You are following it.' },
  DISMISS: { title: 'Dismiss this change?', confirm: 'Dismiss it', description: 'It is set aside from your list. This is only your own view; the source record and other household members are unaffected.', receipt: 'It is set aside from your list.' },
  NOT_RELEVANT: { title: 'Mark this as not relevant to you?', confirm: 'Mark not relevant', description: 'It is set aside as not relevant to you. This is only your own view; the source record and other household members are unaffected.', receipt: 'It is set aside as not relevant.' },
};
/** What a change's current reading allows: a followed change is not followed again, a set-aside one is not listed in Ask. */
export function neighborhoodKindsFor(disposition: string): NeighborhoodCommandKind[] {
  if (disposition === 'DISMISSED' || disposition === 'NOT_RELEVANT') return [];
  return disposition === 'FOLLOWING' ? ['DISMISS', 'NOT_RELEVANT'] : ['FOLLOW', 'DISMISS', 'NOT_RELEVANT'];
}
