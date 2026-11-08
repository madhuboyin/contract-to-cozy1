// Ask routing HELD-OUT corpus, slice 2 (audit Phase 2). Written AFTER slice 1 was consumed: Phase 2 patterns for the buyer operations were authored
// after reading slice 1's misses, so slice 1 no longer measures generalization for them. This slice was written before any pattern or example change
// that targets it, and is not to be read for misses until its first scored run. Report-only (not in the ratchet). Never copy prompts into patterns.
module.exports = {
BUYER_CONTRACT_TIMELINE: ['which dates in my sales contract do i have to watch', 'are my contract contingencies still open'],
BUYER_TITLE_ESCROW_READINESS: ['is there a lien or title problem that could stop us closing', 'has the survey come back for our purchase'],
BUYER_DEADLINES: ['what is the next date i need to hit for this purchase', 'anything due this week before we close'],
BUYER_FINANCING_READINESS: ['did the bank approve our mortgage yet', 'what is left on the loan side before closing'],
BUYER_DISCLOSURE_FUNDS_READINESS: ['do my closing numbers still match the lender paperwork', 'is my down payment money lined up for closing'],
BUYER_PLAN_STATUS: ['how is the purchase of this house going', 'what is left on my buyer checklist'],
PROJECT_TRACKER_PROJECTS: ['which of my renovation jobs are done and which are open', 'what is the remaining balance on my contractor agreements'],
INSPECTION_FINDING_UPDATE: ['set the gutter finding to resolved', 'i want to reject the finding about the shed'],
INSPECTION_NEGOTIATION_PACKAGE: ['draft what i should send the seller after our inspection', 'turn the inspection issues into a credit request'],
HOME_TIMELINE_EVENTS: ['what is the track record of repairs on my house', 'show everything done to the property so far'],
DOCUMENT_LOOKUP: ['where is the warranty paperwork i saved', 'list the files attached to my home'],
COVERAGE_GAPS: ['which parts of my home are unprotected', 'am i missing any warranty or insurance on big items'],
};
