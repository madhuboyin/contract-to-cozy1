AI Home Decision Tools – Functional Requirements Document (FRD)
1. Overview

This document defines the functional requirements for the following AI-driven homeowner intelligence tools:

Replace or Repair

Risk-to-Premium Optimizer

Home Capital Timeline

Do-Nothing Simulator

These tools collectively position Contract-to-Cozy as:

🧠 The Financial Brain of Your Home

Each tool is:

Deterministic (no black-box randomness)

Explainable (decision trace required)

Property-scoped

Versioned

Snapshot-based

Staleness-aware

Future-proofed via DB persistence

2. Replace or Repair
2.1 Objective

Help homeowners decide whether to:

Repair an item

Replace now

Replace soon

Repair and monitor

Reduce emotional decisions and avoid capital waste.

2.2 Trigger Context

User selects an Inventory Item and clicks:

“Replace or Repair”

2.3 Inputs

From database:

InventoryItem:

installedOn / purchasedOn

condition

replacementCostCents

category

HomeEvent (REPAIR / MAINTENANCE / REPLACEMENT)

Claims history (optional signal)

Risk signals (optional)

User overrides:

estimated repair cost

replacement cost override

remaining life override

cash buffer

risk tolerance

2.4 Outputs

Verdict:

REPLACE_NOW

REPLACE_SOON

REPAIR_AND_MONITOR

REPAIR_ONLY

Break-even months (if calculable)

Expected annual repair risk

Estimated repair cost

Estimated replacement cost

Confidence (HIGH/MEDIUM/LOW)

Impact level

Summary

Decision trace (8–12 explainability factors)

Next steps (max 3–5)

2.5 Persistence Model

ReplaceRepairAnalysis

Snapshot per run

Numeric queryable fields

inputsSnapshot (Json)

decisionTrace (Json)

status (READY/STALE/ERROR)

Staleness triggered when:

InventoryItem lifecycle fields change

New REPAIR / MAINTENANCE / REPLACEMENT event logged

Replacement cost changes

2.6 Algorithm (High-Level)

Determine age

Estimate lifespan band by category

Compute remaining years

Estimate repair risk (age + repair frequency)

Estimate break-even

Assign verdict

Generate decision trace

2.7 Future Enhancements

ML-adjusted lifespan curves

Regional repair cost normalization

Vendor quote ingestion

Predictive failure probability curves

Portfolio “Top Replace Next” view

3. Risk-to-Premium Optimizer
3.1 Objective

Reduce premium pressure without increasing risk.

Not a carrier recommendation tool.
Educational and strategic only.

3.2 Trigger Context

Homeowner opens:

“Risk-to-Premium Optimizer”

3.3 Inputs

From database:

InsurancePolicy:

premiumAmount

deductibleAmount

coverageJson

Property risk signals

Claims history

Inventory exposure (roof age, water heater age, etc.)

HomeEvents (proof of mitigation)

User overrides:

cash buffer

risk tolerance

deductible strategy

3.4 Outputs

Summary

Estimated savings range

Premium drivers (3–6 max)

Ranked recommendations (3–7 max)

Mitigation Plan Items

Confidence

Decision trace

3.5 Persistence Model

RiskPremiumOptimizationAnalysis

Snapshot per run

premiumDrivers (Json)

recommendations (Json)

estimatedSavingsMin/Max

status

inputsSnapshot

RiskMitigationPlanItem

status: RECOMMENDED / PLANNED / DONE / SKIPPED

actionType

targetPeril

estimatedCost

estimatedSavings

evidence links

3.6 Staleness Triggers

InsurancePolicy change

Claim creation/update

Risk score recompute

Plan item marked DONE

Major inventory changes

3.7 Algorithm (High-Level)

Identify top premium drivers

Rank by severity

Generate mitigation actions

Generate policy lever suggestions

Estimate savings band conservatively

Generate explainability trace

3.8 Future Enhancements

Renewal-to-renewal premium comparisons

Discount detection engine

Mitigation ROI score

Region-adjusted mitigation savings model

Integration with Home Capital Timeline

4. Home Capital Timeline
4.1 Objective

Predict major home capital expenses over a 5–10 year horizon.

Reduce financial shock.
Enable proactive budgeting.

4.2 Trigger Context

User opens:

“Home Capital Timeline”

4.3 Inputs

From database:

InventoryItem lifecycle data

Replacement cost data

HomeEvent history

Risk signals (optional)

Timeline overrides:

planned date

planned window

cost override

disable item

adjust remaining life

4.4 Outputs

Timeline of events (windowStart → windowEnd)

Cost range

Category

EventType

Confidence

Priority

Why explanation

Summary of next 12–24 months

4.5 Persistence Model

HomeCapitalTimelineAnalysis

horizonYears

timelineJson

inputsSnapshot

status

computedAt

HomeCapitalTimelineItem

category

eventType

windowStart/windowEnd

cost range

priority

confidence

HomeCapitalTimelineOverride (optional but implemented)

type

payload

4.6 Staleness Triggers

Inventory lifecycle change

New repair/replacement event

Override change

Replace/Repair run (optional integration)

4.7 Algorithm (High-Level)

Determine age and lifespan band

Estimate remaining life window

Adjust for repair frequency & condition

Apply overrides

Filter by horizon

Rank by priority

Generate summary narrative

4.8 Future Enhancements

Appliance wave clustering visualization

Capital shock probability model

Integration with cost volatility tool

Budget planning module tie-in

Mortgage impact simulation

5. Do-Nothing Simulator
5.1 Objective

Simulate consequences of delaying action.

Answer:

“What happens if I ignore this for 12–24 months?”

5.2 Trigger Context

User opens:

“Do-Nothing Simulator”

5.3 Inputs

From database:

Current risk baseline

Inventory aging

Maintenance compliance

Claims history

Insurance policy details (optional)

User overrides:

skipMaintenance

skipWarranty

deductible strategy

cash buffer

horizonMonths

5.4 Outputs

Risk score delta

Expected cost delta range

Incident likelihood (LOW/MEDIUM/HIGH)

Top risk drivers

Top cost drivers

Biggest avoidable losses

Next steps

Decision trace

5.5 Persistence Model

DoNothingScenario

Saved configuration

horizonMonths

inputOverrides

DoNothingSimulationRun

Snapshot per run

inputsSnapshot

outputsSnapshot

decisionTrace

riskScoreDelta

expectedCostDelta

incidentLikelihood

status

5.6 Staleness Triggers

Risk analysis recomputed

Maintenance change

New claim

Inventory lifecycle change

HomeEvent repair/replacement

5.7 Algorithm (High-Level)

Capture baseline

Apply user toggles

Increase risk proportionally to:

aging systems

skipped maintenance

prior claims

Estimate cost impact bands

Assign incident likelihood

Generate top avoidable losses

Generate minimal next steps

5.8 Future Enhancements

Probability curves per peril

Multi-year compounding models

Behavioral nudging engine

“You chose do-nothing last year—here’s what changed”

Portfolio-wide impact scoring

6. Cross-Tool Architecture Principles

All four tools follow:

Snapshot persistence

Versioned inputsSnapshot

Json explainability

Queryable numeric summary fields

STALE state management

Deterministic heuristics

Calm UX (max 3–7 outputs per section)

7. Inter-Tool Synergy
Tool	Feeds Into
Replace or Repair	Capital Timeline, Do-Nothing
Risk-to-Premium	Do-Nothing
Capital Timeline	Replace/Repair prioritization
Do-Nothing	Risk & Replace escalation
8. Strategic Positioning

Together these tools create:

Decision intelligence

Cost foresight

Risk realism

Behavioral clarity

Competitive differentiation:

Most home apps track.

Contract-to-Cozy predicts, simulates, and optimizes.

9. Versioning

Initial release:

Version 1 heuristics

Deterministic logic

Conservative cost bands

No external API dependencies

Future versions:

ML-assisted refinements

Regional cost multipliers

Confidence calibration via outcomes