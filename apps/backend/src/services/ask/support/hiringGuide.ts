// Ask support: the authored hiring-guide read (exact-four starter source, inventory D-O4; owner decided on October 5, 2026 to build a fourth
// operation so a launched answer is not short). PURE and entirely data-independent: authored, evergreen general guidance for hiring a
// contractor, with no input at all. It reads no recorded home data, makes no external call and gives no legal advice. The CONTENT is a DRAFT for
// product review; it is conservative and does not state requirements that differ by place (licensing, permits and lien rules vary).
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';

/** The stored starter message. */
export const HIRING_GUIDE_MESSAGE = 'What should I ask before hiring a contractor?';

// Ordered by importance, not by the order a project happens in: the first three are the checks that protect the homeowner most (who is
// qualified and insured, what exactly is being bought, and what is agreed in writing); the rest follow. This lead set was approved
// (conversational presentation R3, October 6, 2026). `LEAD_COUNT` is how many show before "Show more".
const LEAD_COUNT = 3;
const ITEMS = [
  { id: 'license-insurance', title: 'Check licensing and insurance', description: 'Ask for proof of any license your area requires and of liability insurance, then confirm them with the issuing office or the insurer.' },
  { id: 'written-estimates', title: 'Get itemized written estimates', description: 'Collect more than one, and compare what is included (scope, materials, timeline), not only the total price.' },
  { id: 'contract-payment', title: 'Put it all in a signed contract', description: 'Write down the scope, schedule, price and how changes are priced. Keep any deposit modest and tie further payments to finished work.' },
  { id: 'references', title: 'Ask for recent references', description: 'Speak to recent customers with similar work, and look at reviews and any complaints on file with your local consumer or licensing office.' },
  { id: 'permits', title: 'Ask who handles permits', description: 'Find out whether the work needs a permit and who pulls it. Be wary of anyone who suggests skipping a required one.' },
  { id: 'warranty-subs', title: 'Ask about warranty and subcontractors', description: 'Ask what is warranted and for how long, and for written confirmation that suppliers and subcontractors are being paid.' },
] as const;

export function buildHiringGuideResult(): AskOperationResult {
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'hiring-guide-boundary', title: 'General guidance',
    body: 'This is general guidance, not legal advice and not an assessment of any contractor. Licensing, permit and payment rules differ by location, so check your local requirements.',
    severity: 'INFO', suggestions: [],
  };
  return {
    status: 'ANSWERED', reasonCode: 'HIRING_GUIDE_READY',
    blocks: [{
      type: 'SUMMARY', id: 'hiring-guide-summary', title: 'Questions to ask before hiring a contractor',
      body: 'Three checks matter most before you hire: licensing and insurance, itemized written estimates, and a signed contract. References, permits and warranty questions come next.', tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'hiring-guide-items', title: 'Before you hire', actions: [], filters: [],
      sections: [{
        id: 'hiring-guide-checklist', title: 'Most important first', count: ITEMS.length, initialVisibleCount: LEAD_COUNT,
        items: ITEMS.map((item, index) => ({ id: item.id, title: item.title, description: item.description, condition: null, meta: [], status: null, href: null, countLabel: String(index + 1) })),
      }],
    }, boundary],
    suggestions: [],
  };
}
