Phase B Route Audit System (Repeatable)
Use this on every CtC route before redesign work:

Evidence Pass (15 minutes/route)
Capture desktop + mobile screen states: default, loading, empty, error, success, long-content.
Log first-view hierarchy: what is visible above the fold and what action is primary.
Record trust markers present/missing: confidence, source, freshness, assumptions, rationale.
Note copy friction: jargon, unclear labels, anxiety-inducing wording.
12-Dimension Scoring Pass
Score each dimension (1–12) from 1–10.
Weight for Overall: Visual 20%, UX 30%, Trust 20%, Mobile 20%, Buyer Readiness 10%.
Hard fail trigger: any of Trust/Mobile/Buyer Readiness < 6.0.
Priority Rules
P0: Core funnel or core homeowner decision route with score < 6.5 or hard fail.
P1: Core value route scoring 6.5–7.2 with clear conversion/trust friction.
P2: Secondary route with moderate debt but not harming core flow.
P3: Admin/utility polish.
Fix Planning Rule
Always split fixes into: quick wins (1 sprint), structural redesign (2–6 sprints), shared-system investments.
If issue repeats on 3+ routes, solve with template/component, not route patching.
Audited batch below: P0 routes in requested order, based on current implementation in:

landing page
signup page
dashboard
properties list
property hub
home score
status board client
guidance overview client
Route: /
Route Purpose
Acquire and qualify first-time visitors, establish trust, and drive signup.

Current Assessment
Marketing page is functional but visually dated and inconsistent with product shell. It feels like a legacy landing site, not a premium homeowner intelligence brand.

Scores
Overall: 6.0/10
Visual: 6.1/10
UX: 6.0/10
Trust: 5.4/10
Mobile: 6.4/10
Buyer Readiness: 5.8/10
Key Issues Found
Hero styling and copy are generic and dated ("Angi.com-inspired" comment, strong blue overlays).
Claim blocks like “Avg Savings” and “Happy Clients” are presented without proof context.
Section stack is long and feature-heavy before trust-proof sequencing is established.
Visual language diverges from dashboard experience, weakening brand continuity.
Why It Matters
Weak top-of-funnel polish lowers conversion and immediately reduces buyer confidence in product maturity.

Recommended Fixes
Quick Wins
Rework hero message to homeowner outcome + proof-backed claim structure.
Replace generic metric badges with sourced/qualified statements.
Reduce above-the-fold competing elements to one headline + one CTA + one trust row.
Structural Improvements
Introduce a canonical marketing-to-app brand bridge template.
Standardize landing section architecture: problem, proof, workflow, outcomes, CTA.
Trust Improvements
Add “how CtC computes recommendations” short explainer near first CTA.
Add source badges for claims and savings language.
Mobile Fixes
Reduce hero vertical weight; bring core CTA and proof above fold on smaller screens.
Simplify mobile nav interactions and reduce tap-to-content delay.
Reusable Components / Templates Needed
Marketing Hero Template (Outcome + Trust + Primary CTA)
Proof Row component (source-qualified claims)
Brand Transition section (what changes after signup)
Priority / Effort / Impact
Priority: P0
Effort: M
Impact: High
Before vs After Outcome
Before: broad marketing page with low differentiation and weak trust framing.
After: premium, evidence-led entry point that feels like the same system as the product.

Route: /signup
Route Purpose
Convert interested users into activated homeowner accounts with minimal friction and high trust.

Current Assessment
Signup works, but the page looks generic and inconsistent with CtC’s product tone. It under-communicates security, value, and what happens next.

Scores
Overall: 5.6/10
Visual: 5.7/10
UX: 6.1/10
Trust: 4.9/10
Mobile: 6.0/10
Buyer Readiness: 5.2/10
Key Issues Found
Visual style is old SaaS gradient/card pattern, detached from app system.
Raw form controls and ad-hoc states instead of canonical UI primitives.
Segment selection is binary radio UI with weak contextual explanation.
No trust rails: security/privacy reassurance, data use clarity, setup expectations.
Inconsistent language patterns (“Sign In” vs product conventions).
Why It Matters
This is conversion-critical. Weak trust and dated UX at signup damages both activation and valuation perception.

Recommended Fixes
Quick Wins
Add concise trust strip: data security, privacy, no spam, setup time.
Clarify segment intent with microcopy and outcome examples.
Standardize wording and form validation feedback tone.
Structural Improvements
Migrate to Auth Template (shared shell, typography, spacing, state behavior).
Use design-system inputs/buttons/errors exclusively.
Add progressive onboarding preview after segment selection.
Trust Improvements
Add explicit “why we ask this” for segment and profile fields.
Add secure-account language near password fields and submit CTA.
Mobile Fixes
Stack segment options with larger tap targets.
Improve field spacing and persistent CTA visibility during keyboard interactions.
Reusable Components / Templates Needed
Auth Form Template
Field-level trust hint component
Segment selector pattern (card-radio with rationale)
Priority / Effort / Impact
Priority: P0
Effort: M
Impact: High
Before vs After Outcome
Before: commodity signup form.
After: high-trust onboarding entry that feels credible and premium.

Route: /dashboard
Route Purpose
Give homeowners a clear daily command center with one best next action and confidence-backed insights.

Current Assessment
Powerful data exists, but the route is overloaded. It tries to do too many jobs simultaneously and sacrifices clarity for feature density.

Scores
Overall: 6.0/10
Visual: 6.3/10
UX: 5.7/10
Trust: 6.4/10
Mobile: 6.2/10
Buyer Readiness: 5.9/10
Key Issues Found
Multiple hero/intelligence sections stack before a stable “single next action” pattern.
Route contains divergent dashboard experiences by segment and viewport; consistency risk is high.
Too many competing content bands: alerts, pulse, local updates, scores, tools, seasonal widgets.
Loading/error states are generic and not premium-calibrated.
Uses fallback/demo-style local updates, which risks perceived authenticity.
Why It Matters
This is the core value surface. If users cannot parse priority quickly, product feels noisy and less intelligent.

Recommended Fixes
Quick Wins
Enforce one primary action and one supporting action above fold.
Collapse low-priority modules behind “View more” on initial load.
Normalize loading/error experiences to premium system states.
Structural Improvements
Introduce a Dashboard Orchestration Template with strict module slots and ordering.
Build a route-level prioritization engine for module visibility based on urgency/confidence.
Separate “monitoring” vs “decision” surfaces so cognitive load is lower.
Trust Improvements
Add persistent trust strip on dashboard hero: confidence + freshness + source mix.
Mark demo/fallback content explicitly or remove in production mode.
Mobile Fixes
Reduce stacked module depth in first viewport.
Ensure fixed UI elements do not compete with core action visibility.
Reusable Components / Templates Needed
Command Center Hero template
Priority Queue module
Trust Strip (confidence/freshness/source)
Dashboard module slot framework
Priority / Effort / Impact
Priority: P0
Effort: L
Impact: High
Before vs After Outcome
Before: feature-rich but mentally expensive dashboard.
After: calm, ranked, high-confidence command center.

Route: /dashboard/properties
Route Purpose
Help users select and manage their property portfolio as context for all downstream tools.

Current Assessment
Usable and fairly strong on mobile, but desktop/mobile are visually inconsistent and route logic is over-coupled to query-parameter redirects.

Scores
Overall: 6.6/10
Visual: 6.4/10
UX: 6.8/10
Trust: 5.8/10
Mobile: 7.2/10
Buyer Readiness: 6.4/10
Key Issues Found
navTarget branching creates opaque routing behavior and hidden complexity.
Mobile and desktop cards use different design languages; feels like two products.
Destructive action uses native confirm flow; low-quality interaction for premium app.
Floating “Ask Cozy” overlaps action hierarchy and can distract from core task.
Why It Matters
Property selection is foundational context. If it feels inconsistent or indirect, every downstream workflow inherits friction.

Recommended Fixes
Quick Wins
Replace native confirm with design-system confirmation modal.
Unify card style tokens across mobile and desktop variants.
Clarify “select property to continue” with explicit destination context.
Structural Improvements
Move nav redirection mapping into a centralized route resolver service.
Adopt a single Portfolio List template used by homeowner and provider variants.
Introduce context persistence so property selection happens once, not repeatedly.
Trust Improvements
Show last-updated timestamp for property data (photo, metadata).
Add subtle data completeness indicator per property card.
Mobile Fixes
Keep one fixed bottom surface at a time (chat or navigation, not both competing).
Ensure card CTA and overflow menu separation remains stable across viewport sizes.
Reusable Components / Templates Needed
Portfolio List Template
Context Selection Banner component
Confirm Destructive Action modal
Priority / Effort / Impact
Priority: P1
Effort: M
Impact: High
Before vs After Outcome
Before: solid list with hidden complexity and style drift.
After: clear context-selection route with consistent, premium behavior.

Route: /dashboard/properties/[id]
Route Purpose
Act as the property command hub: overview, maintenance, risk, financials, docs, reports, claims, and tool access.

Current Assessment
Comprehensive but overloaded. It behaves like a mini-dashboard plus tabbed workspace plus tool launcher, with weak top-level decision focus.

Scores
Overall: 6.0/10
Visual: 6.2/10
UX: 5.8/10
Trust: 6.0/10
Mobile: 6.5/10
Buyer Readiness: 5.8/10
Key Issues Found
Route title and intro are generic (“My Property”) for a high-value command hub.
Too many tabs and cross-route transitions from one surface; mental model is fragmented.
“Home Tools” tab navigates away instead of behaving like a real tab.
Context modules stack early (SmartContextToolsSection, guidance, checklist) before clear primary action.
Floating chat CTA competes with section navigation and lower content actions.
Why It Matters
This is the homeowner’s operational core. Ambiguous hierarchy and mixed interaction patterns reduce trust in recommendations and flow completion.

Recommended Fixes
Quick Wins
Replace generic title with dynamic property outcome headline.
Define one “today’s best action” block before secondary modules.
Remove pseudo-tab behavior that redirects away unexpectedly.
Structural Improvements
Split into Property Overview Template + dedicated functional subpages.
Cap first-level tabs and move lower-priority areas into structured subnavigation.
Enforce consistent tab semantics across all property routes.
Trust Improvements
Add route-level trust summary (confidence, freshness, source quality, assumptions).
Show “why this recommendation is prioritized now” in a standardized component.
Mobile Fixes
Reduce tab density in horizontal scroll; prioritize 4 primary tabs + overflow.
Prevent fixed overlays from obscuring tab content and action rows.
Reusable Components / Templates Needed
Property Hub Template
Trusted Prioritized Action card
Stable Tab+Overflow navigation pattern
Priority / Effort / Impact
Priority: P0
Effort: L
Impact: High
Before vs After Outcome
Before: broad control surface with high cognitive overhead.
After: focused property cockpit with clear next actions and trust context.

Route: /dashboard/properties/[id]/home-score
Route Purpose
Deliver a trust-grade home intelligence report with score, exposure, drivers, verification quality, and action plan.

Current Assessment
Strong trust instrumentation, but UX is report-heavy and dense. It feels like a technical dossier more than a guided homeowner decision experience.

Scores
Overall: 6.6/10
Visual: 7.0/10
UX: 5.9/10
Trust: 8.2/10
Mobile: 5.2/10
Buyer Readiness: 6.7/10
Key Issues Found
Very long report with many sections, badges, and repeated metadata blocks.
Primary action is diluted by many top controls (export/share/print/refresh).
Desktop table patterns (min-w-[900px]) signal weak mobile-first adaptation.
Copy is often analyst/report-centric rather than homeowner decision-centric.
“Print report” architecture dominates interaction model.
Why It Matters
Trust is high, but usability is heavy. Users may not act on insights because the route optimizes for completeness over decisiveness.

Recommended Fixes
Quick Wins
Add top “Decision Summary” module: top risk, top action, expected impact, confidence.
Collapse lower-priority report sections by default.
Reduce duplicate badge clusters and repeated metadata rows.
Structural Improvements
Split into two modes: Decision Mode (default) and Full Report Mode.
Build mobile-native cards for system health and exposure instead of wide tables.
Create a progressive disclosure report architecture with saved state.
Trust Improvements
Keep existing trust depth; surface key trust signals earlier in summary.
Add explicit assumptions/limitations block near top action, not only deep in report.
Mobile Fixes
Replace wide table with stacked system cards and risk buckets.
Keep share/export controls in a secondary menu on mobile.
Reusable Components / Templates Needed
Decision Summary Hero
Report Section Collapsible Template
Mobile Risk Table Replacement (stacked cards)
Priority / Effort / Impact
Priority: P1
Effort: L
Impact: High
Before vs After Outcome
Before: credible but overwhelming report route.
After: high-trust report that drives action quickly.

Route: /dashboard/properties/[id]/status-board
Route Purpose
Provide a real-time operational board of item/system condition, recommendation status, and maintenance actions.

Current Assessment
Operationally useful but visually and interaction-wise inconsistent. Desktop and mobile experiences diverge significantly and filter complexity is high.

Scores
Overall: 6.4/10
Visual: 6.7/10
UX: 6.2/10
Trust: 6.5/10
Mobile: 7.0/10
Buyer Readiness: 6.2/10
Key Issues Found
Strong filter/tooling density before clear “what to do first” framing.
Desktop “glass” aesthetic diverges from broader CtC system.
Recompute action appears in multiple places with weak expectation-setting.
Statuses are present, but trust context (freshness/source confidence) is not explicit to user.
Table-first desktop pattern remains heavy for homeowner users.
Why It Matters
This route should reduce maintenance anxiety. Instead, it can feel like an operations console requiring interpretation effort.

Recommended Fixes
Quick Wins
Add a top “Priority now” row with 1–3 immediate actions.
Consolidate recompute control to one location with last-updated indicator.
Simplify filter defaults to an opinionated homeowner view.
Structural Improvements
Introduce dual mode: Homeowner View (prioritized cards) and Advanced View (table).
Unify desktop visual style with core shell tokens.
Standardize condition/recommendation semantics across related routes.
Trust Improvements
Add explicit “status computed at”, “based on X data points”, and confidence tier.
Clarify what “Recompute” does and what changed after recompute.
Mobile Fixes
Keep current card approach but reduce secondary filters in initial state.
Preserve one-tap progression from “Action Needed” chip to actionable details.
Reusable Components / Templates Needed
Operational Priority Summary block
Last Updated + Recompute status component
Dual-mode board template (Homeowner/Advanced)
Priority / Effort / Impact
Priority: P1
Effort: M
Impact: Medium-High
Before vs After Outcome
Before: capable board with analyst-level complexity.
After: homeowner-ready board that guides action first and details second.

Route: /dashboard/properties/[id]/tools/guidance-overview
Route Purpose
Guide users through issue resolution journeys (item/service/issue selection, step progression, and fallback actions).

Current Assessment
Ambitious and mobile-oriented, but state complexity is high and trust framing is thin. The route behaves like a flow engine UI, not a calm guided decision experience.

Scores
Overall: 6.3/10
Visual: 6.5/10
UX: 6.0/10
Trust: 6.3/10
Mobile: 7.1/10
Buyer Readiness: 6.1/10
Key Issues Found
Many branching states (scope, item, issue, journey, fallback) increase cognitive overhead.
Heavy use of internal flow terminology in interaction structure.
Repeated controls (“Different issue”, “Skip step”) can fragment progress confidence.
“Why now” exists, but source/freshness/confidence framing is missing.
Desktop treatment is effectively stretched mobile container, not a true desktop-first pattern.
Why It Matters
This is a high-value guidance route. If it feels procedural instead of intelligent, users will not trust or complete the guided journey.

Recommended Fixes
Quick Wins
Add one-line route purpose + expected completion time at top.
Show progress confidence (“we’re X% sure this is best next step” where applicable).
Reduce visible branch controls until user requests alternatives.
Structural Improvements
Create a formal Guided Journey Template with fixed step architecture and state map.
Separate “select context” phase from “execute journey” phase visually and structurally.
Add desktop-specific two-pane layout (journey left, rationale/actions right).
Trust Improvements
Add trust panel per active step: why selected, data source, recency, assumptions.
Add “what changes if you skip” impact microcopy before skip action.
Mobile Fixes
Keep mobile-first cards but reduce repeated action rows.
Introduce sticky step progress/footer CTA for long journeys.
Reusable Components / Templates Needed
Guided Journey Template
Step Trust Panel
Step Progress + Impact Footer
Priority / Effort / Impact
Priority: P1
Effort: L
Impact: High
Before vs After Outcome
Before: functional flow engine with high state burden.
After: confident, guided, homeowner-friendly resolution workflow.

Cross-Route Findings
Primary action clarity is the most repeated failure. Too many screens compete for attention.
Visual language still fragments by route family (landing/auth/dashboard/tools/report).
Trust communication is inconsistent: very strong in HomeScore, weak elsewhere.
Mobile is better than expected in some flows, but overlay and fixed-surface collisions remain systemic.
Route logic complexity leaks into UX (query-based navigation and branched flow states).
Shared Fix Opportunities
Build and enforce 5 route templates:
Marketing Funnel Template
Auth Template
Command Center Template
Property Hub Template
Guided Journey Template
Ship one global Trust Strip (confidence, freshness, source, assumptions) for all decision routes.
Create one “Priority Action” pattern reused on dashboard/property/tools/status.
Standardize loading/empty/error states with premium tone and homeowner-safe language.
Introduce route-level QA gates: hierarchy, trust markers, mobile ergonomics, consistency.
Highest ROI Routes to Upgrade Next
/signup
/dashboard
/dashboard/properties/[id]
/dashboard/properties/[id]/tools/guidance-overview
/dashboard/properties/[id]/home-score (Decision Mode first)
/dashboard/properties
Valuation Risk Routes
/signup: weak trust conversion surface hurts immediate buyer perception.
/dashboard: perceived as cluttered orchestration, not elegant intelligence.
/dashboard/properties/[id]: IA overload suggests product sprawl.
/dashboard/properties/[id]/tools/guidance-overview: complexity without clear trust framing.
/: inconsistent marketing quality vs premium SaaS benchmark.
Recommended Next Sprint
Implement shared Priority Action + Trust Strip on /dashboard and /dashboard/properties/[id].
Replace /signup with canonical Auth Template and trust messaging.
Create mobile/desktop unified visual token pass for /dashboard/properties and /status-board.
Launch HomeScore Decision Mode (summary + top 2 actions) while keeping full report below fold.
Define and document Guided Journey Template, then refactor guidance overview states into that structure.