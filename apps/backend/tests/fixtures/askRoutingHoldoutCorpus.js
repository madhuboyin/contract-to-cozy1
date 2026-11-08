// Ask routing HELD-OUT corpus (audit Phase 2). Written from each operation's job description BEFORE any miss in askRoutingCorpus.js was inspected for
// Phase 2, and never used to author a pattern or example. Report-only: run `node scripts/ask-routing-sweep.js --corpus=tests/fixtures/askRoutingHoldoutCorpus.js`.
// It is not in the ratchet. A Phase 2 batch counts only if the main sweep AND this corpus improve (or this one holds) together; a main-sweep gain
// with no holdout movement is overfitting. Do not copy prompts from here into patterns, examples, or askRoutingCorpus.js.
module.exports = {
BUYER_CONTRACT_TIMELINE: ['when does my purchase contract say the contingencies end', 'remind me what dates are in our accepted offer', 'what did we agree to in the contract and by when'],
BUYER_TITLE_ESCROW_READINESS: ['is the title search finished for the house we are buying', 'where are we with escrow and the survey', 'anything outstanding with the title company or hoa before we close'],
BUYER_DEADLINES: ['what has to happen before we can close', 'which purchase dates are coming up soon', 'what could hold up closing on the new place'],
BUYER_FINANCING_READINESS: ['has the lender finished underwriting our loan', 'how is the appraisal going on the home we are buying', 'are we clear to close from the mortgage side'],
BUYER_DISCLOSURE_FUNDS_READINESS: ['did anything change on our closing disclosure', 'do i have the cash ready to close', 'how much do i need to wire for closing'],
BUYER_PLAN_STATUS: ['where am i in the home buying plan', 'what is my next step to close on the house', 'how far along is my purchase plan'],
PROJECT_TRACKER_PROJECTS: ['how much have i paid on my contractor jobs so far', 'which remodeling jobs are still going', 'what do i still owe my contractors'],
INSPECTION_FINDING_UPDATE: ['mark the roof flashing finding as fixed', 'dismiss the finding about the attic fan', 'accept the electrical panel issue from the inspection as work'],
INSPECTION_NEGOTIATION_PACKAGE: ['help me ask the seller for credits based on the inspection', 'put together a repair request from the inspection report', 'what should i ask for after the home inspection'],
HOME_TIMELINE_EVENTS: ['what work has been done on this house', 'walk me through everything that has happened to the home', 'show past repairs and upgrades with proof'],
DOCUMENT_LOOKUP: ['find the paperwork i uploaded for the roof', 'do i have a copy of the closing papers saved', 'pull up my uploaded manuals'],
COVERAGE_GAPS: ['what am i not covered for', 'where are the holes in my insurance and warranties', 'which things in my house have no protection'],
};
