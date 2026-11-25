// BICC-BUY-001: a person who says they want to buy a home, and nothing more specific, gets an authored introduction to what Ask can do for a buyer, with an invitation to start a
// candidate workspace. It needs no property, runs no tool and asks no question; the wording is fixed (no model writes it). Only a message that is WHOLLY a buying-intent phrase
// qualifies: a specific question ("what is left before closing on my house") goes to the ordinary router, so the real request is never swallowed by the introduction.
import type { AskOperationResult } from '../askOperationRegistry';
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';

const normalize = (message: string): string => message.toLowerCase().normalize('NFKC').replace(/[’]/g, "'").replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();

const HOME = '(?:a |my |our |the )?(?:first |new |own )?(?:house|home|property|place|condo|townhouse|townhome)';
const LEAD = "(?:i|we)(?:'m| am|'re| are)?\\s*(?:really |now |just |finally )?";
const PHRASES: readonly RegExp[] = [
  new RegExp(`^${LEAD}(?:want|wanna|would like|need|plan|hope|hoping|ready|looking|thinking|trying|getting ready|about|starting)(?: to| of)?(?: start| begin)?\\s*(?:buy|buying|purchase|purchasing|shop|shopping|house hunting|hunting)(?: for)?(?: ${HOME})?$`),
  new RegExp(`^(?:i'm|i am|we're|we are)\\s*(?:a |an )?(?:first[- ]time|prospective|new|aspiring)\\s*(?:home ?)?(?:buyers?|home ?owners?)$`),
  new RegExp(`^(?:help me|help us|can you help me|can you help us|can you help)(?: to)? (?:buy|purchase|shop for|start buying|start shopping for|find)(?: ${HOME})?$`),
  new RegExp(`^(?:how (?:do|can|should) (?:i|we)|how to|where (?:do|should) (?:i|we)|what is the first step to)\\s*(?:start|begin|get started|go about)?\\s*(?:buying|purchasing|buy|shopping for|to buy)(?: ${HOME})?$`),
  new RegExp(`^(?:first[- ]time (?:home ?)?buyer(?: help| tips| guide| advice)?|home buying help|home buyer help|house hunting help|buying a home|buying my first home|buying a house|house hunting|home shopping)$`),
  /^what can you (?:do|help (?:me )?with) (?:for|if) (?:someone|a person|a buyer|a home ?buyer|someone who is|me as a|me if i am|i am) (?:buying|a buyer|a home ?buyer|shopping|looking)(?: (?:a |for a |for )?(?:home|house|property))?$/,
  /^what can you do for (?:a )?(?:home ?)?buyers?$/,
];

/** True when the WHOLE message is a general wish to buy a home (nothing specific about a home, a number, a document or a date). */
export function isBuyerIntro(message: string): boolean {
  const text = normalize(message);
  if (!text || text.split(' ').length > 14) return false;
  return PHRASES.some((pattern) => pattern.test(text));
}

const BODY = [
  'Happy to help you think it through. You don’t need a home in your account to start.',
  'Use the “Homes I’m considering” button next to the message box to add the homes you’re looking at. Then I can compare them side by side and show what each would cost to buy and own, using the numbers you enter. They’re your numbers, not a lender’s, and a blank stays “not entered”.',
  'I don’t rank or describe homes or neighborhoods by who lives there. I can work from price, monthly cost, size, age and condition, commute times you give me, public services, environmental conditions and documented findings.',
  'When you’re under contract on one, you can move it to your homes and I’ll follow the closing steps with you.',
].join('\n\n');

/** The whole result: one authored block, no tool, no clarification, no capture, no confirmation and no suggested-action row. */
export function buyerIntroResult(): AskOperationResult {
  return {
    status: 'ANSWERED',
    reasonCode: 'ASK_BUYER_INTRO',
    blocks: [{ type: 'SUMMARY', id: 'buyer-intro', title: 'Buying a home', body: BODY, tone: 'DEFAULT', actions: [] } as AskPresentationBlock],
    captureRequests: [],
    clarification: null,
    confirmation: null,
    suggestions: [],
    suggestedNextActions: [],
    suggestedNextActionsGoverned: true,
    suppressSkillHandoff: true,
  };
}
