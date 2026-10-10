// What a confirmation receipt offers next, now that it cannot link to a desktop page (owner decision 2026-10-10: Ask never sends the homeowner to
// a desktop page). Each entry is an ordinary question that routes, deterministically, to the in-Ask answer that shows the record the receipt is about;
// `operationId` is what that question must resolve to, and receiptFollowUps.test.js proves it for every entry.
export const RECEIPT_FOLLOW_UPS = {
  TIMELINE: { label: 'Show my home timeline', message: 'Show my home timeline', operationId: 'HOME_TIMELINE_EVENTS' },
  WARRANTIES: { label: 'Show my warranties', message: 'Show my warranties', operationId: 'WARRANTY_LOOKUP' },
  ROOMS: { label: 'Show my rooms', message: 'Show my rooms', operationId: 'PROPERTY_SUMMARY' },
  PROPERTY_RECORD: { label: 'Show my home record', message: 'Give me a summary of my home record', operationId: 'PROPERTY_SUMMARY' },
  DOCUMENTS: { label: 'Show my documents', message: 'Show my documents', operationId: 'DOCUMENT_LOOKUP' },
  MAINTENANCE: { label: 'Show pending maintenance', message: 'What maintenance is pending?', operationId: 'MAINTENANCE_STATUS' },
  HOME_ACTIONS: { label: 'Show what needs attention', message: 'What needs my attention next?', operationId: 'HOME_ACTIONS' },
  BUYER_PLAN: { label: 'Show my purchase status', message: 'What is the status of my home purchase?', operationId: 'BUYER_PLAN_STATUS' },
  BUYER_INSPECTION: { label: 'Show inspection decisions', message: 'Which inspection findings still need a decision?', operationId: 'BUYER_INSPECTION_REVIEW' },
  INSPECTION_FINDINGS: { label: 'Show open inspection findings', message: 'Show my open inspection findings', operationId: 'INSPECTION_FINDINGS' },
  CLAIMS: { label: 'Show my claims', message: 'Do I have any pending claims?', operationId: 'INCIDENT_CLAIM_STATUS' },
  RECALLS: { label: 'Show my recall matches', message: 'Show my open recall matches', operationId: 'RECALL_REVIEW' },
  SELLER_PREP: { label: 'Show my sale readiness checklist', message: 'Show my sale readiness checklist', operationId: 'SELLER_PREP_CHECKLIST' },
  GUIDED_PLANS: { label: 'Show my guided plan', message: 'Show my guided plan', operationId: 'GUIDANCE_JOURNEYS_LIST' },
  QUOTES: { label: 'Show my quote comparisons', message: 'Show my quote comparisons', operationId: 'QUOTE_COMPARISON_REVIEW' },
  RADAR: { label: 'Show my home event radar', message: 'Show my home event radar feed', operationId: 'HOME_EVENT_RADAR_FEED' },
} as const;
export type ReceiptFollowUpKey = keyof typeof RECEIPT_FOLLOW_UPS;

/** The typed in-Ask action a receipt carries in place of a link: it starts the ordinary read question for the record the receipt is about. */
export function receiptFollowUpAction(key: ReceiptFollowUpKey) {
  const entry = RECEIPT_FOLLOW_UPS[key];
  return {
    id: `receipt-show-${key.toLowerCase().replace(/_/g, '-')}`, label: entry.label, interactionType: 'START_WORKFLOW' as const,
    message: entry.message, operationId: entry.operationId, style: 'SECONDARY' as const,
  };
}

/** True only for exactly the action receiptFollowUpAction builds, so the trust policy can allow it on any receipt without a per-operation list. */
export function isReceiptFollowUpAction(action: { id: string; label?: string; href?: string; interactionType?: string; message?: string; operationId?: string }): boolean {
  if (action.href || action.interactionType !== 'START_WORKFLOW') return false;
  return (Object.keys(RECEIPT_FOLLOW_UPS) as ReceiptFollowUpKey[]).some((key) => {
    const expected = receiptFollowUpAction(key);
    return action.id === expected.id && action.label === expected.label && action.message === expected.message && action.operationId === expected.operationId;
  });
}
