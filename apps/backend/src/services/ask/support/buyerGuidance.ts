// BICC-BUY-001: general guidance for a person who is thinking about buying a home, answered without a property and without a model. The wording is fixed and reviewed, states no fact
// about any particular home, recommends no home, neighborhood or price, and always points to the professionals who decide the things that vary by state and contract. It
// covers a closed set of whole-question forms (the steps, what to check, what it costs, what an inspection is, and "what should I offer", which it declines to answer with a number).
// Anything else, and any specific request, goes to the ordinary router. Steering by who lives somewhere is refused earlier (fairHousing.ts) and never reaches here.
import type { AskOperationResult } from '../askOperationRegistry';
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { buyerIntroResult, isBuyerIntro } from './buyerIntro';

export type BuyerGuidanceKind = 'INTRO' | 'STEPS' | 'WHAT_TO_CHECK' | 'COSTS' | 'INSPECTION' | 'OFFER_PRICE' | 'NEEDS_HOME';

const normalize = (message: string): string => message.toLowerCase().normalize('NFKC').replace(/[’]/g, "'").replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
const HOME = '(?:a |your |my |our )?(?:first |new )?(?:house|home|property|condo|townhouse)';

type TopicKind = Exclude<BuyerGuidanceKind, 'INTRO' | 'NEEDS_HOME'>;
const TOPICS: ReadonlyArray<readonly [TopicKind, readonly RegExp[]]> = [
  ['OFFER_PRICE', [
    new RegExp(`^(?:what(?: is|'s)|what would be) (?:a |the )?(?:good|fair|right|smart|reasonable) (?:price|amount|number) to offer(?: on| for)? ${HOME}$`),
    new RegExp(`^how much (?:should|do|would) (?:i|we) (?:offer|bid)(?: on| for)? ${HOME}$`),
    new RegExp(`^(?:how (?:do|should) (?:i|we)|how to) (?:decide|figure out|pick|choose|know) (?:how much|what) to offer(?: on| for)? ${HOME}$`),
  ]],
  ['STEPS', [
    new RegExp(`^(?:what are|what is|what's) the (?:steps|process|stages)(?: involved)? (?:to|of|for|in) (?:buying|purchasing|buy|purchase) ${HOME}$`),
    new RegExp(`^how (?:does|do) (?:buying|purchasing) ${HOME} work$`),
    /^how (?:does|do) the (?:home|house) (?:buying|purchase|purchasing) process work$/,
    new RegExp(`^(?:walk me through|explain|tell me about) (?:the process of )?(?:buying|purchasing) ${HOME}$`),
  ]],
  ['WHAT_TO_CHECK', [
    new RegExp(`^what (?:should|do|can) (?:i|we) (?:need to )?(?:look for|check|ask|inspect|watch for|know)(?: about)? (?:when|before|while) (?:buying|purchasing|i buy|we buy|i purchase|we purchase) ${HOME}$`),
    new RegExp(`^what to (?:look for|check|ask|watch for) (?:when|before|while) (?:buying|purchasing) ${HOME}$`),
    new RegExp(`^(?:what are|what is) the (?:things|things to look for|red flags|warning signs) (?:to|when|before) (?:look for|check|watch for|buying|purchasing)(?: when buying| before buying)? ?${HOME}?$`),
  ]],
  ['COSTS', [
    new RegExp(`^(?:what|which) costs (?:are|come) (?:involved )?(?:in|with|when) (?:buying|purchasing) ${HOME}$`),
    new RegExp(`^how much (?:does it cost|is it|will it cost) to (?:buy|purchase) ${HOME}$`),
    new RegExp(`^what (?:are|is) (?:all )?the (?:costs|expenses|fees) (?:of|to|for|when|in) (?:buying|purchasing|buy|purchase) ${HOME}$`),
    new RegExp(`^(?:what|which) (?:closing )?costs (?:should|do) (?:i|we) (?:expect|budget for|plan for) (?:when|if) (?:buying|purchasing|i buy|we buy) ${HOME}$`),
  ]],
  ['INSPECTION', [
    /^(?:what is|what's|how does) a home inspection(?: work| cover| involve)?$/,
    /^what does a home inspection (?:cover|include|check|involve)$/,
    new RegExp(`^do (?:i|we) need a (?:home )?inspection (?:when|before) (?:buying|purchasing) ${HOME}$`),
    /^what (?:happens|should i expect) (?:at|during) a home inspection$/,
  ]],
];

// BICC-D42: only when the person has explicitly turned on "Looking to buy" for this conversation. The buying context is then known, so the
// same closed set of questions is recognised without the words "buying a home". Still whole-message forms only; nothing here reads a home, a number or a name.
const BUYER_MODE_TOPICS: ReadonlyArray<readonly [TopicKind, readonly RegExp[]]> = [
  ['OFFER_PRICE', [
    /^(?:what|how much) (?:should|do|would) (?:i|we) (?:offer|bid)$/,
    /^(?:what(?: is|'s)|what would be) (?:a |the )?(?:good|fair|right|reasonable) (?:price|amount|number|offer)(?: to offer)?$/,
  ]],
  ['WHAT_TO_CHECK', [
    /^what (?:should|do|can) (?:i|we) (?:need to )?(?:look for|check|ask|inspect|watch for)(?: at| in| during)?(?: a| the)?(?: (?:home|house|showing|open house|walkthrough))?$/,
    /^what to (?:look for|check|watch for)$/,
    /^what are the (?:red flags|warning signs)$/,
  ]],
  ['COSTS', [
    /^(?:what|which) (?:costs|expenses|fees) (?:are|come) (?:involved|up)$/,
    /^what are the (?:closing )?costs$/,
    /^how much (?:are|will) (?:the )?closing costs(?: be)?$/,
  ]],
  ['STEPS', [
    /^what are the steps$/,
    /^(?:where|how) (?:do|should) (?:i|we) (?:start|begin|get started)$/,
  ]],
  ['INSPECTION', [
    /^do (?:i|we) need an? (?:home )?inspection$/,
  ]],
];

/** The kind of buyer request the WHOLE message is, or null. A message that names a particular home, number, document, date or task is never one of these. */
export function classifyBuyerRequest(message: string, options: { buyerMode?: boolean } = {}): BuyerGuidanceKind | null {
  const text = normalize(message);
  if (!text || text.split(' ').length > 16) return null;
  for (const [kind, patterns] of TOPICS) if (patterns.some((pattern) => pattern.test(text))) return kind;
  if (options.buyerMode) for (const [kind, patterns] of BUYER_MODE_TOPICS) if (patterns.some((pattern) => pattern.test(text))) return kind;
  return isBuyerIntro(message) ? 'INTRO' : null;
}

const CHECK_WITH = 'Rules and timelines differ by state and by contract, so confirm the details with your agent, attorney and lender.';
const GUIDANCE: Readonly<Record<TopicKind | 'NEEDS_HOME', { title: string; body: string }>> = {
  STEPS: {
    title: 'How buying a home usually works',
    body: [
      'The usual order is: set a budget and get a lender’s pre-approval; look at homes; make an offer; sign a purchase contract; then, during the contract period, the inspection, the appraisal and the lender’s underwriting; then title and escrow work; a final walkthrough; and closing, when funds move and you get the keys.',
      CHECK_WITH,
      'You can add the homes you’re looking at with the “Homes I’m considering” button, and I’ll show what each would cost to buy and own using your numbers. When you’re under contract on one, I can follow the closing steps with you.',
    ].join('\n\n'),
  },
  WHAT_TO_CHECK: {
    title: 'What to check when buying a home',
    body: [
      'Things you can check and compare: the total monthly cost (loan payment, property tax, insurance, any HOA fee, utilities) and not just the price; the age and condition of the roof, heating and cooling, water heater, electrical and plumbing; signs of water or foundation problems; whether the home is in a flood zone or has other environmental conditions; whether past work was permitted; commute times to places you choose; and whether the size and layout fit what you need.',
      'A licensed home inspector can look at the condition in person, and may recommend a specialist for anything they can’t judge. I can’t see the home, so I can’t tell you what is wrong with it.',
      'I don’t judge neighborhoods or say who a home suits. I use facts you choose, with their source and date.',
    ].join('\n\n'),
  },
  COSTS: {
    title: 'What buying a home costs',
    body: [
      'Up front: the down payment; closing costs (lender, title, escrow and recording fees, usually a few percent of the price, and they vary); prepaid items such as the first insurance and tax payments; the inspection and appraisal fees; moving; and any repairs or updates you want to do right away.',
      'Ongoing: the loan payment, property tax, homeowners insurance, any HOA fee, utilities, and maintenance and repairs.',
      'For a specific home, add it with the “Homes I’m considering” button and I’ll lay out the purchase price, estimated cash to close and monthly cost from the numbers you enter. They are your estimates, not a lender’s, and anything you leave blank stays “not entered”. Your lender’s Loan Estimate and Closing Disclosure are the official figures.',
    ].join('\n\n'),
  },
  INSPECTION: {
    title: 'What a home inspection is',
    body: [
      'A home inspection is a visual check of a home’s major systems and structure by a licensed inspector, usually during the contract period. You get a written report of what they saw and what they recommend looking at more closely, and they may suggest a specialist for things like the roof, sewer line or foundation.',
      'It is not a guarantee, and it doesn’t tell you whether to buy. After the report, buyers commonly ask the seller for repairs or a credit, accept the home as it is, or, where the contract allows, step back. Your agent or attorney can tell you what your contract allows and by when.',
      'Once you’re under contract, I can help you keep track of the findings and what you decided about each.',
    ].join('\n\n'),
  },
  NEEDS_HOME: {
    title: 'That needs a home you own or are buying',
    body: [
      'You have \u201cLooking to buy\u201d turned on, and no home is selected, so I have no property to look at for that. I don\u2019t guess one.',
      'You can add the homes you\u2019re considering with the \u201cHomes I\u2019m considering\u201d button, ask me to compare them, or ask a general buying question. If you meant a home you already own, select it, or turn off \u201cLooking to buy\u201d next to the box.',
    ].join('\n\n'),
  },
  OFFER_PRICE: {
    title: 'What to offer',
    body: [
      'I can’t tell you what to offer. A sensible price depends on recent comparable sales, the home’s condition, local market conditions and what fits your budget, and I don’t have or invent that market data. Your agent can prepare a comparable-sales analysis.',
      'What I can do is show what a price would mean for you: add the home with the “Homes I’m considering” button, enter a price and your loan assumptions, and I’ll show the estimated cash to close and monthly cost. They are your numbers, not a lender’s.',
    ].join('\n\n'),
  },
};

/** The whole result: one authored block, no tool, no clarification, no capture, no confirmation and no suggested-action row. */
export function buyerGuidanceResult(kind: BuyerGuidanceKind): AskOperationResult {
  if (kind === 'INTRO') return buyerIntroResult();
  const reply = GUIDANCE[kind];
  return {
    status: 'ANSWERED',
    reasonCode: 'ASK_BUYER_GUIDANCE',
    blocks: [{ type: 'SUMMARY', id: `buyer-guidance-${kind.toLowerCase().replace(/_/g, '-')}`, title: reply.title, body: reply.body, tone: 'DEFAULT', actions: [] } as AskPresentationBlock],
    captureRequests: [],
    clarification: null,
    confirmation: null,
    suggestions: [],
    suggestedNextActions: [],
    suggestedNextActionsGoverned: true,
    suppressSkillHandoff: true,
  };
}
