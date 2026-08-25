// Re-exported for services-layer callers — the canonical definition lives
// in productFramework/feedback.contract.ts so the Ask operation contract
// (productFramework/ask/ask.contract.ts) can validate against it without
// importing from the services layer.
export {
  FEEDBACK_REASON_CODES,
  isFeedbackReasonCode,
  isSafetySensitiveFeedback,
  type FeedbackReasonCode,
} from '../../productFramework/feedback.contract';
