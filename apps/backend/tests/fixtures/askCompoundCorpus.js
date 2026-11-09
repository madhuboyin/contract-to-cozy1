// Compound, cross-tool prompts (docs/architecture/ASK_COZY_COMPOUND_CROSS_TOOL_PROMPTS_AUDIT.md, step 1). Unlike tests/fixtures/askRoutingCorpus.js, which has
// one expected operation per phrasing, each row here says which operations' DATA a correct answer needs.
//
//   prompt  the homeowner's words
//   needs   every operation whose data the answer must draw on (the clauses of the question)
//   full    operations that can answer the whole question by themselves today; empty when only a composition of `needs` could
//
// Outcomes (scripts/ask-compound-sweep.js): FULL (routed to an operation in `full`), PARTIAL (routed to an operation in `needs`, so one clause is
// answered and the rest dropped), WRONG (routed elsewhere), CLARIFY, FALLBACK. Rows were written from the question, before looking at where they route.
module.exports = [
  // ---- capital / saving for a named item ----
  { prompt: 'In case if i want to replace my roof in 5 years how much capital do i need and how much additional capital i need to start saving', needs: ['CAPITAL_ITEM_FUNDING_GOAL'], full: ['CAPITAL_ITEM_FUNDING_GOAL'] },
  { prompt: 'My furnace is 14 years old. What should I be putting aside each month to replace it in 3 years?', needs: ['CAPITAL_ITEM_FUNDING_GOAL'], full: ['CAPITAL_ITEM_FUNDING_GOAL'] },
  { prompt: 'How much do I have to save every month if the water heater and roof both need replacing by 2031?', needs: ['CAPITAL_ITEM_FUNDING_GOAL'], full: ['CAPITAL_ITEM_FUNDING_GOAL'] },
  { prompt: 'Am I saving enough to cover a new HVAC in four years?', needs: ['CAPITAL_ITEM_FUNDING_GOAL'], full: ['CAPITAL_ITEM_FUNDING_GOAL'] },
  { prompt: 'Is my reserve fund enough for the big replacements coming over the next 5 years, and how much more per month would close the gap?', needs: ['CAPITAL_ITEM_FUNDING_GOAL', 'CAPITAL_RESERVE_PLAN'], full: ['CAPITAL_ITEM_FUNDING_GOAL', 'CAPITAL_RESERVE_PLAN'] },
  { prompt: 'What will it cost to replace everything that is due in the next 10 years and what should I save per month for it?', needs: ['CAPITAL_RESERVE_PLAN', 'CAPITAL_ITEM_FUNDING_GOAL'], full: ['CAPITAL_RESERVE_PLAN', 'CAPITAL_ITEM_FUNDING_GOAL'] },
  // ---- item age / condition / cost together ----
  { prompt: 'How old is my roof, what condition is it in, and what would a new one cost?', needs: ['INVENTORY_LOOKUP', 'REPLACEMENT_GUIDANCE'], full: [] },
  { prompt: 'Is my water heater covered by warranty, and how much would a replacement cost if it is not?', needs: ['WARRANTY_LOOKUP', 'REPLACEMENT_GUIDANCE'], full: [] },
  { prompt: 'Which of my appliances are out of warranty and likely to fail in the next 2 years?', needs: ['WARRANTY_LOOKUP', 'APPLIANCE_FAILURE_RISK'], full: [] },
  { prompt: 'Should I repair my dishwasher or replace it, and what would that do to my monthly budget?', needs: ['REPLACEMENT_GUIDANCE', 'OWNERSHIP_COSTS'], full: [] },
  { prompt: 'My roof is 18 years old and leaks in one spot. Repair now or replace in 5 years, and what does each cost?', needs: ['REPLACEMENT_GUIDANCE', 'CAPITAL_ITEM_FUNDING_GOAL'], full: [] },
  { prompt: 'Which of my systems are past their expected life and what would replacing them all cost?', needs: ['APPLIANCE_FAILURE_RISK', 'CAPITAL_RESERVE_PLAN'], full: ['APPLIANCE_FAILURE_RISK'] },
  // ---- ownership cost and budget ----
  { prompt: 'How much am I spending on the house each month and how much more should I be setting aside for big repairs?', needs: ['OWNERSHIP_COSTS', 'CAPITAL_RESERVE_PLAN'], full: [] },
  { prompt: 'What is my total cost of ownership next year including maintenance, insurance and property tax?', needs: ['OWNERSHIP_COSTS'], full: ['OWNERSHIP_COSTS'] },
  { prompt: 'How much should I budget for maintenance this year and is that more than I spent last year?', needs: ['MAINTENANCE_BUDGET_FORECAST', 'OWNERSHIP_COSTS'], full: [] },
  { prompt: 'What are the top three things I should spend money on this year and what happens if I skip them?', needs: ['HOME_ACTIONS', 'DO_NOTHING_SIMULATION'], full: [] },
  // ---- money decisions touching the home ----
  { prompt: 'Can I afford to refinance and also replace my roof next year?', needs: ['REFINANCE_ANALYSIS', 'CAPITAL_ITEM_FUNDING_GOAL'], full: [] },
  { prompt: 'How much equity do I have and could I use it to pay for a new roof?', needs: ['FINANCING_OVERVIEW', 'CAPITAL_ITEM_FUNDING_GOAL'], full: [] },
  { prompt: 'If I sell in 5 years which upgrades are worth doing and what will they cost?', needs: ['SELLER_PREP_CHECKLIST', 'HOME_UPGRADE_SCENARIOS'], full: [] },
  { prompt: 'Should I keep this house, sell it or rent it out, and what repairs would I need to fund first?', needs: ['SELL_HOLD_RENT_ANALYSIS', 'CAPITAL_RESERVE_PLAN'], full: [] },
  { prompt: 'Would replacing the roof lower my insurance premium?', needs: ['REPLACEMENT_GUIDANCE', 'COVERAGE_GAPS'], full: [] },
  // ---- protection and coverage with cost ----
  { prompt: 'What is not covered by my insurance or warranties and what could that cost me?', needs: ['COVERAGE_GAPS', 'OWNERSHIP_COSTS'], full: ['COVERAGE_GAPS'] },
  { prompt: 'Are there any recalls on my appliances and are those items still under warranty?', needs: ['RECALL_REVIEW', 'WARRANTY_LOOKUP'], full: [] },
  { prompt: 'Which warranties expire this year and which of those items are old enough to fail?', needs: ['WARRANTY_LOOKUP', 'APPLIANCE_FAILURE_RISK'], full: [] },
  // ---- timing ----
  { prompt: 'Should I replace my furnace now or wait three years, and how much would I save by waiting?', needs: ['HVAC_DECISION_START'], full: ['HVAC_DECISION_START'] },
  { prompt: 'When will my roof probably need replacing and how much should I have set aside by then?', needs: ['CAPITAL_ITEM_FUNDING_GOAL'], full: ['CAPITAL_ITEM_FUNDING_GOAL'] },
  { prompt: 'What big expenses are coming in the next 5 years?', needs: ['CAPITAL_RESERVE_PLAN'], full: ['CAPITAL_RESERVE_PLAN'] },
  // ---- maintenance + cost ----
  { prompt: 'What maintenance is overdue and what will it cost if I put it off another year?', needs: ['MAINTENANCE_STATUS', 'DO_NOTHING_SIMULATION'], full: ['DO_NOTHING_SIMULATION'] },
  { prompt: 'What does it cost me per year to keep the house maintained, and how does that compare to my reserve contributions?', needs: ['MAINTENANCE_BUDGET_FORECAST', 'CAPITAL_RESERVE_PLAN'], full: [] },
  // ---- single-clause controls (must keep their single operation) ----
  { prompt: 'How old is my roof?', needs: ['INVENTORY_LOOKUP'], full: ['INVENTORY_LOOKUP'] },
  { prompt: 'Show my capital plan for major replacements', needs: ['CAPITAL_RESERVE_PLAN'], full: ['CAPITAL_RESERVE_PLAN'] },
  { prompt: 'Should I repair or replace my roof?', needs: ['REPLACEMENT_GUIDANCE'], full: ['REPLACEMENT_GUIDANCE'] },
  { prompt: 'Is my dishwasher still under warranty?', needs: ['WARRANTY_LOOKUP'], full: ['WARRANTY_LOOKUP'] },
];
