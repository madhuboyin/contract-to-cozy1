// Composition FRD: the two fixed homeowner-facing messages for a declined composition (FR-DEC-4) and a failed slot revalidation (FR-SLT-3). Pure.

// Composition FRD FR-DEC-4: the one honest sentence appended to a single-operation answer when the message had more than one part and could not be composed.
export function declinedCompositionNote(reason: string, clauseCount: number) {
  const body = reason === 'TOO_MANY_CLAUSES'
    ? `Your message had ${clauseCount} parts. Ask answers up to two together, so this may not cover every part. Ask the others on their own and I’ll answer each.`
    : 'Your message had more than one question, and I couldn’t combine them into one answer, so this covers the main one. Ask the other part on its own and I’ll answer it.';
  return { type: 'SUMMARY' as const, id: 'composition-declined-note', title: 'Part of your question isn’t answered here', body, tone: 'CAUTION' as const, actions: [] };
}

// Composition FRD FR-SLT-3: the focused question asked when a carried slot fails revalidation.
export function slotRevalidationQuestion(reason: 'ITEM_NOT_FOUND' | 'PROPERTY_NOT_ACCESSIBLE') {
  return reason === 'ITEM_NOT_FOUND'
    ? { reasonCode: 'ASK_SLOT_ITEM_NOT_FOUND', block: { type: 'SUMMARY' as const, id: 'slot-item-not-found', title: 'Which item do you mean?', body: 'I can’t find the item from your earlier question on your home record any more, so I haven’t guessed. Tell me which item you mean, for example “roof” or “water heater”.', tone: 'DEFAULT' as const, actions: [] } }
    : { reasonCode: 'ASK_SLOT_PROPERTY_UNAVAILABLE', block: { type: 'SUMMARY' as const, id: 'slot-property-unavailable', title: 'Which home do you mean?', body: 'The home from your earlier question isn’t available to you right now, so I haven’t used it. Tell me which home and item you mean and I’ll answer.', tone: 'DEFAULT' as const, actions: [] } };
}

