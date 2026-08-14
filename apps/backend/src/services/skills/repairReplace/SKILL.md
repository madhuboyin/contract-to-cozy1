# Repair or Replace Skill

## Purpose

Help homeowners evaluate whether to repair or replace a recorded appliance or home system and continue the decision through scenarios, preferences, recommendation changes, and reported outcomes.

## Select this Skill when

- the homeowner asks whether a recorded system should be repaired or replaced;
- the homeowner wants to continue or abandon an HVAC repair-or-replace Decision Thread;
- a new quote should be evaluated as an isolated scenario;
- the homeowner explicitly saves or revokes a supported decision preference; or
- the homeowner reports, reviews, or disputes a repair-or-replace outcome.

## Do not select this Skill when

- the request is routine maintenance status, scheduling, or task completion;
- the homeowner wants a long-term capital reserve across multiple systems;
- no repair-or-replace decision is being requested; or
- the request asks for a professional diagnosis, safety certification, or guaranteed financial result.

## Operations

- `REPLACEMENT_GUIDANCE`
- `HVAC_DECISION_START`
- `HVAC_DECISION_CONTINUE`
- `HVAC_DECISION_SCENARIO`
- `HVAC_DECISION_ABANDON`
- `HVAC_PREFERENCE_SAVE`
- `HVAC_PREFERENCE_FORGET`
- `HVAC_DECISION_OUTCOME_REPORT`
- `HVAC_DECISION_OUTCOME_VIEW`
- `HVAC_DECISION_OUTCOME_UNLINK`

## Canonical ownership and boundaries

Generic recorded-item analysis remains owned by Inventory and `ReplaceRepairService`. Durable HVAC decisions, scenarios, preferences, Recommendation Snapshots, and outcomes remain owned by the Decision Platform. The Skill adds grouping and effective policy; it does not create another decision engine or record store.

Viewer access permits registered reads. Contributor or Owner access is required for decision, scenario, preference, abandonment, and outcome mutations. Existing confirmation, freshness, idempotency, scenario-isolation, and professional-boundary contracts remain authoritative.

This document provides semantic guidance only. The machine manifest, operation registry, Decision Platform contracts, adapters, and canonical services control execution.
