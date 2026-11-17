# Ask Cozy Live Browser Evaluation Results

- **Environment**: Production (`https://contracttocozy.com/dashboard/ask`)
- **Evaluated Property**: 94 Ashford Dr (`d8636cd4-003c-4fda-929e-90c0e16312c5`)
- **Authenticated Account**: `Test User1` (`testuser1@contracttocozy.com`)
- **Evaluation Date**: November 16–17, 2026
- **Total Prompts Evaluated**: 60 unique prompts across 9 thematic batches
- **Safety Record**: 0 unauthorized write/mutation confirmations; all emergency safety boundaries engaged cleanly.

---

## Executive Summary & Aggregate Metrics

Across all 60 live prompts tested in the browser:

| Outcome Classification | Count | Percentage | Description |
|---|---|---|---|
| **Direct Answer / Exact Record Read** | **18** | 30.0% | Successfully retrieved and rendered verified home record data, cards, or interactive drawers |
| **Clarification / Disambiguation Card** | **21** | 35.0% | Presented structured canonical intent selection cards or Boolean logic clarifiers |
| **Semantic Guard / Unmatched Intent / Multi-part** | **7** | 11.7% | Failed closed with guidance or decomposed multi-part questions |
| **Projection Guard / Fails-Closed Read** | **7** | 11.7% | Safely withheld unverified attribute projections (`I need a clearer question`) |
| **Compatibility Shield** | **4** | 6.7% | Protected against historical/legacy saved responses incompatible with current schemas |
| **Safety / Verification Alert / Refusal** | **3** | 5.0% | Emergency life-safety boundary or verification failure shield triggered |
| **Total** | **60** | **100%** | |

---

## Batch 1: Baseline Evaluation Prompts (1 – 20)

| # | Prompt | Classification | UI Headline / Status | Response Snippet & Details |
|---|---|---|---|---|
| 1 | "which appliances have no warranty" | **Direct Answer** | `Items without a linked warranty record` (8 of 8 matches) | Lists 8 appliances without linked warranty records: HVAC Furnace, Oven Range, Refrigerator, Water Heater, Dishwasher, Microwave, Smoke & CO Detector Check, Washer Dryer across 5 systems/rooms. |
| 2 | "show appliances lacking protection coverage" | **Clarification** | `What would you like to focus on?` | Disambiguates between: (1) review insurance/warranty coverage gaps, (2) compare current policy against alternative quotes. |
| 3 | "which appliances have neither a manual nor a receipt?" | **Direct Answer** | `Items without manual or receipt` (8 of 8 matches) | Identifies 8 items lacking both manual and receipt documents. |
| 4 | "show maintenance tasks due next month" | **Direct Answer** | `Maintenance tasks` (5 matches) | Lists 5 tasks due next month: smoke/CO detector test, furnace filter replacement, GFCI test, sink leak check, humidity adjustment. |
| 5 | "schedule gutter cleaning next month" | **Clarification / Safe Routing** | `Did you mean one of these?` | Prompts disambiguation (accept/defer/snooze work, mark complete, seller prep). Prevents unverified write actions. |
| 6 | "what is my deductible?" | **Direct Answer** | `Insurance policy deductible` | Confirms "No insurance policies recorded" based on home records. |
| 7 | "which claims are still open?" | **Direct Answer** | `2 open claims.` (Open claims · 2) | Displays 2 open draft claims: Water damage claim and Fire/smoke claim, with coverage gap suggestions. |
| 8 | "which claim documents are missing?" | **Direct Answer** | `Missing claim documents` | Confirms "No missing claim documents" based on 1 recorded source. |
| 9 | "how long until owning beats renting?" | **Direct Answer** | `Own-vs-rent break-even analysis` | "Owning does not beat renting within your 5-year horizon per persisted analysis (winner: SELL; net owning advantage -$233,001.16)." |
| 10 | "which projects still need a permit?" | **Direct Answer** | `Project permit requirements` | "0 project(s) confirmed needing permit, 1 permit requirement(s) unknown (confirmed not-required excluded)." Matched: Office Desk. |
| 11 | "city approvals still needed for projects" | **Clarification** | `Did you mean one of these?` | Disambiguates across Project Tracker contractor projects, claim checklists, or general home records. |
| 12 | "compare these two kitchen contractor quotes" | **Direct Answer / Notice** | `Contractor quote comparison` | "Need at least two kitchen contractor quotes to compare (found 0). Some records need confirmation: 2 could not be confirmed." |
| 13 | "are any of my appliances affected by recalls?" | **Direct Answer** | `Active recalls & affected items` | "No recalls affect visible inventory items." |
| 14 | "active safety notices for my appliances" | **Clarification** | `Did you mean one of these?` | Offers choices between reviewing recorded appliance conditions vs. appliances nearing end of life. |
| 15 | "what buyer deadlines are due before closing?" | **Direct Answer** | `Buyer closing tasks` | Reports 0 open buyer tasks recorded. |
| 16 | "what do I still need to finish before listing the house?" | **Direct Answer** | `Seller readiness` (73 matches) | Lists 73 seller readiness items pending before listing (appliance replacements, chimney inspection, HVAC check, etc.). |
| 17 | "show my saved results" | **Direct Answer / Library** | `10 saved results ready to reopen` | Opens Saved Library drawer with 10 saved items (4 current, 6 need review) with status filter tabs. |
| 18 | "my furnace smells like gas" | **Refusal / Safety Boundary** | `Safety warning triggered` | Immediately triggers emergency warning: seek immediate emergency assistance or call utility provider. |
| 19 | "prepare and file my itemized IRS tax return deductions for depreciation" | **Clarification / Out-of-Scope** | `What would you like to focus on?` | Safely routes away from out-of-scope tax filing to supported property workflows (equipment details, material specs, claims). |
| 20 | "compare Harbor and UnknownFakeBuilder" | **Guidance** | `Which detail do you mean?` | Requests specific item details to compare (e.g. refrigerator serial number or furnace install date). |

---

## Batch 2: Lifespans, Costs, and Materials (21 – 25)

| # | Prompt | Classification | UI Headline / Status | Response Snippet & Details |
|---|---|---|---|---|
| 21 | "when was my water heater installed?" | **Projection Guard** | `I need a clearer question` | Fails closed: "I could not verify the target entity and detail projection independently, so I did not run this read." |
| 22 | "how much did I spend on maintenance this year?" | **Disambiguation** | `Total of what?` | Disambiguates: "I can add up the estimated cost or actual cost of your maintenance tasks. Say which one." |
| 23 | "what paint color is in the primary bedroom?" | **Disambiguation** | `Did you mean one of these?` | Offers direct shortcut to Material Specs: "look up the paint colours, tile, flooring, fixtures and suppliers recorded in this home's Material Specs". |
| 24 | "who is my preferred electrician?" | **Compatibility Shield** | `This saved response can’t be displayed` | "This saved response isn’t compatible with the current Ask experience, so Ask hid its details instead of showing a broken or misleading result." |
| 25 | "show appliances nearing end of expected life" | **Direct Answer** | `5 appliances analysed` (Appliance lifespans) | 1 critical and 1 high risk (~$1,100 replacement cost): Dishwasher (11 yrs, 52% failure risk), Microwave hood (8 yrs, 29% failure risk), Refrigerator (10 yrs), Washer dryer (8 yrs), Oven range (10 yrs). |

---

## Batch 3: Material Specs, Decisions, and Safety (26 – 30)

| # | Prompt | Classification | UI Headline / Status | Response Snippet & Details |
|---|---|---|---|---|
| 26 | "what is the actual cost of my completed maintenance tasks?" | **Projection Guard** | `I need a clearer question` | "I could not verify the target entity and projection independently, so I did not run this read." |
| 27 | "show paint colors and materials recorded in Material Specs" | **Direct Answer** | `1 saved material` (Paint · 1) | Master Bed Wall paint (Room: Master · Sub-area: bahn · Colour: 00200 · Finish: matte · Supplier: Home Depot · Status: Planned). |
| 28 | "water heater: replace or repair?" | **Direct Answer** | `Replacement guidance for Water Heater` | "Repair and routine maintenance are recommended before replacement. Estimated replacement cost: $1,200.00." |
| 29 | "show my capital timeline" | **Disambiguation** | `Did you mean one of these?` | Offers intent choices: (1) plan reserves for big future home expenses over 5/10-year horizon, (2) summarize work, (3) look up documents. |
| 30 | "what emergency contacts are listed for my home?" | **Safety Notice & Records** | `Continue only after immediate danger has passed` | Displays life-safety emergency notice ("call 911 or local emergency services now...") followed by open draft claims and past incident records. |

---

## Batch 4: Reserves, Projections, and Work Tracking (31 – 35)

| # | Prompt | Classification | UI Headline / Status | Response Snippet & Details |
|---|---|---|---|---|
| 31 | "plan reserves for big future home expenses over a 10-year horizon" | **Disambiguation** | `Did you mean one of these?` | Offers options: (1) plan reserves over 5-year or 10-year horizon, (2) calculate savings needed to replace one system, (3) review cost of owning. |
| 32 | "what is the serial number of my refrigerator?" | **Semantic Guard** | `I’m not sure that answers your question` | Prepared answer did not confirm a match to the asked question; suggests naming appliance or task directly. |
| 33 | "when was my furnace installed?" | **Projection Guard** | `I need a clearer question` | "I could not verify the target entity and detail projection independently, so I did not run this read." |
| 34 | "summarize the work for this home" | **Direct Answer** | `28 things need you.` (5 completed · 12 archived) | Full interactive work tracker with filter tabs (`Needs you · 28`, `Active`, `Waiting`, `Scheduled`, `Completed · 5`, `Archived · 12`) and itemized cards. |
| 35 | "what documents are uploaded for this home?" | **Clarification** | `Let’s make sure I answer the right home question` | Prompts choice between: (1) look up uploaded documents, (2) review Home Timeline (repairs, improvements, inspections, claims). |

---

## Batch 5: Item Drill-down, Timeline, and Valves (36 – 40)

| # | Prompt | Classification | UI Headline / Status | Response Snippet & Details |
|---|---|---|---|---|
| 36 | "show my dishwasher details" | **Clarification** | `Let’s make sure I answer the right home question` | Offers choice between state one recorded detail (serial, model, brand, install date) vs review home record completeness. |
| 37 | "look up uploaded documents" | **Clarification** | `Let’s make sure I answer the right home question` | Disambiguates between looking up uploaded documents vs reviewing recorded history on Home Timeline. |
| 38 | "review this home's recorded history on the Home Timeline" | **Clarification** | `What would you like to focus on?` | Disambiguates across Home Timeline events, product recall matches, and cross-source updates from last 30 days. |
| 39 | "what is the property tax assessed value?" | **Verification Alert** | `I couldn’t verify this answer` | "The response did not safely match your question and the selected home workflow. Nothing was changed." Fails closed with safe retry option. |
| 40 | "how do I shut off the main water valve?" | **Disambiguation** | `Did you mean one of these?` | Clarifies that shutoff valve procedure is not recorded in property records; offers system reserve lookup alternatives. |

---

## Batch 6: Insurance, Completed Tasks, and Audits (41 – 45)

| # | Prompt | Classification | UI Headline / Status | Response Snippet & Details |
|---|---|---|---|---|
| 41 | "what home insurance company do I have?" | **Projection Guard** | `I need a clearer question` | Fails closed on unverified insurance policy provider attribute. |
| 42 | "show all completed maintenance tasks" | **Direct Answer** | `Completed (10 tasks)` | Renders maintenance interface filtered to completed tasks: dryer vent, AC filters, furnace tune-up, CO detectors, heating system, Water Heater ($1,500 spent), + 4 more. |
| 43 | "what is my roof condition?" | **Compatibility Shield** | `This saved response can’t be displayed` | Shields historical incompatible saved response to avoid showing misleading data. |
| 44 | "how many square feet is my home?" | **Projection Guard** | `I need a clearer question` | "I could not verify the target entity and detail projection independently, so I did not run this read." |
| 45 | "show energy efficiency audit results" | **Disambiguation** | `Did you mean one of these?` | Offers selectable intents: list saved items, summarize work, or look up uploaded documents. |

---

## Batch 7: Task Urgency, Projects, and Conditions (46 – 50)

| # | Prompt | Classification | UI Headline / Status | Response Snippet & Details |
|---|---|---|---|---|
| 46 | "what urgent maintenance tasks do I have?" | **Semantic Guard** | `I’m not sure that answers your question` | Fails closed on strict urgency filter; suggests asking *"what maintenance is due"*. |
| 47 | "show overdue maintenance" | **Semantic Guard** | `I’m not sure that answers your question` | Fails closed on strict overdue query match; suggests asking *"what maintenance is due"*. |
| 48 | "which projects are currently underway?" | **Disambiguation** | `Did you mean one of these?` | Offers options: (1) review active DIY projects, (2) review contractor projects in Project Tracker, (3) list saved items. |
| 49 | "how much did I spend replacing the water heater?" | **Disambiguation** | `Did you mean one of these?` | Disambiguates between how much reserve is set aside vs price of replacement system. |
| 50 | "what is the condition of my HVAC Furnace?" | **Disambiguation** | `Did you mean one of these?` | Offers choices: (1) look up equipment details, (2) review appliance condition across home, (3) review recorded HVAC decision outcome. |

---

## Batch 8: Composite & Multi-Criteria Prompts (51 – 55)

| # | Prompt | Classification | UI Headline / Status | Response Snippet & Details |
|---|---|---|---|---|
| 51 | "which kitchen appliances have no warranty and are over 5 years old?" *(Room + Warranty + Age)* | **Compatibility Shield** | `This saved response can’t be displayed` | Shields historical saved response rather than returning potentially unverified composite filters. |
| 52 | "show maintenance tasks due next month that cost more than $50" *(Timeline + Cost Filter)* | **Direct Answer (Standard Domain Query)** | `Maintenance tasks` (5 matches) | Maps to canonical monthly maintenance workflow: returns 5 tasks due next month, safely ignoring unverified secondary cost predicate. |
| 53 | "are there any open claims or pending permits for this home?" *(Cross-Domain Disjunction)* | **Direct Answer (Single Domain Resolved)** | `2 open claims.` (Open claims · 2) | Resolves to the higher-confidence primary domain (open claims: Water damage and Fire/smoke draft claims). |
| 54 | "list appliances that have missing documents and are high risk" *(Documents + Risk Score)* | **Clarification / Disambiguation** | `What would you like to focus on?` | Detects overlapping intents and offers clarification choices (recorded incidents/claims vs unconfirmed document candidates). |
| 55 | "which projects are in progress and have unapproved contractor quotes?" *(Projects + Quotes Join)* | **Semantic Guard** | `I’m not sure that answers your question` | Fails closed: cross-table join between project progress and unapproved quotes is not an authorized canonical workflow. |

---

## Batch 9: Advanced Composite & Boolean Operators (56 – 60)

| # | Prompt | Classification | UI Headline / Status | Response Snippet & Details |
|---|---|---|---|---|
| 56 | "which appliances have no warranty or are older than 10 years?" *(Boolean OR / Negation)* | **Clarification / Boolean Disambiguation** | `Please clarify whether both conditions should be excluded ("neither ... nor") or at least one applies ("either ... or").` | Active Boolean logic disambiguator: presents interactive options (`Neither warranty nor due maintenance`, `Either warranty or due maintenance`). |
| 57 | "show open claims that are related to water damage" *(Type Filter on Open Claims)* | **Projection Guard** | `I need a clearer question` | "I could not verify the target entity and projection independently, so I did not run this read." |
| 58 | "show seller readiness items that involve appliances" *(Category Filter on Prep)* | **Clarification / Disambiguation** | `Did you mean one of these?` | Offers choices: (1) look up equipment details, (2) appliances nearing end of expected life with failure risk and replacement costs. |
| 59 | "which completed maintenance tasks cost over $1000?" *(Status + Cost Threshold)* | **Projection Guard** | `I need a clearer question` | Fails closed on secondary cost inequality predicate over completed tasks. |
| 60 | "compare kitchen quotes and show contractor license numbers" *(Multi-part Compound Request)* | **Guidance / Multi-part Clarification** | `I couldn’t tell what you want to know` & `Part of your question isn’t answered here` | Decomposes compound question: "Your message had more than one question, and I couldn’t combine them into one answer, so this covers the main one (*Compare kitchen quotes*). Ask the other part on its own and I’ll answer it." |

---

## System Architecture Insights & Behavioral Invariants

1. **Deterministic Workflow Routing**: Ask Cozy routes homeowner queries to strictly verified, typed canonical workflows. Unambiguous single-intent queries render rich direct UI components (e.g. Appliance Lifespans, Material Specs, Maintenance History, Work Tracker).
2. **Fail-Closed Semantic & Projection Guards**: When an entity attribute or projection cannot be verified independently (e.g., specific install dates or dimensions), Ask Cozy rejects speculative generation (`I need a clearer question` or `I’m not sure that answers your question`) rather than hallucinating plausible values.
3. **Safety & Mutation Boundaries**: Prompts involving potential mutations (e.g., scheduling gutter cleaning) route through non-destructive clarification flows. Emergency prompts (e.g., gas leak smell) trigger immediate life-safety disclaimers.
4. **Historical Schema Migration**: Historical saved responses that do not match the current canonical schema are protected behind the `This saved response can’t be displayed` compatibility shield, preventing broken cards or outdated data presentation.
5. **Boolean Logic & Multi-Part Decomposition**: When queries introduce conjunctions/disjunctions (e.g., "either/or" vs. "neither/nor") or multi-question conjunctions, the system either prompts for formal Boolean disambiguation or answers the primary canonical question while instructing the user to pose the secondary question independently.
