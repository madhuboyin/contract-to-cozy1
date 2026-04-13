
1. Tracker Purpose
The Route Audit Tracker is CtC’s single operating system for UI quality execution across 100+ routes.

Who uses it:

Product: prioritization, sprint planning, ROI decisions
Design: route-level quality targets, template compliance, system debt burn-down
Engineering: scoped execution, dependency mapping, regression safety
Leadership: buyer-readiness progress, risk visibility, release confidence
Why it matters:

Converts audits into shippable work
Forces reusable fixes over one-off cleanups
Makes quality measurable before and after release
Protects against regression with governance + QA gates
2. Master Tracker Schema
Column	Type	Required	Description
Route	Text	Y	Canonical path (/dashboard/properties/[id])
Route Name	Text	Y	Human-readable label
Route Family	Enum	Y	Landing, Auth, Dashboard, Property Hub, Tool, Report, Compare, Guidance, Inventory, Rooms, Provider, Admin, Public Share
Surface Type	Enum	Y	Public / Auth / App / Admin / Provider
Device Scope	Enum	Y	Desktop / Mobile / Both
Product Owner	Text	Y	DRI for business decisions
Design Owner	Text	Y	DRI for UX/UI decisions
Engineering Owner	Text	Y	DRI for implementation
Overall Score	Number (0-10)	Y	Weighted route quality
Visual Score	Number (0-10)	Y	Visual polish, hierarchy, spacing
UX Score	Number (0-10)	Y	Clarity, usability, flow quality
Trust Score	Number (0-10)	Y	Explainability, confidence, source, freshness
Mobile Score	Number (0-10)	Y	Mobile-first execution quality
Buyer Readiness Score	Number (0-10)	Y	Diligence-grade perception quality
Trust Hard Fail	Bool	Y	Trust must-fix blocker
Mobile Hard Fail	Bool	Y	Mobile must-fix blocker
Buyer Hard Fail	Bool	Y	Buyer-perception must-fix blocker
Conversion Risk	Enum	Y	High / Medium / Low
Valuation Risk	Enum	Y	High / Medium / Low
Priority	Enum	Y	P0 / P1 / P2 / P3
Impact	Enum	Y	High / Medium / Low
Effort	Enum	Y	S / M / L
ROI Score	Number (0-100)	Y	Priority math output
Sprint Target	Text	Y	Sprint number or release window
Current Template Family	Text	Y	Current shell/template
Target Template Family	Text	Y	Planned destination template
Template Compliance Score	Number (0-10)	Y	Token/template adherence
Shared Fix Candidate	Bool	Y	Fix can improve multiple routes
Repeated Issue Tags	Multi-select	Y	Taxonomy tags
Top Problems	Text	Y	3-5 concrete problems
Why It Matters	Text	Y	User + business impact
Recommended Quick Wins	Text	Y	Low effort / high impact
Recommended Structural Fixes	Text	Y	Refactor/template-level work
Trust Fixes	Text	Y	Explainability and confidence improvements
Mobile Fixes	Text	Y	Ergonomics, density, CTA flow fixes
Status	Enum	Y	Not Started / Audited / In Design / In Build / In QA / Done / Deferred
Dependencies	Text	N	Upstream blockers (template, API, content, analytics)
Blockers	Text	N	Active execution blockers
Date Audited	Date	Y	Audit timestamp
Last Updated	Date	Y	Last tracker touch
Release Version	Text	N	Version where fix shipped
Before Score	Number (0-10)	Y	Pre-change baseline
After Score	Number (0-10)	N	Post-change validated score
Screenshots Updated	Bool	Y	Updated visual baseline/evidence
QA Passed	Bool	Y	QA checklist pass
Regression Safe	Bool	Y	Gate checks passed
3. Scoring Logic
Scoring model:

Visual: 20%
UX: 25%
Trust: 25%
Mobile: 20%
Buyer Readiness: 10%
Formula:

Overall = (Visual*0.20) + (UX*0.25) + (Trust*0.25) + (Mobile*0.20) + (Buyer*0.10)
Hard fail rules:

Trust Hard Fail = Trust < 6.0 on routes with recommendations, financial/risk guidance, compare outputs, or coverage decisions
Mobile Hard Fail = Mobile < 6.0 on routes where mobile traffic is primary or where critical action is blocked by density/overlay
Buyer Hard Fail = Buyer Readiness < 6.0 on funnel, dashboard, property hub, or trust-critical flows
ROI formula (0-100):

ROI = ((ImpactWeight * ReachWeight * StrategicWeight * LeverageWeight) / EffortWeight) * 10
Weights:
ImpactWeight: High=3, Med=2, Low=1
ReachWeight: Core route traffic percentile mapped to 1-3
StrategicWeight: Conversion/trust/valuation criticality mapped to 1-3
LeverageWeight: Shared Fix Candidate Y=3, N=1
EffortWeight: S=1, M=2, L=3
Automatic priority upgrades:

Any Hard Fail on /, /signup, /dashboard, /dashboard/properties/[id], guidance routes => auto P0
Trust Score < 5.5 on financial/risk/compare routes => auto P0
ROI >= 75 => minimum P1
Shared fix affecting 8+ routes => upgrade one priority tier
Regression on previously fixed P0/P1 route => auto P0 hotfix lane
4. Priority Rules
P0:

Conversion-critical routes with hard fail
Trust-critical decision routes with trust/mobile hard fail
Routes that materially hurt buyer diligence perception
Core routes: /, /signup, /dashboard, /dashboard/properties/[id], guidance core
P1:

Core value routes without hard fail but score < 7
High-traffic tool/report/compare flows with medium-high risk
Shared template fixes with high leverage
P2:

Secondary homeowner tools and support surfaces
Quality improvements with moderate impact
Non-blocking consistency debt
P3:

Admin utility surfaces and low-traffic routes
Nice-to-have polish
Deferred improvements pending template migration
5. Status Workflow
Workflow:

Backlog
Audited
Planned
In Design
In Build
In QA
Released
Monitored
Deferred
Exit criteria:

Backlog -> Audited: scores + tags + findings complete
Audited -> Planned: priority, owners, effort, sprint assigned
Planned -> In Design: solution direction approved by Product + Design
In Design -> In Build: annotated spec + acceptance criteria + component/template mapping complete
In Build -> In QA: feature complete, screenshots updated, tests/gates passing locally
In QA -> Released: QA passed + regression safe + signoff
Released -> Monitored: production verification + no critical regressions for 1 release cycle
Any stage -> Deferred: documented reason + revisit date required
6. Reporting Views
Executive View:

Filter: P0/P1 only, High valuation risk, hard fails
Fields: route, owner, priority, ROI, blocker, target sprint, before/after
Design Systems View:

Group by target template family and repeated issue tags
Highlights shared fixes, template compliance gaps, token drift clusters
Sprint View:

Filter by sprint target and status in Design/Build/QA
Shows ownership, dependencies, readiness, QA status
Trust View:

Filter Trust Hard Fail = Y or Trust Score < 7
Group by risk/financial/coverage/compare/guidance families
Mobile View:

Filter Mobile Hard Fail = Y or Mobile Score < 7
Include overlay conflict, tap target, sticky CTA, table-collapse flags
Buyer Readiness View:

Filter Buyer Score < 7 or Buyer Hard Fail = Y
Rank by valuation risk and route visibility in diligence flows
7. Repeated Issue Taxonomy
Recommended tags (use as controlled vocabulary):

TYPO_HEAVY
SPACING_DRIFT
COLOR_HIERARCHY_WEAK
CARD_OVERLOAD
CTA_WEAK
PRIMARY_ACTION_AMBIGUOUS
TRUST_GAP
CONFIDENCE_MISSING
SOURCE_MISSING
FRESHNESS_MISSING
EXPLAINABILITY_WEAK
MOBILE_DENSE
MOBILE_OVERLAY_COLLISION
TAP_TARGET_TOO_SMALL
TABLE_NOT_MOBILE_SAFE
DRAWER_MODAL_MISUSE
NAV_CONFUSING
TAB_BEHAVIOR_INCONSISTENT
TEMPLATE_DRIFT
TOKEN_DRIFT
STATE_QUALITY_WEAK
EMPTY_STATE_WEAK
ERROR_STATE_WEAK
JARGON
COPY_ROBOTIC
REPORT_TOO_HEAVY
COMPARE_CONFUSING
FORM_FATIGUE
ONBOARDING_FRICTION
BUYER_PERCEPTION_RISK
8. Example Rows
Route	Family	Surface	Scores (O/V/UX/T/M/B)	Hard Fails	Priority	ROI	Current -> Target Template	Top Problems	Status
/	Landing	Public	6.4 / 6.8 / 6.2 / 6.0 / 6.5 / 6.1	Trust:N Mobile:N Buyer:Y	P0	84	Legacy Landing -> Marketing Hero v1	Mixed messaging, weak proof hierarchy, buyer polish inconsistency	In Build
/signup	Auth	Auth	6.9 / 7.1 / 6.8 / 6.7 / 6.9 / 6.8	Trust:N Mobile:N Buyer:N	P0	79	Auth v1 -> Auth v1 hardened	Validation clarity gaps, reassurance copy underpowered, mobile friction in dense states	In QA
/dashboard	Dashboard	App	7.0 / 7.0 / 7.2 / 7.1 / 6.8 / 7.0	Trust:N Mobile:N Buyer:N	P0	88	Command Center v1 -> Command Center v1	Secondary module overload risk, mobile above-fold density, inconsistent fallback semantics	In Build
/dashboard/properties/[id]	Property Hub	App	6.8 / 6.9 / 6.7 / 6.6 / 6.5 / 6.7	Trust:N Mobile:N Buyer:N	P1	73	Property Hub v1 partial -> Property Hub v1 full	Tab predictability, action-zone stability, layered UI collisions	In Design
/dashboard/properties/[id]/tools/guidance-overview	Guidance	App	7.1 / 7.0 / 7.3 / 7.2 / 7.0 / 7.1	Trust:N Mobile:N Buyer:N	P0	86	Guided Journey v1 partial -> Guided Journey v1 full	Residual branching complexity, trust panel consistency, progress affordance depth	In QA
9. Governance Rules
Update cadence:

Route row must be updated at every status change
Scores and tags must be revalidated before QA exit
Executive view refreshed weekly
Full tracker hygiene review bi-weekly
Ownership:

Product Owner owns priority/sprint target
Design Owner owns scores, findings, template target
Engineering Owner owns effort, dependencies, release version, regression safety
Staleness prevention:

Auto-flag rows not updated in 14 days
Auto-flag audits older than 90 days on P0/P1 routes
“Deferred” requires explicit revisit date
Validation requirements:

Before/after scores required for Done
Screenshot evidence required for visual-impact changes
QA Passed + Regression Safe required before Released
CI gates must pass for merge
Re-audit triggers:

Template migration
Major copy or IA changes
Score drop or production regression
New route in P0/P1 family
Quarterly for all core routes
10. Final Recommendation
Operationalize in 90 days with three tracks running together:

Track 1 (Weeks 1-4): Complete tracker population for all P0/P1 routes, lock taxonomy, enforce owners, start weekly executive review.
Track 2 (Weeks 5-8): Drive template-family execution (Auth, Command Center, Property Hub, Guided Journey, Compare, Report), prioritize shared fixes with ROI >= 75.
Track 3 (Weeks 9-12): Expand to P2/P3, close top valuation risks, run full re-score pass, publish buyer-readiness scorecard trend.
Success criteria by day 90:

100% P0 routes at Overall >= 7 with no hard fails
80% P1 routes at Overall >= 7
Template compliance median >= 7.5
Trust hard fails reduced to near zero on decision routes
Regression events reduced via enforced QA/governance gates