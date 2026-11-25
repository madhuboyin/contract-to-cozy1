// BICC-BUY-011 / FRD §BUY: Ask does not rank, recommend, describe or compare homes or neighborhoods by protected-class composition, demographic proxies, predictions about who
// lives there, or suitability for a group of people, and it does not infer protected traits from names, schools, photos, documents or locations. A request that asks for that
// is refused with a fixed, authored reply that redirects to objective, user-chosen criteria. No model writes it and no tool runs.
//
// This is a closed, reviewed pattern set, not a judgement of intent. It is decided on the raw message right after the safety gate. It is deliberately narrow: a protected-class
// term alone is not refused ("wheelchair accessible", "near a church", "senior discount"); it is refused when it is used to describe or rank people in a place or a home's
// suitability for a group. Anything it misses reaches the ordinary router, which has no operation that answers such a request.
import type { AskOperationResult } from '../askOperationRegistry';
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';

export type FairHousingKind = 'PROTECTED_CLASS' | 'SUITABILITY_FOR_GROUP' | 'WHO_LIVES_THERE' | 'DESIRABILITY';

const normalize = (message: string): string => message.toLowerCase().normalize('NFKC').replace(/[’]/g, "'").replace(/[^a-z0-9'%\s-]/g, ' ').replace(/\s+/g, ' ').trim();

const NH = 'ne[a-z]{0,3}b[a-z]{0,3}hoods?'; // neighborhood, neighbourhood and the common misspellings (neigborhood)
const GROUP = '(?:white|black|african[- ]americans?|asians?|hispanics?|latinos?|latinas?|latinx|mexicans?|chinese|indians?|arabs?|middle eastern|native americans?|immigrants?|foreigners?|minorit(?:y|ies)|jewish|jews|muslims?|christians?|catholics?|hindus?|mormons?|sikhs?|buddhists?|atheists?|religious|gay|lesbian|lgbtq?\\+?|transgender|disabled|handicapped|elderly|seniors?|old people|retirees?|young people|young professionals|low[- ]income|working class|wealthy (?:people|families|folks)|rich (?:people|folks|families|neighbou?rs)|singles?|single (?:moms?|mothers?|dads?|fathers?|parents?)|families with (?:young )?(?:kids|children)|(?:couples|people|families|parents) with (?:young )?(?:kids|children)|childless|no kids|men|women|girls?|boys?)';
const PLACE_OR_PEOPLE = `(?:neighbou?rs?|${NH}|areas?|communit(?:y|ies)|blocks?|streets?|towns?|cities|zip(?: code)?s?|part of town|side of town|subdivisions?|developments?|complex(?:es)?|buildings?|people|folks|residents?|families|population|crowd|demographics?|lives? (?:there|here|nearby|around|next)|live (?:there|here|nearby|around|next))`;

const GROUP_IN_PLACE = new RegExp(`\\b${GROUP}\\b[^.?!]{0,40}\\b${PLACE_OR_PEOPLE}\\b|\\b${PLACE_OR_PEOPLE}\\b[^.?!]{0,40}\\b${GROUP}\\b`);
const withNH = (re: RegExp): RegExp => new RegExp(re.source.split('neighbou?rhoods?').join(NH).split('neighbou?rhood').join(NH), re.flags);
const EXPLICIT_SOURCE: ReadonlyArray<readonly [FairHousingKind, RegExp]> = [
  ['WHO_LIVES_THERE', /\b(?:demographics?|demographic (?:makeup|mix|breakdown|profile)|racial(?:ly)? (?:makeup|mix|breakdown|diverse|composition)|ethnic(?:ally)? (?:makeup|mix|breakdown|diverse|composition)|diversity of the|diverse (?:neighbou?rhood|area|community)|segregat\w*|gentrif\w* (?:and|with) (?:race|minorit))\b/],
  ['WHO_LIVES_THERE', /\bwho(?:'s| is| are)? (?:lives?|living|moved|moving) (?:in|around|near|next|nearby|there|here)\b/],
  ['WHO_LIVES_THERE', /\b(?:what|which) (?:kind|type|sort) of (?:people|folks|neighbou?rs|families|residents|crowd)\b/],
  ['WHO_LIVES_THERE', /\b(?:people|neighbou?rs|folks|families|residents) (?:like me|like us|like my family|of my (?:race|religion|background|culture|kind))\b|\bmy (?:kind|type) of (?:people|neighbou?rs|folks)\b/],
  ['WHO_LIVES_THERE', /\bavoid(?:ing)? (?:neighbou?rhoods?|areas?|communit(?:y|ies)|buildings?|streets?)\s+(?:with|that have|where|full of|filled with)\b/],
  ['SUITABILITY_FOR_GROUP', /\b(?:family[- ]friendly|kid[- ]friendly|child[- ]friendly|senior[- ]friendly|singles?[- ]friendly|adults? only|no kids|(?:ideal|perfect|best|good|great|right|suitable) (?:for|fit for) (?:a |my )?(?:young )?(?:famil(?:y|ies)|kids|children|couples?|singles?|retire\w*|seniors?|elderly|bachelors?|professionals?))\b[^.?!]{0,30}\b(?:neighbou?rhoods?|areas?|communit(?:y|ies)|town|streets?|homes?|houses?|listing|properties|property)?\b/],
  ['SUITABILITY_FOR_GROUP', /\b(?:neighbou?rhoods?|areas?|homes?|houses?|communit(?:y|ies)|streets?) (?:for|that (?:suits?|fits?)|suited (?:to|for)|where) (?:a |my )?(?:young )?(?:famil(?:y|ies)|kids|children|couples?|singles?|retire\w*|seniors?|elderly|bachelors?)\b/],
  ['DESIRABILITY', /\b(?:good|bad|nice|best|worst|safe|safest|unsafe|sketchy|rough|ghetto|desirable|undesirable|decent|dangerous|quiet|up and coming|trendy|better|worse|worst) (?:neighbou?rhoods?|part of town|side of town|zip codes?)\b/],
  ['DESIRABILITY', /\b(?:is|are|was|would) (?:this|that|the|my|it|these|those) (?:a )?(?:neighbou?rhood|area|part of town|side of town|zip code)s? (?:a )?(?:good|bad|safe|unsafe|nice|rough|sketchy|desirable|dangerous|decent|ok(?:ay)?)\b/],
  ['DESIRABILITY', /\b(?:rank|ranking|rate|rating|score|compare|best|top|worst) (?:the )?(?:neighbou?rhoods?|areas?|zip codes?|parts of town)\b/],
  ['SUITABILITY_FOR_GROUP', /\b(?:place|area|neighbou?rhood|town|community|street|school district) (?:to|for) (?:raise|raising|grow(?:ing)? up|bring(?:ing)? up) (?:my |our |a )?(?:kids|children|family|daughters?|sons?)\b/],
  ['SUITABILITY_FOR_GROUP', /\b(?:would|will|do|does|can) (?:my|our) (?:family|kids|children|wife|husband|partner|kind of people) (?:fit in|belong|feel (?:welcome|comfortable|at home))\b|\b(?:fit in|belong|feel welcome|feel at home) in (?:this|that|the) (?:neighbou?rhood|area|community|street)\b/],
  ['WHO_LIVES_THERE', /\b(?:tell me about|describe|what about|what are) (?:the )?(?:people|folks|residents|neighbou?rs|crowd) (?:next door|nearby|around|in the (?:area|neighbou?rhood|building|complex|community))\b/],
  ['WHO_LIVES_THERE', /\b(?:kids|children|families|people|neighbou?rs) like (?:mine|ours|my kids|my family|us)\b|\bwho hangs? out\b|\bhangs? out (?:there|here|around)\b/],
  ['WHO_LIVES_THERE', /\b(?:section 8|housing vouchers?|welfare|public housing|subsidized housing)\b[^.?!]{0,30}\b(?:neighbou?rs?|renters?|tenants?|residents?|nearby|around|area)\b/],
  ['DESIRABILITY', /\b(?:is|are) (?:this|that|it|the area|the neighbou?rhood) (?:a )?(?:safe|nice|decent|good|bad|rough) (?:area|neighbou?rhood|part of town)\b|\b(?:safe|nice|decent|good|bad|rough) place to (?:live|buy|raise|move)\b/],
  ['DESIRABILITY', /\bwhich (?:areas?|neighbou?rhoods?|parts of town|streets?|zip codes?) (?:should|do|would) (?:i|we) (?:avoid|stay away from|skip|steer clear of)\b/],
  ['DESIRABILITY', /\b(?:up and coming|on the rise|trendy) (?:area|neighbou?rhood|part of town)s?\b|\bwhich (?:neighbou?rhoods?|areas?) are (?:up and coming|on the rise|trendy)\b/],
];
const EXPLICIT: ReadonlyArray<readonly [FairHousingKind, RegExp]> = EXPLICIT_SOURCE.map(([kind, re]) => [kind, withNH(re)] as const);

/** The kind of steering the whole message asks for, or null. Evaluated on the raw message; the order is protected-class first, then who lives there, suitability, desirability. */
export function classifyFairHousingRequest(message: string): FairHousingKind | null {
  const text = normalize(message);
  if (!text) return null;
  // A stated suitability ("good for retirees") is reported as suitability even though it names a group; composition of a place by group is the protected-class case.
  for (const [kind, pattern] of EXPLICIT) if (kind === 'SUITABILITY_FOR_GROUP' && pattern.test(text)) return kind;
  if (GROUP_IN_PLACE.test(text)) return 'PROTECTED_CLASS';
  for (const [kind, pattern] of EXPLICIT) if (kind !== 'SUITABILITY_FOR_GROUP' && pattern.test(text)) return kind;
  return null;
}

/** One earlier turn of the same conversation, newest first: what the person typed and how Ask answered it. */
export interface FairHousingHistoryTurn { message: string; reasonCode: string | null }

const FOLLOW_UP_CUE = /^(?:and|but|so|ok(?:ay)?|then|also|what about|how about|just|well|with|without|that have|where|who|near|full of|filled with|having|those|the ones)\b|\b(?:there|those|them|that (?:area|neighbou?rhood|place|street|town|part)|the same|that one|the area|the neighbou?rhood|same area)\b/;
const MAX_FOLLOW_UP_WORDS = 14;
const MAX_HISTORY_WORDS = 40;
const words = (text: string): number => (text ? text.split(' ').length : 0);

/**
 * BICC-BUY-011 across turns. The single-message check (above) cannot see a request that is split ("which neighborhoods" then "with the fewest kids"), or a follow-up to a
 * refusal ("ok what about the families there"). Only a SHORT current message is combined with the previous one or two user messages, and only when the combination is refused although no single message is;
 * after a refusal, only a message that points back (a leading connective, or "there" / "those") is refused again. Everything else is the single-message result.
 * Limits: closed pattern set, last two turns only, English only; a request that never states the steering anywhere in those turns is not caught.
 */
export function classifyFairHousingRequestWithHistory(message: string, history: ReadonlyArray<FairHousingHistoryTurn> = []): FairHousingKind | null {
  const direct = classifyFairHousingRequest(message);
  if (direct) return direct;
  const text = normalize(message);
  if (!text || words(text) > MAX_FOLLOW_UP_WORDS || history.length === 0) return null;
  const previous = history[0];
  // After a refusal, only a message that points back at the refused subject (not any next question) is refused again.
  if (previous.reasonCode === 'ASK_FAIR_HOUSING_BOUNDARY' && FOLLOW_UP_CUE.test(text)) return classifyFairHousingRequest(previous.message) ?? 'WHO_LIVES_THERE';
  for (const count of [1, 2]) {
    const turns = history.slice(0, count);
    if (turns.length < count || turns.some((turn) => words(normalize(turn.message)) > MAX_HISTORY_WORDS)) continue;
    if (turns.some((turn) => classifyFairHousingRequest(turn.message))) continue;
    const joined = classifyFairHousingRequest(`${[...turns].reverse().map((turn) => turn.message).join(' ')} ${message}`);
    if (joined) return joined;
  }
  return null;
}

const OBJECTIVE = 'I can help with things you choose and that can be checked: price and total monthly cost, size, age and condition, commute times you give me, public services, environmental conditions such as flood zone, and documented inspection findings. Where I have a source and a date, I show them.';
const REPLIES: Readonly<Record<FairHousingKind, { title: string; body: string }>> = {
  PROTECTED_CLASS: { title: 'I can’t help with that comparison', body: `I don’t rank, describe or compare homes or neighborhoods by who lives there, and I don’t guess anything about people from a name, a photo, a school or a location. ${OBJECTIVE}` },
  WHO_LIVES_THERE: { title: 'I can’t tell you who lives there', body: `I don’t describe a neighborhood by who lives there or predict who will, and I don’t search for people like you. ${OBJECTIVE}` },
  SUITABILITY_FOR_GROUP: { title: 'I can’t judge who a home suits', body: `I don’t say that a home or neighborhood is right or wrong for a type of household. You decide what matters to you. ${OBJECTIVE}` },
  DESIRABILITY: { title: 'I can’t call a neighborhood good or bad', body: `Labels like good, bad or safe often stand in for who lives somewhere, so I don’t apply them. ${OBJECTIVE}` },
};

/** The whole result: one authored block, no tool, no clarification, no capture, no confirmation and no suggested-action row. */
export function fairHousingResult(kind: FairHousingKind): AskOperationResult {
  const reply = REPLIES[kind];
  return {
    status: 'OUT_OF_SCOPE',
    reasonCode: 'ASK_FAIR_HOUSING_BOUNDARY',
    blocks: [{ type: 'SUMMARY', id: 'fair-housing-boundary', title: reply.title, body: reply.body, tone: 'DEFAULT', actions: [] } as AskPresentationBlock],
    captureRequests: [],
    clarification: null,
    confirmation: null,
    suggestions: [],
    suggestedNextActions: [],
    suggestedNextActionsGoverned: true,
    suppressSkillHandoff: true,
  };
}
