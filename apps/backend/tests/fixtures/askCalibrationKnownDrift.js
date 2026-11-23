// Certification fixtures whose stored calibration evidence differs from live retrieval. Re-recording them refits the shared confidence curve
// (measured +20 routing hits, +15 misroutes, 51 fewer fallbacks, which the routing sweep ratchet rejects), so they stay recognised as known drift
// until calibration is isolated per operation (owner decision 2026-11-09). Any other fixture that drifts fails both tests that read this list.
module.exports = Object.freeze([
  'ask-routing-independent-v2-015', 'ask-routing-independent-v2-065', 'ask-routing-independent-v2-075',
  'ask-routing-independent-v2-121', 'ask-routing-independent-v2-068', 'ask-routing-independent-v2-122',
  // 123 (ITEM_REPLACEMENT_COST, 2026-11-09) has no evidence rows for the same reason as 122, and 030's strongest competitor is now that operation:
  // recording either refits the shared confidence curve.
  'ask-routing-independent-v2-123', 'ask-routing-independent-v2-030',
  // 124 (ITEM_RESERVE_ALLOCATION, 2026-11-10) has no evidence rows for the same reason, and 100's strongest competitor is now that operation.
  'ask-routing-independent-v2-124', 'ask-routing-independent-v2-100',
  // CANDIDATE_HOMES_REVIEW (BICC-4.1, 2026-11-23) is now the strongest competitor of 026 (a safety prompt, 0.0937 against 0.0871) and 106 (0.2824 against 0.2801). Neither changes the
  // expected operation's own score; recording them would refit the shared confidence curve, so they join the known drift for the same owner decision.
  'ask-routing-independent-v2-026', 'ask-routing-independent-v2-106',
  // 125 (CANDIDATE_HOMES_REVIEW) has no evidence rows for the same reason as 122 to 124 (recording it refits the shared confidence curve).
  'ask-routing-independent-v2-125',
]);
