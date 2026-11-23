// BICC-UX-010: a pure social turn (a greeting, thanks, an acknowledgement, a goodbye, light rapport) gets a brief, warm, authored reply. It never runs a tool, never asks a
// clarification and never carries a suggested-action row. The replies state no home fact, no memory, no feeling and no completed work, and the wording is fixed (no
// model writes it). A message that adds anything beyond the social phrase ("hi, what is due this week") is NOT a social turn: it goes to the ordinary router, so the
// real request is never swallowed by the greeting.
import type { AskOperationResult } from '../askOperationRegistry';
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';

export type SocialTurnKind = 'GREETING' | 'THANKS' | 'ACKNOWLEDGEMENT' | 'GOODBYE' | 'WELLBEING' | 'DAY_CHECK' | 'JOKE_REQUEST';

const CLOSERS = '(?:\\s*(?:so much|very much|a lot|again|there|cozy|ask cozy))?';
const PHRASES: ReadonlyArray<readonly [SocialTurnKind, RegExp]> = [
  ['GREETING', new RegExp(`^(?:hi|hello|hey|hiya|howdy|good (?:morning|afternoon|evening))${CLOSERS}$`)],
  ['THANKS', new RegExp(`^(?:thanks?|thank you|thx|ty|many thanks|much appreciated|appreciate it)${CLOSERS}$`)],
  ['ACKNOWLEDGEMENT', /^(?:ok|okay|k|cool|great|nice|perfect|awesome|got it|sounds good|makes sense|alright|fine|good|understood|i see|noted)$/],
  ['GOODBYE', /^(?:bye|goodbye|good night|goodnight|see you|see ya|talk later|talk to you later|take care)$/],
  ['WELLBEING', /^(?:how are you(?: doing)?(?: today)?|how'?s it going|what'?s up|how do you do)$/],
  ['DAY_CHECK', /^(?:how is|how'?s) (?:my|your) day(?: going| been| so far)?$/],
  ['JOKE_REQUEST', /^tell me a joke$/],
];

const normalize = (message: string): string => message.toLowerCase().normalize('NFKC').replace(/[’]/g, "'").replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** The social kind when the WHOLE message is a social phrase; null otherwise (a longer message is a request, even when it opens with a greeting). */
export function classifySocialTurn(message: string): SocialTurnKind | null {
  const text = normalize(message);
  if (!text || text.split(' ').length > 6) return null;
  for (const [kind, pattern] of PHRASES) if (pattern.test(text)) return kind;
  return null;
}

const OFFER = 'I can help with your home: maintenance, records, costs, warranties and more.';
const REPLIES: Readonly<Record<SocialTurnKind, { title: string; body: string }>> = {
  GREETING: { title: 'Hello', body: `Hi! ${OFFER} What would you like to look at?` },
  THANKS: { title: 'You’re welcome', body: 'You’re welcome. Ask me anything else about your home whenever you like.' },
  ACKNOWLEDGEMENT: { title: 'Sounds good', body: 'Sounds good. I’m here whenever you want to look at something else.' },
  GOODBYE: { title: 'Take care', body: 'Take care. I’ll be here whenever you want to check on something at home.' },
  WELLBEING: { title: 'Thanks for asking', body: `Thanks for asking. ${OFFER} What would you like to look at?` },
  DAY_CHECK: { title: 'Your day', body: `I can’t see how your day is going, but I hope it’s a good one. ${OFFER} What would you like to look at?` },
  JOKE_REQUEST: { title: 'Jokes', body: `I’m better with homes than jokes. ${OFFER} What would you like to look at?` },
};

/** The whole result for a social turn: one authored block, no clarification, no suggestions (so no suggested-action row), no capture and no confirmation. */
export function socialTurnResult(kind: SocialTurnKind): AskOperationResult {
  const reply = REPLIES[kind];
  return {
    status: 'ANSWERED',
    reasonCode: 'ASK_SOCIAL_TURN',
    blocks: [{ type: 'SUMMARY', id: 'social-turn', title: reply.title, body: reply.body, tone: 'DEFAULT', actions: [] } as AskPresentationBlock],
    captureRequests: [],
    clarification: null,
    confirmation: null,
    suggestions: [],
    suggestedNextActions: [],
    suggestedNextActionsGoverned: true,
    suppressSkillHandoff: true,
  };
}
