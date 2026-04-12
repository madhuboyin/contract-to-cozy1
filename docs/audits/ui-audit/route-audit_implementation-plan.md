Implementation Plan: Route-by-Route Rollout (Starting With Highest ROI Routes)

1. Delivery Model (so this scales across 100+ routes)
Cadence: 2-week sprints, 12 weeks initial program.
Squad: 1 Product Designer, 2 Frontend Engineers, 1 Full-stack Engineer, 1 QA (mobile+desktop), 1 PM.
Execution rule: No one-off redesigns. Every route fix must either:
use an existing template/component, or
create a reusable template/component first.
2. Workstreams (run in parallel every sprint)
Route Modernization
Design System Hardening
Trust Layer Standardization
Mobile UX Standardization
Quality Gates + Buyer Readiness QA
3. Wave 1 (Highest ROI Routes First)
Sprint 1: /signup + / (acquisition funnel)
Goals

Lift conversion trust and first impression quality immediately.
Build

Auth Template v1 (shared layout, input states, inline errors, trust strip).
Marketing Hero Template v1 (single outcome CTA + proof row).
Copy normalization for auth/funnel language.
Definition of Done

/signup trust score >= 7.
/ buyer readiness >= 7.
Mobile sign-up completion path works cleanly on small screens.
Sprint 2: /dashboard (core command center)
Goals

Reduce overload and make “next best action” obvious.
Build

Command Center Template v1:
Priority Action Hero
Trust Strip (confidence/freshness/source)
Secondary modules collapsed behind “view more”
Standardized loading/error/empty states.
Remove or clearly mark fallback/demo-style content.
Definition of Done

Above-the-fold contains one primary action + one supporting action.
Dashboard UX score >= 7.
Mobile first viewport no longer overcrowded.
Sprint 3: /dashboard/properties/[id] (property hub)
Goals

Turn property page into a calm operational cockpit.
Build

Property Hub Template v1:
Dynamic title + context
Stable primary action zone
Reduced top-level tab load
Fix pseudo-tab behavior (tabs should not feel like hidden redirects).
Standardize chat/fixed-layer collision behavior.
Definition of Done

Users can identify purpose + next action within 3 seconds.
Tab behavior consistent and predictable.
Property hub buyer readiness >= 7.
Sprint 4: /dashboard/properties/[id]/tools/guidance-overview
Goals

Make guidance flow feel intelligent, not procedural.
Build

Guided Journey Template v1:
Phase A: Context select
Phase B: Execute journey
Sticky progress/footer action
Step Trust Panel:
why this step
source/confidence
consequence of skip
Desktop two-pane adaptation.
Definition of Done

Fewer branching decisions visible at once.
Journey completion path is linear and confidence-backed.
Trust score >= 7.
Sprint 5: /dashboard/properties/[id]/home-score + /dashboard/properties
Goals

Keep trust depth, reduce report fatigue, and improve portfolio context flow.
Build

HomeScore “Decision Mode” at top:
top risk
top action
expected impact
confidence
Full Report mode remains below fold/collapsible.
Portfolio List Template v1 for /dashboard/properties.
Replace native confirm dialogs with system modals.
Definition of Done

HomeScore mobile score >= 6.8 (from ~5.2 baseline).
/dashboard/properties consistency across desktop/mobile >= 7.
Clear property context handoff into downstream routes.
4. Wave 2 (Core Trust/Value Route Families: P1)
Sprint 6–8 Route Families
Coverage + Insurance intelligence routes
Inventory + Rooms + Status + Timeline
Risk + Refinance + Quote Comparison + Savings + Negotiation
Approach

Migrate by template family, not individual page-by-page custom work.
Apply shared patterns:
Compare Template
Detail Template
Tool Workspace Template
Table-to-mobile-card transformation pattern
Trust Strip everywhere recommendations appear
Exit Criteria per family

All routes in family meet min scores:
Visual >= 7
UX >= 7
Trust >= 7
Mobile >= 7
Buyer Readiness >= 7
5. Wave 3 (Secondary + Admin: P2/P3)
Sprint 9–12
Migrate secondary homeowner tools to template system.
Standardize provider/admin shells for operational clarity.
Remove remaining inconsistent legacy visuals/interactions.
Final buyer-readiness polish pass.
Admin rule

Prioritize speed/clarity/efficiency over decorative styling.
Use same token system, but denser interaction model.
6. Shared Systems to Build Early (Dependencies)
Build these in order because all route work depends on them:

Token Governance v1 (color, typography, spacing, elevation, radius)
State System v1 (loading/empty/error/offline/success)
Trust Strip + Trust Panel v1
Priority Action pattern
Templates: Auth, Command Center, Property Hub, Guided Journey, Report, Compare
Mobile shell rules (fixed layers, safe-area, sticky CTA, tap targets)
7. QA + Governance Gates (required before merge)
Route must pass:
hierarchy check (one clear primary action)
trust check (confidence/source/freshness where relevant)
mobile check (intentional mobile flow, no overlay conflicts)
consistency check (template + tokens only)
Add CI guards:
block arbitrary visual utility drift
visual regression snapshots for priority routes
lint rule for disallowed raw UI primitives where shared components exist
8. KPI Targets (program-level)
Track weekly:

Signup conversion rate
Time-to-first-action on dashboard
Guided journey completion rate
HomeScore action click-through
Mobile task success rate
Route quality score trend (from your 12-dimension audit)
9. Immediate Next 2 Weeks (concrete sprint backlog)
Implement Auth Template v1 and migrate /signup.
Implement Marketing Hero v1 and update /.
Build Trust Strip component and wire to /dashboard hero.
Build Priority Action block and place on /dashboard.
Add route QA checklist + visual baseline snapshots for these routes.
If you want, I can convert this into a sprint-by-sprint Jira backlog with ticket titles, acceptance criteria, and story point estimates next.