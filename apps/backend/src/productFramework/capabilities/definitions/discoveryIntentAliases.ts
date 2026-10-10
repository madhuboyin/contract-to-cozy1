// Approved homeowner intent aliases that Ask discovery relies on (capability discovery plan, Phase 5; Inline Workspace FRD IW-SHELL-020).
// Aliases are canonical capability metadata, so they live in the capability registry and the Ask explorer derives its search wording from
// them; the Ask explorer registry must not restate them. This map is merged into each capability's own `intentAliases` by the definition
// factory, so the same wording also helps Explore Tools search (CAP-FR-033).
//
// Rules: plain lower-case homeowner NOUN PHRASES, not questions (a question such as "what do you know about my home" shares stopwords with generic
// messages and makes the goal matcher mistake "What tools do you have to help me?" for a capability request); one capability per phrase (a phrase
// another capability already owns is not repeated here, for example "budget" and "reserve fund"); no operation identifiers; none for a
// workflow-only capability, which general discovery never offers.
export const ASK_DISCOVERY_INTENT_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // Not "to do list": its token "list" made the goal matcher read "prepare my house to list" as Home Operations instead of Seller Prep.
  'home-operations': ['priorities', 'next steps', 'urgent items'],
  maintenance: ['upkeep', 'overdue tasks', 'tasks due', 'chores', 'upcoming maintenance', 'maintenance forecast', 'new task', 'reminder', 'schedule maintenance', 'filter change'],
  diy: ['do it yourself', 'my projects', 'self repair', 'diy starter projects', 'beginner projects', 'weekend project'],
  'property-brief': ['home overview', 'property summary', 'missing details', 'home profile', 'record completeness'],
  'coverage-intelligence': ['insurance', 'warranty gaps', 'uncovered items', 'coverage gaps'],
  'home-briefing': ['recent changes', 'home updates', 'change summary'],
  'savings-benefits': ['savings', 'rebates', 'cut costs', 'lower costs'],
  'ownership-costs': ['spending', 'expenses'],
  'capital-timeline': ['replacement fund', 'repair savings', 'capital plan', 'future replacements'],
});
