# Ask Cozy — Primary Interface Product Redesign

**Status:** Proposed product direction grounded in repository evidence

**Date:** September 26, 2026

**Scope:** Product design, conversational UX, orchestration, migration, and retirement criteria

**Decision intent:** Make Ask Cozy the primary operating surface for homeownership without making an LLM the product, calculator, policy engine, authorization layer, or system of record.

## 0. Evidence legend and authority

- **VERIFIED PRODUCT EVIDENCE** — directly supported by current product documents, contracts, schemas, services, or the mechanically checked Ask operation registry.
- **RECOMMENDED DESIGN DECISION** — the proposed target experience in this redesign.
- **ASSUMPTION REQUIRING VALIDATION** — plausible, but not established by the repository.
- **OPEN PRODUCT QUESTION** — a material decision that requires explicit product, domain, legal, security, or operational approval.

Primary evidence:

- `AI_HOME_CONCIERGE_ASK_REDO_FRD.md`
- `ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md`
- `ASK_COZY_MESSAGE_FIRST_FRD.md`
- `ASK_COZY_INLINE_WORKSPACE_FRD.md`
- `ASK_COZY_INTERACTION_MODEL_UI_FRD.md`
- `ASK_COZY_PHASE0_COVERAGE_AUDIT.md`
- `HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md`
- `ContractToCozy_Product_Framework.md`
- current Ask registries, orchestrator, capability handlers, confirmation handlers, trust policy, Property Context, and domain services

**VERIFIED PRODUCT EVIDENCE:** The Phase 0 coverage audit mechanically classifies 77 registered Ask operations, including 32 read results, 30 confirmed mutations, four proactive insights, three workflow continuations, three boundary responses, two navigation handoffs, one proposal, one internal capture, and one conversational continuation. The audit is static evidence, not production runtime certification.

## 1. Product-design thesis

**RECOMMENDED DESIGN DECISION:** Ask Cozy becomes the homeownership operating layer: a calm, property-aware workspace that opens with the current state of the home, accepts natural and multimodal input, invokes authoritative product capabilities, and leaves behind durable results and work.

It is not a chat destination. It is the shortest path from homeowner intent to a trusted outcome:

`Notice → Ask or act → Resolve context → Retrieve or calculate → Review → Confirm → Persist → Revisit`

The product promise is:

> See what matters, understand why, and move the work forward—using your home’s actual record.

Five design commitments follow:

1. **State before greeting.** The first screen communicates attention, change, and continuity before it invites an open-ended question.
2. **Outcome before module.** Homeowners ask about problems and goals; Ask selects capabilities without exposing internal product structure.
3. **Structured authority, conversational control.** Facts, calculations, rules, authorization, and writes remain deterministic. Conversation is the control layer.
4. **Every result is an object.** Important answers become addressable, refreshable, correctable, and reusable artifacts—not disposable transcript prose.
5. **No dead-end handoffs.** A workflow is not retired from the traditional UI until Ask supports discovery, completion, persistence, revisit, correction, recovery, authorization, confirmation, and accessibility.

**VERIFIED PRODUCT EVIDENCE:** Current target architecture already defines Ask as an orchestrator over canonical owners, with deterministic routing and calculations, typed blocks, durable executions, evidence/freshness, confirmation receipts, role checks, and model-optional operation.

## 2. Ask Cozy information architecture

### 2.1 Minimum persistent navigation

**RECOMMENDED DESIGN DECISION:** Use five persistent destinations, not a feature menu.

| Destination | Purpose | Default content |
| --- | --- | --- |
| **Home** | Launch and triage | Briefing, attention, changes, active work, suggestions, composer |
| **Work** | Continue and monitor | Active resolutions, projects, monitors, pending confirmations, paused tasks |
| **Record** | Browse authoritative property history | Property summary, systems, inventory, documents, timeline, coverage |
| **Saved** | Revisit durable outputs | Reports, comparisons, plans, checklists, annotated images, decision threads |
| **History** | Find prior interactions | Searchable conversations and execution history, scoped by property |

Persistent utilities:

- property switcher;
- global search / command palette;
- notification inbox;
- profile, household access, privacy, and settings.

Mobile uses a bottom bar for **Home**, **Work**, **Saved**, and **Record**, with History inside search. Desktop uses a compact rail. The composer remains available on Home and within an active workspace; it does not float over every screen.

### 2.2 Discovery model

Capabilities are discovered in this order:

1. direct natural-language or voice intent;
2. state-ranked suggestions;
3. contextual actions on results;
4. search across records, work, artifacts, and capabilities;
5. a lightweight capability directory for browsing;
6. notifications and deep links carrying property, entity, and execution context.

The capability directory is grouped by homeowner outcomes—**Maintain**, **Protect**, **Save**, **Improve**, **Buy**, **Sell or move**, and **Understand my home**—not implementation modules.

## 3. Launch-page specification

### 3.1 Shared anatomy

Above the fold contains, in order:

1. compact property identity and switcher;
2. a stateful headline, never a long generated greeting;
3. up to three ranked attention/continuity cards;
4. the multimodal composer;
5. two to four deterministic suggested actions.

Below the fold contains recent changes, active work, recent artifacts, and lower-priority recommendations. Full health dashboards, long activity feeds, marketing modules, raw scores, and broad feature grids remain hidden until requested.

### 3.2 Launch states

| State | Above the fold | Conditional/default content | Ask Cozy voice | Composer placeholder | Hidden until requested |
| --- | --- | --- | --- | --- | --- |
| First-time, limited data | Address/identity, setup progress, one high-value next step, composer | Known public/property facts; one missing-context prompt; upload/photo hint | “I found the basics. Add one thing you care about, or ask about this home.” | “Ask about this home, upload a report, or take a photo” | Empty scores, generic alerts, feature catalog, long onboarding |
| New homeowner | Move-in priorities, deadlines, coverage/document gaps | Closing/inspection tasks, utilities, safety, first-season maintenance | “Here are the first things worth handling.” | “What should I do first in this home?” | Long-range optimization and speculative savings |
| Established homeowner | Home briefing, change since last visit, top risk, active work | Health trend, upcoming maintenance, coverage and savings only when material | Usually silent; one sentence if state changed materially | “Ask what changed, compare options, or update your home” | Stable record detail and resolved history |
| Returning with active work | Resume card first, next blocker, latest update | Pending confirmation, project status, uploaded estimate/report | “Your roof repair is waiting on one decision.” | “Continue this work or ask something else” | Unrelated recommendations |
| Urgent issue | Safety-first alert, immediate action, affected property/entity | Emergency boundary, provider/claim/repair continuation when safe | Direct and imperative; no pleasantries | “Describe what happened or add a photo” | Savings, seasonal content, low-priority work |
| Notification arrival | Deep-linked alert/result, why it appeared, primary action | Source event, freshness, alternatives, snooze/dismiss | “This changed since your last review.” | “Ask about this alert” | General home briefing until alert is handled or dismissed |
| Multiple properties | Portfolio attention summary, selected property, switcher | Cross-property counts only when supported; otherwise explicit single-property scope | “Two homes need attention; choose one to continue.” | “Ask across my properties or choose a home” | Blended facts that obscure property provenance |

**OPEN PRODUCT QUESTION:** Multi-property aggregation is deferred in current Ask implementation. Portfolio summaries require approved cross-property authorization, aggregation, ranking, and performance contracts before the final row can be fully enabled.

### 3.3 Desktop text wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Ask Cozy       18 Maple Ave ▾                       Search      Alerts   Me   │
├───────────────┬──────────────────────────────────────────────────────────────┤
│ Home          │ Good morning                                             │
│ Work     2    │ Two things need attention; one changed since Tuesday.       │
│ Record        │                                                              │
│ Saved         │ ┌ Urgent ─ Water-leak follow-up ──────────────── Continue ┐ │
│ History       │ │ Plumber estimate added · coverage not yet checked        │ │
│               │ └───────────────────────────────────────────────────────────┘ │
│               │ ┌ Due soon ─ HVAC maintenance ─────────────── Mark / Move ┐ │
│               │ └───────────────────────────────────────────────────────────┘ │
│               │                                                              │
│               │ ┌ Ask about your home…                                 🎙︎ │ │
│               │ │ Attach document  ·  Add photo  ·  Use camera          📎 │ │
│               │ └───────────────────────────────────────────────────────────┘ │
│               │ [Check water-damage coverage] [Compare the two estimates]   │
│               │ [Show what changed]                                         │
│               │                                                              │
│               │ Active work                    Recent artifacts               │
│               │ Roof repair · waiting          Spring home briefing           │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

### 3.4 Mobile text wireframe

```text
┌──────────────────────────────┐
│ 18 Maple Ave ▾        Alerts │
│ Two things need attention    │
│                              │
│ URGENT                       │
│ Water-leak follow-up         │
│ Estimate added               │
│ [Continue]                   │
│                              │
│ DUE SOON                     │
│ HVAC maintenance             │
│ [Review]                     │
│                              │
│ Ask about your home…     🎙︎ │
│ [Photo] [Camera] [Document]  │
│                              │
│ Check water-damage coverage  │
│ Compare the two estimates    │
├──────────────────────────────┤
│ Home   Work   Saved   Record │
└──────────────────────────────┘
```

On mobile, the composer expands to a full-screen capture sheet. Camera is first-class. Cards show one primary action; secondary actions move into an accessible action sheet.

## 4. Default-content visibility matrix

| Element | Classification | Trigger / rationale | Priority |
| --- | --- | --- | --- |
| Greeting | CONDITIONALLY VISIBLE | Brief, time-appropriate, suppressed when urgent work exists | P2 |
| Active property | ALWAYS VISIBLE | Prevents wrong-home actions and grounds every result | P0 |
| Property switcher | CONDITIONALLY VISIBLE | Always discoverable; prominent for 2+ accessible properties | P0 |
| Home briefing | ALWAYS VISIBLE | Compact synthesis of attention, change, and continuity; may be empty-state copy | P0 |
| Urgent risks | CONDITIONALLY VISIBLE | Verified active, unsuppressed risk; always outranks other content | P0 |
| Recent changes | CONDITIONALLY VISIBLE | Material canonical change since last meaningful visit | P1 |
| Home health summary | USER-CONFIGURABLE | Useful orientation but must not dominate or imply false precision | P1 |
| Coverage status | CONDITIONALLY VISIBLE | Gap, expiration, claim context, or explicit user preference | P1 |
| Active resolutions | CONDITIONALLY VISIBLE | Open incident, claim, repair, or resolution | P0 |
| Upcoming maintenance | CONDITIONALLY VISIBLE | Due within domain threshold or overdue | P0 |
| Upcoming deadlines | CONDITIONALLY VISIBLE | Verified date and unfinished required action | P0 |
| Seasonal recommendations | CONDITIONALLY VISIBLE | Region/season/property applicable and not recently dismissed | P1 |
| Weather preparation | CONDITIONALLY VISIBLE | Authoritative weather trigger plus property applicability | P0/P1 by severity |
| Savings opportunities | CONDITIONALLY VISIBLE | Deterministically eligible, meaningful value, fresh inputs | P1 |
| Recent reports | USER-CONFIGURABLE | Revisit convenience; not inherently urgent | P2 |
| Unfinished conversations | CONDITIONALLY VISIBLE | Only if they contain durable pending work or explicit save | P1 |
| Recent activity | HIDDEN UNTIL REQUESTED | Low signal on launch; available in History/Record | P2 |
| Persistent artifacts | CONDITIONALLY VISIBLE | Recent, pinned, or related to active work | P1 |
| Suggested actions | ALWAYS VISIBLE | State-ranked, limited to 2–4, never generic | P0 |
| Upload hints | CONDITIONALLY VISIBLE | Missing document context, new user, or document-capable intent | P1 |
| Voice and camera affordances | ALWAYS VISIBLE | Core input modes; labels adapt to device capabilities | P0 |

**SHOULD NOT APPEAR:** engagement streaks, generic inspiration, undifferentiated feature tiles, promotional provider placements disguised as recommendations, auto-playing education, and an unbounded “Ask me anything” prompt.

## 5. Contextual suggestion framework

### 5.1 Ranking contract

Eligibility is deterministic. Natural-language phrasing may be generated, but the model cannot create eligibility or priority.

Score candidates using:

`urgency × impact × confidence × readiness × continuity × freshness − repetition − burden − conflict`

Hard gates precede scoring: property access, source health, capability registration, safety policy, role, suppression/cooldown, required data state, and mutually exclusive active workflows.

Maximum visible suggestions: four on desktop, three on mobile. At most one “needs info” suggestion appears above the fold unless the user is onboarding.

### 5.2 Suggestion examples

| Label | Intent | Deterministic eligibility | Priority / expiry | Selection result |
| --- | --- | --- | --- | --- |
| Add your closing date to unlock move-in deadlines | Capture property fact | owner/new buyer; closing date unknown | P1; expires when known | Inline capture |
| Upload your inspection report | Inspection review | no parsed inspection; ownership <120 days | P1; replaced after upload | Document upload |
| Identify this appliance from a photo | Inventory capture | camera available; incomplete inventory | P2; dismiss cooldown | Camera workflow |
| Add the age of your roof | Improve risk context | roof age missing and risk/capital capability needs it | P1; expires when known | Conversational capture |
| Show my first 30-day priorities | New-owner briefing | closing within 30 days or owner tenure <30 days | P0; expires day 31 | Answer + checklist |
| Build my move-in checklist | Buyer/new-owner plan | buyer lifecycle or recent purchase | P1; expires after plan completion | Persistent checklist |
| Prepare my home for freezing temperatures | Weather preparation | freeze trigger + applicable property + unsuppressed | P0; expires after event | Checklist + alerts |
| Secure outdoor items before high winds | Weather preparation | wind threshold + exposed-property applicability | P0; event expiry | Checklist |
| Show the three issues needing attention first | Attention triage | 2+ active canonical actions | P0; refreshes with feed | Prioritized list |
| Explain why my home health changed | Score explanation | material score delta with traceable inputs | P1; expires after later baseline | Explanation + evidence |
| Review this water-risk alert | Risk review | active radar/incident item | P0; expires on resolution | Alert detail |
| Turn this risk into a repair plan | Planning | actionable unresolved finding | P1; expires when plan exists | Persistent plan |
| Check whether my policy covers water damage | Coverage lookup | policy available or upload path available | P0 during incident, else P1 | Coverage answer/review |
| Add my policy document | Coverage extraction | policy absent/stale and user can contribute | P1; expires on validated policy | Upload + candidate review |
| Review coverage expiring soon | Coverage deadline | verified expiration within threshold | P0/P1 | Coverage workspace |
| Continue the roof repair | Active work | open repair/project with next step | P0; until resolved | Resume workspace |
| Record that the repair is complete | Confirmed mutation | active repair/task; contributor+ | P1; until status changes | Confirmation panel |
| Compare the estimates I uploaded | Quote comparison | 2+ comparable confirmed estimates | P1; invalidated on document change | Comparison table |
| Add another estimate | Quote collection | active project with <2 estimates | P1; project expiry | Upload workflow |
| Review the lowest-cost estimate’s exclusions | Quote review | estimates parsed; exclusions available | P1; refresh on changes | Focused comparison |
| What changed after the new inspection? | Change review | newly promoted inspection facts/events | P1; expires after review | Change summary |
| Review extracted details before saving | Candidate validation | unconfirmed document/photo candidates | P0; until accepted/rejected | Candidate review |
| Update my property record with this change | Fact/event capture | inferred candidate exists; contributor+ | P1 | Confirmation panel |
| File the property-tax deadline in my plan | Deadline action | supported jurisdiction; verified deadline | P1; expires after deadline | Confirmed task |
| Show deadlines in the next 60 days | Deadline query | at least one dated item | P1; rolling expiry | Timeline |
| Finish the task you paused yesterday | Resume work | resumable non-expired execution | P0; execution expiry | Resume same execution |
| Review my pending confirmations | Pending work | 1+ authorized pending confirmations | P0 | Status board |
| Check whether refinancing is worth a look | Refinance analysis | mortgage context sufficient or capturable; fresh rates | P1; expires on rate/context change | Analysis |
| Show verified savings opportunities | Savings review | registered opportunities with source/confidence | P1; refresh on source change | Prioritized cards |
| Compare repair versus replacement | Repair/replace | resolved asset + required lifecycle/cost context | P1 | Comparison + decision trace |
| Build a reserve plan for the next five years | Capital planning | property selected; capital data available/capturable | P1 | Timeline + plan artifact |
| Two homes need attention—compare them | Portfolio triage | 2+ properties and approved aggregation support | P0; refresh on feed | Portfolio list |
| Switch to the property with the open claim | Property navigation | exactly one accessible matching property | P0 during claim | Switch + resume |
| Show maintenance across all my homes | Portfolio maintenance | multi-property authorization and aggregation enabled | P1 | Cross-property table |
| Revisit my spring home briefing | Artifact revisit | saved briefing exists | P2; replaced by newer report | Saved report |

## 6. Feature-by-feature conversational redesign

The mechanically maintained 77-operation registry remains the exhaustive engineering catalog. This matrix redesigns the homeowner intents rather than duplicating internal operation IDs. Source abbreviations: LHR = Living Home Record; PC = Property Context; domain services are authoritative.

| Feature / intent | User goal | Internal context / source of truth | Best input | Inference and follow-up | Deterministic logic / LLM role | Workflow and output | Confirmation / correction / persistence | Launch exposure | Current problem → redesign | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Attention / triage | Know what matters now | Canonical Home Actions, incidents, deadlines, radar-promoted items | Text/voice/tap | Resolve property; ask only if ambiguous | Ranked aggregation; LLM: EXPLANATION optional | Prioritized issue list | No confirm; actions persist in owners; correct source item | Always/conditional items | Fragmented feeds → one canonical briefing | P0 |
| Attention / filter | See urgent, costly, or near-term items | Current result set | Follow-up | Infer filter only | Deterministic filtering; LLM: INTENT INTERPRETATION | Updated list preserving identity | No confirm; view state persists | Result action | Filters must not reroute into writes | P0 |
| Property summary | Understand the home | LHR + PC snapshot | Text/voice | No inference beyond scope | Canonical projection; LLM: SUMMARIZATION optional | Property summary | Correct facts inline; saved snapshot/report optional | Default compact | Avoid dashboard dump; answer current question | P0 |
| Change review | Know what changed | PropertyChange/timeline/events | Text/tap | Resolve comparison period | Deterministic diff; LLM: EXPLANATION | Change cards/timeline | Source corrections through canonical owner | Conditional | Make deltas addressable | P1 |
| Maintenance status | See due/completed work | Maintenance tasks | Text/voice | Resolve time/category if needed | Deterministic query; LLM: NONE | Grouped checklist | No confirm; persistent source task | Conditional | Existing reference implementation, elevate to Home | P0 |
| Maintenance create | Add a task naturally | PC + maintenance service | Text/voice/photo | Extract candidate fields; ask one blocking detail | Rules + validation; LLM: UNSTRUCTURED EXTRACTION | Editable proposal → task | Confirm; edit/archive/reopen; persistent task | Contextual | Replace forms with proposal review | P0 |
| Maintenance update/complete | Move work forward | Existing task and role | Text/tap | Resolve exact task; never guess among many | Domain command; LLM: INTENT INTERPRETATION | Confirmation + receipt | Confirm; reopen/edit; audit event | Active work | Preserve same result and reconcile after write | P0 |
| Inspection report review | Turn report into usable findings | Document, extraction candidates, inspection domain | Document + follow-up | Extract candidates; ask about ambiguous pages/items | Extraction + domain validation; LLM: UNSTRUCTURED EXTRACTION/SUMMARIZATION | Document preview + findings + annotated pages | Confirm promotions; reject/edit candidates; saved report | New-owner/contextual | Upload must end in validated record and plan | P0 |
| Damage diagnosis | Understand visible damage safely | Photo, property/system context, safety policy | Camera/image | Image interpretation; ask symptoms/location if material | Safety rules first; LLM: IMAGE INTERPRETATION/RECOMMENDATION SUPPORT | Annotated image + next-step cards | Confirm any task/provider/claim action; save media/result with consent | Urgent/contextual | Never present image guess as diagnosis | P1 |
| Home health review | Understand condition and trajectory | Authoritative score service + inputs | Text/tap | None | Score is deterministic; LLM: EXPLANATION only | Summary + issue list + trend | Correct inputs; persist report version | Conditional/configurable | Separate score from explanation | P1 |
| Score change explanation | Know why a score moved | Score calculation trace + change events | Text/follow-up | Resolve which score/date | Deterministic delta attribution; LLM: EXPLANATION | Decision trace | Correct source facts; save explanation reference | Contextual after delta | No model-generated causes | P1 |
| Urgent repair resolution | Get from incident to safe completion | Incident, coverage, providers, tasks/projects | Voice/photo/text | Resolve severity/entity | Safety/business rules; LLM: IMAGE INTERPRETATION/EXPLANATION | Status board + checklist | Confirm calls/messages/bookings/writes; audit trail | Urgent | One continuous workspace, not route hopping | P0 |
| Quote comparison | Compare providers fairly | Confirmed estimate documents + provider data | Documents/text | Map line items; ask about unmatched scopes | Deterministic normalization; LLM: UNSTRUCTURED EXTRACTION/SUMMARIZATION | Comparison table | Confirm extracted lines before authoritative use; saved comparison | Active project | Make exclusions, scope, and provenance explicit | P0 |
| Provider selection | Choose and continue | Comparison + verified provider attributes | Follow-up/tap | Infer selected row only when explicit | Deterministic selection and constraints; LLM: EXPLANATION | Provider card + action confirmation | Confirm outreach/booking; persist decision | Active work | No hidden paid ranking | P1 |
| Coverage understanding | Know current protection | Policies, warranties, inventory, coverage service | Text/voice | Resolve peril/item/policy | Deterministic coverage query; LLM: EXPLANATION | Coverage cards/table | Correct policy facts; save review artifact | Conditional | Distinguish covered, unknown, excluded | P0 |
| Policy analysis | Extract and validate policy details | Sensitive document + canonical policy owner | Document | Extract candidates, citations, confidence | Validation rules; LLM: UNSTRUCTURED EXTRACTION/SUMMARIZATION | Document preview + candidate table | Explicit confirm; reject/edit; retention controls | Contextual | Candidate data never becomes fact silently | P0 |
| Coverage gap resolution | Decide next step | Coverage result + inventory/risk | Text/follow-up | Ask desired outcome if multiple | Rules; LLM: RECOMMENDATION SUPPORT | Gap card + options | Confirm monitor/task/provider actions | Conditional | Avoid insurance advice beyond boundary | P1 |
| Inventory lookup | Find owned items | Canonical inventory | Text/voice | Resolve entity from names/location | Deterministic lookup; LLM: INTENT INTERPRETATION | Cards/table | Correct item record; persistent inventory | Hidden until asked unless relevant | No re-entry of known items | P0 |
| Inventory capture | Build inventory with less work | Photos/files + existing inventory | Camera/images/files | Identify candidate item/serial/model | Validation/dedup; LLM: IMAGE INTERPRETATION/EXTRACTION | Candidate gallery | Batch confirm/edit; persistent items/evidence | Contextual | Progressive batches, not giant form | P1 |
| Warranty/document lookup | Find proof and dates | Documents/warranties | Text/voice | Resolve item/document | Deterministic search; LLM: NONE/SUMMARIZATION | Document cards/preview | Correct metadata; source remains document owner | Conditional on deadline | Addressable document results | P1 |
| Refinance analysis | Decide whether to investigate | Financing owner + governed benchmarks | Text/voice | Capture only missing required mortgage facts | Domain calculator; LLM: EXPLANATION | Metrics + scenarios + decision trace | Confirm monitor, not analysis; persist artifact | Conditional savings | Facts vs benchmarks visibly separated | P0 |
| Refinance monitor | Watch a threshold | Current analysis + notification consent | Text/follow-up | Extract threshold candidate | Rules + monitor service; LLM: INTENT INTERPRETATION | Monitor card | Explicit confirmation/consent; pause/edit/stop | Work | Durable continuation from notification | P1 |
| Ownership cost | Understand true cost | Financial/property services | Text/voice | Resolve period/scenario | Deterministic aggregation; LLM: EXPLANATION | Table/trend/report | Scenario inputs editable; save artifact | Hidden unless relevant | No invented expense assumptions | P1 |
| Savings review | Find grounded opportunities | Registered opportunity sources | Text/tap | None | Deterministic eligibility/value; LLM: SUMMARIZATION | Prioritized cards | Confirm any resulting action; dismiss feedback | Conditional | Show value, source, confidence, expiry | P1 |
| Repair vs replace | Compare options | Asset lifecycle + costs + domain service | Text/photo | Resolve item; capture age/cost if blocking | Domain calculator; LLM: EXPLANATION | Comparison + recommendation card | Scenario edits; persist decision artifact | Contextual | Model cannot choose authoritative outcome | P0 |
| Reserve/capital plan | Plan major expenses | Capital timeline + reserve fund services | Text/voice | Capture planning horizon/preferences | Deterministic projections; LLM: EXPLANATION | Timeline + plan | Confirm saved plan/task writes; versioned artifact | Established owners | Conversational what-if controls | P1 |
| Property tax readiness | Understand deadlines/evidence | Reviewed jurisdiction rules + canonical tax facts | Text/document | Resolve jurisdiction/appeal stage | Rules/calculation; LLM: SUMMARIZATION | Checklist + timeline | Confirm tasks/reminders; correct evidence | Conditional | Uncovered jurisdictions return unavailable honestly | P1 |
| Weather preparation | Prepare for event | Weather source + property applicability | Notification/text | None unless property ambiguous | Threshold rules; LLM: SUMMARIZATION optional | Event checklist | Confirm task/monitor; dismiss/snooze | Conditional urgent | Event expiry and suppression mandatory | P0 |
| Home Event Radar | Understand external risk | Radar/incident canonical pipeline | Notification/text | Resolve event/entity | Domain scoring; LLM: EXPLANATION | Alert card + map/timeline | Confirm downstream work; persist incident | Conditional | Integrate with canonical attention | P0 |
| Project tracking | Know status/blockers | Project Tracker, tasks, documents, providers | Text/voice | Resolve project | Deterministic status; LLM: SUMMARIZATION | Status board/timeline | Confirm updates; edit/reopen; persistent project | Active work | Make blocker and next owner explicit | P0 |
| Renovation/permit readiness | Know blockers and requirements | Permit/renovation services, reviewed sources | Text/document | Resolve project/jurisdiction | Rules; LLM: SUMMARIZATION | Checklist/timeline | Confirm tasks only; persistent case | Contextual | Hold overlapping engines until ownership resolved | P1 |
| Claims assistance | Organize a claim safely | Incident, coverage, evidence, claim service | Text/voice/photo/docs | Extract event/evidence; ask material missing facts | Domain rules; LLM: EXTRACTION/SUMMARIZATION | Claim workspace | Confirm submissions/outreach; audit and sensitive retention | Urgent/active | App assists; does not determine coverage or outcome | P0 |
| Buyer plan | Track purchase readiness | Buyer plan, deadlines, documents, tasks | Text/voice/docs | Resolve lifecycle phase | Deterministic plan rules; LLM: SUMMARIZATION | Status board/checklist | Confirm updates/dispositions; persistent plan | Buyer state | One conversational workspace across 18 registered ops | P0 |
| Sell/hold/rent | Compare a major decision | Domain scenarios + verified property/financial facts | Text/voice | Capture scenario assumptions separately | Deterministic analysis; LLM: EXPLANATION | Comparison/report | Save versioned decision thread; no transaction | Goal/contextual | Attach related work to durable decision thread | P0 |
| Seller preparation | Turn intent into a plan | Decision thread + seller prep service | Text/voice/docs | Infer goal candidate; confirm intent | Rules; LLM: INTENT INTERPRETATION | Checklist/timeline | Confirm plan creation/actions; persistent thread | When selling goal active | Discover without knowing feature exists | P1 |
| Household access | Add/manage collaborator | Household authorization service | Text/voice | Extract person/role proposal | Authorization and role rules; LLM: EXTRACTION | Confirmation panel | Owner confirmation; revoke/change in Record/settings | Hidden until asked | Never expose protected household details | P0 |
| Capability discovery | Learn what Cozy can do | Registered capability catalog/readiness | Text/search | Interpret outcome, not module | Deterministic registry filtering; LLM: INTENT INTERPRETATION | Capability cards | No confirm until action; recent discovery in history | Suggestions/search | Never recommend unavailable/unregistered capability | P0 |
| General guidance | Get bounded home advice | Governed knowledge + property context | Text/voice | Clarify only material ambiguity | Retrieval first; LLM: RECOMMENDATION SUPPORT/EXPLANATION | Concise answer + sources | No write unless converted to proposal | Hidden until asked | Preserve boundary and source distinction | P1 |

## 7. Response and artifact system

Every primitive has five shared states: skeleton/working, partial with known omissions, empty with a productive next step, success with source/freshness, and error with retry/recovery. All are keyboard navigable, screen-reader labeled, contrast compliant, zoom safe, and free of color-only meaning.

| Primitive | Use and hierarchy | Actions / conversational commands | Persistence, expanded state, mobile |
| --- | --- | --- | --- |
| Insight card | One material observation: conclusion → why → source/date | Explain, compare, save, dismiss, correct | Usually ephemeral unless saved/linked; expands evidence; full-width mobile |
| Alert card | Urgent risk: severity → immediate action → why now | Show steps, snooze, dismiss, start plan | Persists through resolution/expiry; prominent but non-blocking unless safety-critical |
| Property summary | Identity → key facts → missing/conflicted → recent change | Explain, correct, show history | Refreshable snapshot; stacked sections on mobile |
| Prioritized issue list | Rank → impact/urgency → owner/status | Filter, sort, group, turn into plan | Saved view optional; preserves result identity and filters |
| Comparison table | Comparable dimensions → differences → exclusions → sources | Sort, hide rows, compare selected, explain delta | Versioned artifact; cards-by-option on narrow mobile |
| Recommendation card | Recommendation → evidence → alternatives → limitations | Why, what-if, reject, save, act | Versioned decision artifact for material cases |
| Provider card | Verified facts → fit → availability → commercial disclosure | Compare, choose, contact, report issue | Selection stored only on confirmation; stacked mobile |
| Checklist | Ordered actions → status → due date → evidence | Complete, reschedule, assign, add evidence | Canonical tasks/project; thumb-friendly mobile |
| Timeline | Dated events → upcoming → uncertainty | Change range, show only deadlines, add event | Versioned query or persistent plan; horizontal scroll avoided on mobile |
| Report | Executive summary → findings → evidence → actions | Ask about section, filter, export, share | Immutable version plus refresh action; table of contents mobile |
| Status board | Goal → phase → blockers → next owner → progress | Continue, update, pause, resolve | Durable workspace; single-column mobile |
| Document preview | Page → highlighted source → extracted candidate | Jump to citation, accept/edit/reject, ask about page | Sensitive retention policy; bottom-sheet candidate review mobile |
| Annotated image | Original → numbered regions → interpretation/confidence | Focus region, correct label, create task | Original and annotations preserved with consent; pinch/zoom mobile |
| Confirmation panel | Proposed change → effects → source → role → confirm/cancel | Edit, confirm, cancel, explain impact | Durable pending execution; full-screen mobile for consequential action |
| Progress indicator | Current stage → completed stages → next dependency | Cancel, notify me, continue later | Durable for long work; compact live region, no noisy announcements |
| Persistent workspace | Goal → active result → supporting artifacts → activity | Resume, branch, compare, close, archive | Durable, searchable, property scoped, responsive shell |

## 8. Multimodal input behavior

### 8.1 Composer

The composer supports text, push-to-talk voice, image picker, camera, document/file picker, paste, and follow-up references. It always displays the active property and, when applicable, the referenced artifact/entity.

### 8.2 Input pipeline

1. Preserve the original input.
2. Run safety, file, malware, privacy, and size checks.
3. Resolve property/entity from launch context and explicit references.
4. Classify the request and identify authoritative capability candidates.
5. Retrieve known context before asking anything.
6. For unstructured media, produce candidate observations with citations/confidence.
7. Validate candidates against domain schemas and existing records.
8. Present only material ambiguity or candidate corrections.
9. Require confirmation before canonical write or consequential action.

Voice transcripts remain editable before a material action. Images and documents show retention and sharing controls at upload. Camera capture offers guidance such as “include the full label” only when the selected intent benefits from it.

## 9. Request-orchestration architecture

### 9.1 Canonical lifecycle

```text
Natural/multimodal input
  → deterministic safety and scope policy
  → intent + property + entity resolution
  → operation requirement contract
  → canonical context retrieval
  → domain read/calculation/rule service
  → optional bounded model extraction/explanation
  → schema, business-rule, source, freshness, and authorization validation
  → confirmation when required
  → canonical command / artifact persistence
  → typed presentation blocks
  → durable execution, evidence, and next actions
```

### 9.2 Epistemic labels

| Type | Owner | UI treatment |
| --- | --- | --- |
| Authoritative fact | Canonical domain record | “From your record,” source/date, correction action |
| Calculated result | Versioned deterministic service | Formula/inputs/version available |
| Business-rule decision | Domain policy engine | Rule/source/effective date; no model attribution |
| Extracted candidate | Unstructured extraction | “Suggested from page/photo,” confidence, accept/edit/reject |
| Model interpretation | Bounded model output | Clearly labeled interpretation with uncertainty |
| Model explanation | Narrative over authoritative result | Underlying result remains visible and controlling |
| User-confirmed action | Authenticated command receipt | Actor, time, change, undo/recovery, artifact link |

### 9.3 LLM-unavailable behavior

- Registered queries, calculations, filters, commands, confirmations, monitors, search, and artifacts continue.
- Exact and known-phrase routing continues.
- Typed templates explain results without generated prose.
- Unstructured extraction and ambiguous-language interpretation show a transparent temporary limitation and offer manual review, retry, or a small structured choice.
- No pending draft or execution is lost.
- The system never substitutes guessed facts for unavailable model output.

## 10. End-to-end journeys

### 10.1 First-time onboarding

- **Input:** Address from signup; optional “I just bought this home.”
- **Retrieved:** Accessible property, enrichment facts, missing/conflicted PC requirements.
- **Interpretation/processing:** Resolve new-owner state; deterministic first-value ranking; no model required unless parsing free text.
- **Follow-up:** One high-value question or inspection-report upload, never a long form.
- **Output/actions:** Known-home summary, first 30-day checklist, upload/camera choices.
- **Confirmation/completion:** Each extracted fact is reviewed; canonical writes confirmed.
- **Persistence/revisit:** LHR, checklist, and onboarding progress appear in Home/Work.

### 10.2 “What needs my attention?”

- **Input:** Text/voice or launch suggestion.
- **Retrieved:** Home Actions, incidents, deadlines, maintenance, active work, source health.
- **Processing:** Canonical aggregation, deduplication, urgency/impact ranking.
- **LLM:** Optional explanation only.
- **Output:** Top three issues plus “show all”; filters for urgent, cost, deadline.
- **Actions:** Explain, snooze, start plan, complete, correct.
- **Persistence/revisit:** Source records persist; view available in Home and Work.

### 10.3 Uploading an inspection report

- **Input:** PDF/photo set.
- **Retrieved:** Property, existing systems/items/findings, document policy.
- **Processing:** File checks; extraction with page citations; dedupe; domain validation.
- **Follow-up:** Only ambiguous property match or material candidate.
- **Output:** Preview, prioritized findings, candidate updates, repair-plan option.
- **Confirmation:** Accept/edit/reject each candidate or reviewed batch.
- **Persistence/revisit:** Original document, validated facts/events, report artifact, linked plan.

### 10.4 Diagnosing damage from an image

- **Input:** Camera/photo plus optional description.
- **Retrieved:** Location/system history, current incidents, safety rules.
- **Processing:** Emergency cues first; image interpretation as non-authoritative candidate.
- **Follow-up:** Location, timing, active leak/odor/power only if material.
- **Output:** Annotated image, uncertainty, safe immediate steps, repair/claim options.
- **Confirmation:** Any provider outreach, claim step, task, or saved fact.
- **Persistence/revisit:** Media and assessment only with consent; linked incident/workspace.

### 10.5 Reviewing property health

- **Input:** “How is my home doing?”
- **Retrieved:** Authoritative score, category inputs, freshness and conflicts.
- **Processing:** Deterministic score and trend.
- **LLM:** Explanation only.
- **Output:** Summary, top drivers, trend, missing-data limitations.
- **Actions:** Explain category, correct fact, create plan.
- **Persistence/revisit:** Versioned health report.

### 10.6 Understanding a score change

- **Input:** “Why did this change?”
- **Retrieved:** Prior/current calculation traces and PropertyChange events.
- **Processing:** Exact delta attribution.
- **Output:** Driver waterfall/decision trace and dated evidence.
- **Actions:** Exclude corrected input, compare period, show urgent effects.
- **Persistence/revisit:** Linked explanation on current report; source corrections recalculate.

### 10.7 Resolving an urgent repair

- **Input:** Alert, text, voice, or image.
- **Retrieved:** Incident, safety policy, coverage, available evidence, providers, tasks.
- **Processing:** Safety triage; deterministic next-step eligibility.
- **Output:** Immediate checklist and resolution board.
- **Actions:** Shutoff guidance, document damage, coverage check, compare estimates, track repair.
- **Confirmation:** External contact, booking, claim, status change, and record writes.
- **Persistence/revisit:** Incident-centered workspace until resolution; audit history afterward.

### 10.8 Comparing provider estimates

- **Input:** Two or more documents.
- **Retrieved:** Active project, provider records, prior estimates.
- **Processing:** Extract candidate scope/price/exclusions; user validation; normalize comparable items.
- **Output:** Comparison table with unmatched lines and source citations.
- **Actions:** Sort by cost, compare first two, show exclusions, choose provider.
- **Confirmation:** Validate extraction and confirm outreach/selection.
- **Persistence/revisit:** Versioned comparison artifact linked to project.

### 10.9 Reviewing insurance coverage

- **Input:** “Am I covered for water damage?” or policy upload.
- **Retrieved:** Canonical policies, property/item, incident, document citations.
- **Processing:** Deterministic coverage query; extraction only for uploaded unstructured policy.
- **Output:** Covered/unknown/excluded distinction, limits/deductibles where authoritative, questions for insurer.
- **Confirmation:** Policy candidate promotion, monitor/task creation; never a coverage determination by model.
- **Persistence/revisit:** Coverage report and policy record.

### 10.10 Building home inventory

- **Input:** Room photos, receipts, files, voice.
- **Retrieved:** Existing inventory and rooms.
- **Processing:** Candidate identification, OCR, duplicate detection, confidence.
- **Follow-up:** Only low-confidence material fields.
- **Output:** Candidate gallery grouped by room with batch review.
- **Confirmation:** Accept/edit/reject; provenance retained.
- **Persistence/revisit:** Canonical inventory; progress in Work.

### 10.11 Preparing for severe weather

- **Input:** Proactive alert or request.
- **Retrieved:** Authoritative forecast/event, property systems, open vulnerabilities, supplies/tasks.
- **Processing:** Threshold and applicability rules.
- **Output:** Time-ordered checklist with “before/during/after.”
- **Actions:** Complete, assign, snooze, add task, ask why.
- **Confirmation:** New tasks/notifications only.
- **Persistence/revisit:** Event workspace expires into timeline after event.

### 10.12 Tracking an active project

- **Input:** “Where are we on the roof project?”
- **Retrieved:** Project, tasks, estimates, provider, permits, evidence.
- **Processing:** Deterministic status and blockers.
- **Output:** Status board, timeline, next owner, outstanding decision.
- **Actions:** Update date/status, upload evidence, compare estimates, pause/complete.
- **Confirmation:** Every mutation.
- **Persistence/revisit:** Durable project workspace in Work.

### 10.13 Revisiting a previous report

- **Input:** Search, History, Saved, or “show my spring report.”
- **Retrieved:** Property-scoped artifact index and access.
- **Processing:** Exact/semantic retrieval with property and type filters.
- **Output:** Original version with freshness banner and “refresh” action.
- **Actions:** Ask about section, compare with current, duplicate as plan.
- **Persistence/revisit:** Immutable original; refresh creates a new linked version.

### 10.14 Managing multiple properties

- **Input:** “Which home needs attention?”
- **Retrieved:** Authorized property list and approved portfolio projections.
- **Processing:** Cross-property ranking without mixing facts.
- **Output:** Property-by-property attention table; explicit property on every row.
- **Actions:** Filter, switch, compare, open work.
- **Confirmation:** Actions recheck access in selected property.
- **Persistence/revisit:** Portfolio view preferences; domain records remain property scoped.
- **Validation need:** Cross-property aggregation is not yet an approved current capability.

### 10.15 Correcting an Ask Cozy inference

- **Input:** “That is the dishwasher, not the refrigerator,” or Edit.
- **Retrieved:** Original media/document, candidate, canonical record, execution receipt.
- **Processing:** Keep original and corrected values; validate replacement; recompute dependents.
- **Output:** Before/after confirmation and affected-result list.
- **Confirmation:** Required before canonical correction.
- **Persistence/revisit:** Audit event, corrected evidence, stale dependent artifacts marked for refresh.

## 11. Proactive-experience model

Proactive delivery exists to prevent harm or missed value, not to create engagement. Every item answers “why now?” and supports mute, snooze, dismiss, and preference control.

| Experience | Trigger / source | Urgency and message | Default / alternatives | Suppression, expiry, explanation |
| --- | --- | --- | --- | --- |
| Risk | New/material domain incident or radar decision | Severity-derived; “A new risk may affect…” | Review safety steps | Dedup by event/property; expire on resolution/event |
| Deadline | Verified date within threshold and incomplete action | P0/P1 by consequence | Open checklist | Suppress completed; cadence tightens near deadline |
| Status change | Material project/claim/repair state change | Informational unless blocked | Continue workspace | One per state transition; expire when superseded |
| Severe weather | Authoritative threshold + applicable home context | Safety first | Start event checklist | Event-key dedup; geographic/time expiry |
| Coverage gap | Deterministically uncovered/unknown material item | “We could not verify…” | Review gap/source | No repeated unknown warning without new evidence |
| Maintenance need | Due/overdue rule | “Due in 14 days…” | Review/complete/reschedule | Task-key cadence; stop on completion |
| Savings | Registered fresh opportunity above materiality floor | “A verified opportunity may…” | Review calculation | Cooldown after dismiss; expire with rates/offer/source |
| Provider update | Active chosen provider/project status only | “Your provider updated…” | Open project | No marketplace marketing; transition-only |
| Document expiration | Verified document/policy/warranty date | “Expires in…” | Review/replace/remind | Stop on replacement; configurable lead time |
| Project delay | Expected milestone missed and unresolved | “This milestone is late…” | Review blocker | One reminder per delay state; suppress acknowledged |
| New property info | New source-backed fact conflicts with or adds material data | “New information is ready to review” | Compare/accept/correct | Never auto-promote conflict; expire after disposition |

## 12. Trust and action-safety patterns

1. **Provenance drawer:** Every factual result exposes source, observed date, scope, and freshness.
2. **Fact/estimate separation:** Exact, estimated, scenario, extracted, and generated values use distinct labels and visual tokens.
3. **Uncertainty that changes behavior:** Confidence is shown when it affects decisions; low confidence produces review or limited results, not decorative percentages.
4. **Candidate review:** Extracted values retain page/image citation, original text/region, confidence, and accept/edit/reject controls.
5. **Incomplete-data honesty:** Unknown is not zero; stale is not current; conflict is not silently resolved.
6. **Action preview:** Consequential panels state what will happen, where data will go, who can see it, and whether it can be undone.
7. **Fresh authorization:** Property access and role are rechecked at execution, not trusted from the initial turn.
8. **Sensitive document boundary:** Minimize model payloads, redact unnecessary identifiers, define retention/deletion, isolate prompt injection, and never expose documents across properties.
9. **Idempotent execution:** One confirmation receipt per execution; safe retry reconciles results instead of duplicating writes.
10. **Recovery:** Retry, edit, cancel, reopen, archive, or compensating action based on domain capability; no false universal Undo.
11. **Audit history:** Actor, timestamp, original proposal, confirmed change, source execution, and resulting artifact.
12. **Human-provider interactions:** Separate recommendation from commercial ranking; disclose sponsorship; require confirmation before transmitting information or contacting a provider.
13. **Professional boundaries:** The system supports decisions but does not impersonate an insurer, engineer, lawyer, tax professional, lender, emergency service, or contractor.

## 13. One-to-two-year migration roadmap

### Phase 0 — 0–3 months: launch foundation

- Establish Home launch anatomy, property scoping, briefing projection, suggestion policy, and design tokens.
- Certify shared artifact primitives, evidence/freshness, responsive behavior, and accessibility.
- Consolidate existing Ask entry points into the Home/Work/Saved/Record shell.
- Keep traditional navigation available.

Exit: Home is useful without a prompt; deterministic Ask and pending work survive model outage and refresh.

### Phase 1 — 3–6 months: P0 read and maintenance workflows

- Ship attention, property summary, change review, maintenance status/create/update/complete, history/search, and artifact identity.
- Make maintenance the reference end-to-end conversational workflow.
- Add text, voice, file, image, and camera composer foundations.

Exit: maintenance meets the full retirement checklist; attention is canonical across surfaces.

### Phase 2 — 6–9 months: records, documents, coverage, and urgent work

- Ship inspection review, document promotion, inventory capture/lookup, coverage review, urgent incident/repair workspace, and quote comparison.
- Add candidate extraction review, annotated images, document citations, and sensitive-content controls.
- Extend notification-to-Ask continuity.

Exit: validated document/photo data can safely enter canonical owners; urgent workflows do not dead-end into legacy pages.

### Phase 3 — 9–12 months: decisions and active work

- Ship refinance, repair/replace, ownership costs, reserve planning, property tax readiness, project tracking, and decision threads.
- Standardize comparison, report, timeline, and status-board artifacts.
- Add robust conversational manipulation and versioned refresh.

Exit: highest-value decision workflows are complete and revisitable in Ask.

### Phase 4 — 12–18 months: buyer, seller, claims, and proactive intelligence

- Complete buyer-plan journeys, sell/hold/rent, seller preparation, claims assistance, provider actions, and household collaboration.
- Standardize event-driven proactive experiences and preference controls.
- Introduce approved multi-property portfolio projections.

Exit: major-moment workflows can be discovered without feature knowledge and remain durable across sessions.

### Phase 5 — 18–24 months: traditional UI retirement

- Measure per-workflow parity using the checklist below.
- Retire navigation entries one workflow at a time; preserve Record/audit/bulk structured surfaces where they remain the superior interaction.
- Remove duplicate business logic and legacy-only adapters after data and link migration.
- Keep deep links resolving to the equivalent Ask workspace/artifact.

Exit: the traditional dashboard is no longer the product home; remaining structured surfaces are intentional parts of Ask’s Record/Work system, not a parallel product.

## 14. Traditional UI retirement checklist

A workflow can retire only when all answers are yes:

- Discoverable by natural language, state suggestion, search, or capability directory.
- Completes the full job without route knowledge.
- Uses the canonical service and source of truth.
- Persists result/work with stable identity.
- Reopens from Home, Work, Saved, History, search, notification, and deep link as applicable.
- Supports correction of source facts and extracted candidates.
- Supports safe retry, cancel, failure explanation, and domain-appropriate recovery.
- Rechecks property access and role for every action.
- Confirms all consequential writes/transmissions.
- Exposes source, freshness, assumptions, and limitations.
- Works without an LLM for deterministic portions.
- Meets mobile, keyboard, screen-reader, zoom, contrast, and announcement requirements.
- Has analytics from discovery through verified outcome.
- Has support/audit visibility and an operational runbook.
- Has no legacy-only data field, action, or history view required for completion.
- Deep links, bookmarks, and notification links have a mapped successor.

## 15. Product success metrics

### North-star metric

**Trusted home outcomes completed through Ask Cozy per active property per month**, where an outcome requires a canonical completion signal—not a message, click, or session.

### Supporting metrics

| Dimension | Metrics |
| --- | --- |
| Time to value | Time to first meaningful state; time to answer; time to completed outcome |
| Discovery | Intent success without menu use; suggestion acceptance; capability discovery-to-start |
| Completion | Workflow completion; abandonment by state; resume success; confirmation completion |
| Quality | Deterministic answer accuracy; routing accuracy; extraction precision/recall; correction rate |
| Trust | Evidence opens, helpfulness, source corrections, stale-result incidents, professional-boundary failures |
| Safety | Unauthorized attempts blocked; unconfirmed writes; duplicate actions; cross-property leakage; critical safety failures |
| Continuity | Revisit rate, artifact reuse, active-work completion, notification-to-resolution |
| Data value | Confirmed new facts/events, duplicate reduction, context completeness, downstream recomputation success |
| Efficiency | Deterministic containment, LLM calls/outcome, token cost/outcome, p95 latency, failure/retry rate |
| Migration | Workflow parity coverage, legacy route dependence, Ask-only successful completion, legacy page retirement readiness |
| Proactivity | Actionable notification rate, dismiss/mute rate, harm-prevention completion, frequency complaints |

Do not optimize raw messages, session length, daily streaks, or notification opens.

## 16. Risks, assumptions, and unresolved decisions

### 16.1 Verified risks

- The current operation catalog is broad, but static coverage is not equivalent to browser/database production certification.
- Cross-domain reconciliation after a mutation is opt-in and incomplete outside selected workflows.
- Some item-action interaction types remain unsupported.
- Multi-property portfolio aggregation is deferred.
- Model optimization lacks a completed production benchmark/TCO decision.
- Certain capability ownership overlaps, including renovation/permit paths, require resolution.
- Proactive systems are not yet uniformly connected to one Ask continuation rail.

### 16.2 Assumptions requiring validation

- Homeowners will understand the five-destination IA better than current feature navigation.
- A maximum of three attention cards and four suggestions balances relevance and calm.
- Users will trust camera/document extraction when original evidence and correction are adjacent.
- “Saved” and “History” are meaningfully distinct in research; they may need consolidation.
- Portfolio users want cross-home triage on launch rather than a single remembered property.
- Voice is most valuable for capture and urgent work, not long report review.

### 16.3 Open product questions

1. Is Ask history global, property scoped, or a global index with property-scoped content?
2. Which result types save automatically, and which require “Save”?
3. What is the approved initial multi-property aggregation contract?
4. Which proactive categories may use push, email, or SMS, and at what urgency?
5. Which provider actions may transmit homeowner data, and what disclosure/consent is required?
6. What retention classes apply to voice, photos, inspection reports, policies, and claim evidence?
7. When is a refreshed artifact a new version versus an update to the same artifact?
8. Which traditional structured surfaces remain permanently as Record/audit/bulk-management views?
9. What domain sign-off is required before each material recommendation or workflow can retire its legacy path?
10. Should the customer-facing name remain “Ask Cozy,” and how is “Cozy” introduced without implying autonomous AI authority?

## 17. Recommended immediate decisions

1. Approve the five-destination information architecture for usability testing.
2. Approve Home’s above-the-fold hierarchy: property, state headline, up to three attention/continuity cards, composer, and state-ranked suggestions.
3. Make maintenance the retirement-grade reference workflow and inspection upload the multimodal reference workflow.
4. Adopt the shared artifact identity and versioning contract before adding more presentation variants.
5. Approve the deterministic suggestion policy and prohibit model-created eligibility.
6. Resolve history scope, auto-save rules, multi-property scope, and sensitive-media retention before detailed implementation.

## 18. Evidence needed before implementation approval

- Usability tests for first-time, established, urgent, returning-active-work, and multi-property launch states.
- Production-like validation of the 77-operation catalog’s browser, database, accessibility, and reconciliation behavior.
- A canonical source map for launch briefing inputs and priority conflicts.
- Domain-owner sign-off on urgency, materiality, expiry, and suppression rules.
- Security/privacy review for multimodal storage and model payload minimization.
- Provider/commercial-integrity policy for recommendations and data transmission.
- Multi-property authorization and aggregation design.
- Artifact retention/versioning/search contract.
- Notification-channel governance and consent model.
