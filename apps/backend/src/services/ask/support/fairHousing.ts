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

const GROUP = '(?:white|black|african[- ]americans?|asians?|hispanics?|latinos?|latinas?|latinx|mexicans?|chinese|indians?|arabs?|middle eastern|native americans?|immigrants?|foreigners?|minorit(?:y|ies)|jewish|jews|muslims?|christians?|catholics?|hindus?|mormons?|sikhs?|buddhists?|atheists?|religious|gay|lesbian|lgbtq?\\+?|transgender|disabled|handicapped|elderly|seniors?|old people|retirees?|young people|singles?|single (?:moms?|mothers?|dads?|fathers?|parents?)|families with (?:young )?(?:kids|children)|(?:couples|people|families|parents) with (?:young )?(?:kids|children)|childless|no kids|men|women|girls?|boys?)';
const PLACE_OR_PEOPLE = '(?:neighbou?rs?|neighbou?rhoods?|areas?|communit(?:y|ies)|blocks?|streets?|towns?|cities|zip(?: code)?s?|part of town|side of town|subdivisions?|developments?|complex(?:es)?|buildings?|people|folks|residents?|families|population|crowd|demographics?|lives? (?:there|here|nearby|around|next)|live (?:there|here|nearby|around|next))';

const GROUP_IN_PLACE = new RegExp(`\\b${GROUP}\\b[^.?!]{0,40}\\b${PLACE_OR_PEOPLE}\\b|\\b${PLACE_OR_PEOPLE}\\b[^.?!]{0,40}\\b${GROUP}\\b`);
const EXPLICIT: ReadonlyArray<readonly [FairHousingKind, RegExp]> = [
  ['WHO_LIVES_THERE', /\b(?:demographics?|demographic (?:makeup|mix|breakdown|profile)|racial(?:ly)? (?:makeup|mix|breakdown|diverse|composition)|ethnic(?:ally)? (?:makeup|mix|breakdown|diverse|composition)|diversity of the|diverse (?:neighbou?rhood|area|community)|segregat\w*|gentrif\w* (?:and|with) (?:race|minorit))\b/],
  ['WHO_LIVES_THERE', /\bwho(?:'s| is| are)? (?:lives?|living|moved|moving) (?:in|around|near|next|nearby|there|here)\b/],
  ['WHO_LIVES_THERE', /\b(?:what|which) (?:kind|type|sort) of (?:people|folks|neighbou?rs|families|residents|crowd)\b/],
  ['WHO_LIVES_THERE', /\b(?:people|neighbou?rs|folks|families|residents) (?:like me|like us|like my family|of my (?:race|religion|background|culture|kind))\b|\bmy (?:kind|type) of (?:people|neighbou?rs|folks)\b/],
  ['WHO_LIVES_THERE', /\bavoid(?:ing)? (?:neighbou?rhoods?|areas?|communit(?:y|ies)|buildings?|streets?)\s+(?:with|that have|where|full of|filled with)\b/],
  ['SUITABILITY_FOR_GROUP', /\b(?:family[- ]friendly|kid[- ]friendly|child[- ]friendly|senior[- ]friendly|singles?[- ]friendly|adults? only|no kids|(?:ideal|perfect|best|good|great|right|suitable) (?:for|fit for) (?:a |my )?(?:young )?(?:famil(?:y|ies)|kids|children|couples?|singles?|retire\w*|seniors?|elderly|bachelors?|professionals?))\b[^.?!]{0,30}\b(?:neighbou?rhoods?|areas?|communit(?:y|ies)|town|streets?|homes?|houses?|listing|properties|property)?\b/],
  ['SUITABILITY_FOR_GROUP', /\b(?:neighbou?rhoods?|areas?|homes?|houses?|communit(?:y|ies)|streets?) (?:for|that (?:suits?|fits?)|suited (?:to|for)|where) (?:a |my )?(?:young )?(?:famil(?:y|ies)|kids|children|couples?|singles?|retire\w*|seniors?|elderly|bachelors?)\b/],
  ['DESIRABILITY', /\b(?:good|bad|nice|best|worst|safe|safest|unsafe|sketchy|rough|ghetto|desirable|undesirable|decent|dangerous|quiet|up and coming|trendy|better|worse|worst) (?:neighbou?rhood|neighbou?rhoods|part of town|side of town|zip codes?)\b/],
  ['DESIRABILITY', /\b(?:is|are|was|would) (?:this|that|the|my|it|these|those) (?:a )?(?:neighbou?rhood|area|part of town|side of town|zip code)s? (?:a )?(?:good|bad|safe|unsafe|nice|rough|sketchy|desirable|dangerous|decent|ok(?:ay)?)\b/],
  ['DESIRABILITY', /\b(?:rank|ranking|rate|rating|score|compare|best|top|worst) (?:the )?(?:neighbou?rhoods?|areas?|zip codes?|parts of town)\b/],
];

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
