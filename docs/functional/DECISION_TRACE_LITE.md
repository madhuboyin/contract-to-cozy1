Decision Trace Lite

“Why am I seeing this?” — Transparency Layer for Actions

1. Overview

Decision Trace Lite introduces an explicit, user-facing explanation layer for why actions appear (or are hidden) in ContractToCozy.

It addresses:

Trust in AI-driven recommendations

Reduction of “black box” skepticism

Foundation for future automation (IoT, proactive alerts)

This feature is intentionally lightweight, explainable, and non-intrusive.

2. Goals & Value
Primary Goals

Explain why an action exists or is suppressed

Make system reasoning legible without overwhelming users

Preserve UX simplicity while enabling deep inspection

Business & User Value

High trust multiplier for AI recommendations

Reduces support questions (“Why am I seeing this?”)

Differentiates from competitors (HomeZada lacks this depth)

Enables confident future automation (IoT, auto-actions)

3. Core UX Behavior (Finalized)
Action Types & Behavior Matrix
Action Type	Inline Explanation	Modal	Notes
Risk (active)	✅ Yes (preview)	✅ Yes	Inline preview + “View details”
Checklist (active)	✅ Yes (summary)	❌ No	No modal; avoids redundant trace
Suppressed (any source)	❌ No	✅ Yes	Always modal
Checklist (suppressed)	❌ No	✅ Yes	Suppression reasons shown
4. Frontend Logic (Implemented)
Canonical Decision Logic
Suppressed → open modal directly  
Checklist-only → inline explanation (no modal)  
Risk-derived → inline preview + modal CTA  

Key Components

DecisionTracePanel.tsx

DecisionTraceItem.tsx

DecisionTraceModal.tsx

decisionTraceLabels.ts (single source of truth)

5. Canonical Label & Copy System
Single Source of Truth

All rule labels, suppression labels, and humanization logic are centralized in:

components/orchestration/decisionTraceLabels.ts


This prevents:

Enum leakage

Copy drift

Duplicated “humanizers”

Covered Rule Categories

Actionability (RISK_ACTIONABLE, CHECKLIST_ACTIONABLE)

Inference (RISK_INFER_ASSET_KEY, SERVICE_CATEGORY)

Age evaluation (AGE_EVALUATION)

Coverage (COVERAGE_CHECK, COVERAGE_GAP_DETECTOR)

Suppression (SUPPRESSION_CHECK, TASK_ALREADY_SCHEDULED)

User actions (USER_MARKED_COMPLETE, USER_UNMARKED_COMPLETE)

Final decisions (SUPPRESSION_FINAL)

6. formatRuleDetails() — Final Design
Priority Order (Finalized)

Backend-curated details.message

Snooze (daysRemaining → date)

Age evaluation

Coverage state

Task / checklist titles

Service category

Generic reason

Fallback

Why This Matters

Backend messages are trusted when present

Snooze text is human-friendly

Avoids raw JSON / internal IDs

Produces consistent, predictable explanations

7. Checklist-Specific UX (Resolved)
Problem

Checklist actions with a single step looked “odd” when opening a full modal.

Solution (Implemented)

Inline explanation panel only

Shows:

Source (“From your maintenance schedule”)

Service category

Due date / overdue state

Status

Recurring badge

No modal unless suppressed

This removed unnecessary complexity and improved clarity.

8. Backend Alignment (Verified)
Decision Trace DTO
DecisionTraceStepDTO {
  rule
  outcome
  details?
  confidenceImpact?
}

Suppression DTO
SuppressionReasonEntryDTO {
  reason
  message
  relatedType?
  relatedId?
}


All live payloads (risk, checklist, suppressed) are now correctly rendered.

9. Edge Cases Handled

Suppressed actions with no steps still show explanation link

USER_UNMARKED_COMPLETE supported

COVERAGE_GAP_DETECTOR supported

Mixed checklist + risk derivations handled

Missing dates / malformed ISO handled safely

10. Pending Items (Short-Term)
Must / Should

 Confidence breakdown surfaced in modal (per-step contribution)

 Tooltip hook for “How is this calculated?” → reuse decision trace copy

 Ensure suppressed checklist actions always include suppression source

Nice-to-Have

 Expand inline preview to show confidence badge

 Add “Why this?” link to Budget Forecaster items

 Animate inline expand/collapse (subtle)

11. Future Enhancements (Strategic)
Phase 2 – Explainability+

Show confidence drivers per step

Highlight strongest signal visually

“What would change this?” hints

Phase 3 – Automation Readiness

Attach IoT signals as trace steps

Auto-suppression explanations (“Sensor confirms normal state”)

Auto-resolve actions with trace logging

12. Final Assessment

Status: ✅ Feature-complete and production-ready
UX Quality: High
Trust Impact: Very High
Tech Debt Introduced: None (reduced, actually)

This implementation establishes a canonical explanation layer that future AI features can rely on without redesign.

If you want, next we can:

Convert this into a PR description

Create a product-facing spec

Or define Phase 2 confidence visualization in detail


PRD — Phase 2.3: Actionable Confidence Improvements
Product Area

Action Center → Confidence & Explainability

Status

Planned (Not Implemented)

Owner

Product / Platform (ContractToCozy)

Related Phases

Phase 2.1 — Confidence Visualization (popover, explanation)

Phase 2.2 — Confidence Deltas (per-step impact)

Phase 2.3 — Actionable Improvements (this PRD)

1. Problem Statement

Users understand why an action has LOW or MEDIUM confidence, but they are not guided on what to do next to improve it.

This results in:

Low-confidence actions being ignored

Missed opportunities to collect better data

Reduced trust in AI recommendations over time

2. Goal

Turn confidence from a passive explanation into an active improvement loop.

Users should be able to:

See what’s missing

Click one clear action

Improve confidence with minimal effort

3. Non-Goals

❌ No auto-modification of confidence score in this phase

❌ No new ML models

❌ No backend confidence recomputation logic

❌ No complex attribution models

This phase is UI + routing + analytics only.

4. User Stories
US-1: Improve coverage-related confidence

As a homeowner, when confidence is low because coverage is missing, I want a direct link to add my warranty or insurance so the recommendation becomes more reliable.

US-2: Improve asset data confidence

As a homeowner, when confidence is reduced due to unknown age or system ambiguity, I want to quickly confirm the information without hunting through the app.

US-3: Understand impact of my action

As a homeowner, after I complete a suggested improvement, I want confidence to feel justified and earned.

5. UX Entry Points
Primary Surface

ConfidencePopover (Phase 2.1 enhanced)

Secondary Surface

Decision Trace Modal → Confidence Drivers (read-only)

6. UX Behavior (Detailed)
When confidence level is:

HIGH

No “Improve confidence” CTAs shown

MEDIUM / LOW

Show 1–3 improvement CTAs

CTAs are context-aware and actionable

7. Improvement CTA Types
7.1 Coverage Missing

Trigger conditions

Confidence explanation contains:

“No coverage”

“Missing coverage”

coverage.hasCoverage === false

Or decision trace contains:

COVERAGE_CHECK / COVERAGE_MATCHING with negative impact

CTA

Label: “Add coverage details”

Destination:

/properties/{propertyId}/coverage?from=confidence

7.2 Inventory / Asset Confirmation

Trigger conditions

Explanation mentions:

“Unknown age”

“Missing install year”

“System could not be confirmed”

Or decision trace includes:

AGE_EVALUATION with negative impact

CTA

Label: “Confirm system details”

Destination:

/properties/{propertyId}/inventory?openItemId={entityId}&from=confidence

7.3 Checklist / Maintenance Data

Trigger conditions

Checklist-derived actions with:

Missing install year

Ambiguous frequency

Or decision trace includes:

CHECKLIST_ITEM_TRACKED with negative impact

CTA

Label: “Update maintenance details”

Destination:

/properties/{propertyId}/maintenance/{checklistItemId}?from=confidence

8. CTA Display Rules

Max 2 CTAs per popover (avoid overwhelm)

Ordered by largest negative confidence impact

Shown as:

Primary button (first)

Secondary link (second)

9. Analytics & Tracking
9.1 Events
Event: confidence_improvement_clicked
{
  "event": "confidence_improvement_clicked",
  "propertyId": "...",
  "actionId": "...",
  "confidenceLevel": "LOW",
  "improvementType": "COVERAGE | INVENTORY | CHECKLIST",
  "source": "ConfidencePopover"
}

Event: confidence_improvement_completed

Triggered when user completes the target action with from=confidence present.

{
  "event": "confidence_improvement_completed",
  "propertyId": "...",
  "actionId": "...",
  "improvementType": "COVERAGE | INVENTORY | CHECKLIST",
  "completionSurface": "CoverageUpload | InventoryEdit | ChecklistEdit"
}

10. Success Metrics
Primary

CTR on “Improve confidence” CTAs

Completion rate of linked actions

Secondary

Increase in MEDIUM → HIGH confidence transitions (later phase)

Reduced ignored/dismissed low-confidence actions

11. Technical Scope
Frontend

Extend ConfidencePopover to render CTA buttons

Add route helpers for deep links

Append ?from=confidence query param

Fire analytics events on click + completion

Backend

❌ No schema changes

❌ No new endpoints

Optional: accept from=confidence metadata on save events

12. Risks & Mitigations
Risk	Mitigation
Too many CTAs	Cap at 2
Users feel nagged	Only show for MEDIUM / LOW
Attribution unclear	Use from=confidence param
Inconsistent routing	Centralize route helpers
13. Open Questions (for later)

Should confidence immediately recompute after completion?

Should we show “Confidence improved” toast?

Should improvements affect prioritization?

(Not required for Phase 2.3)

14. Final Assessment

Phase 2.3 converts explainability into engagement.
It is the bridge between understanding and action, and unlocks measurable value without backend risk.

Recommended priority: Medium-High
Estimated effort: Low–Medium
Dependency: Phase 2.1 (done), Phase 2.2 (optional but beneficial)

When you’re ready to implement, I can:

Generate exact CTA components

Wire analytics events

Map routes precisely to your existing app structure