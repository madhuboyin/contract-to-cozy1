# Personalization USP showcase and limited-user validation strategy

**Status:** Recommended next product slice before full Phase 3 learning or
Phase 4 graph intelligence

**Context:** ContractToCozy has no real users yet, and acquiring a statistically
useful population may take time. Personalization must still be demonstrable as
a product differentiator without presenting speculative learning or graph
infrastructure as proven intelligence.

## Decision

Introduce a focused **Phase 2.5 — USP showcase and limited-user validation**.
Demonstrate strong contextual and explicit personalization using the existing
deterministic engine, reviewed catalog, shared recommendation lifecycle,
optional-profile consent, action conversion and context-transparency facade.

Do not build automated learning, inferred-trait machinery, retained household
history, simulations, graph extraction or a graph database before real-user
evidence establishes a concrete need.

## What “personalization” means at this stage

ContractToCozy can provide three increasingly advanced kinds of
personalization:

1. **Contextual personalization:** guidance based on the selected property's
   systems, assets, risks, maintenance history, location and current condition.
2. **Explicit personalization:** ranking or guidance informed by optional goals
   and preferences that the owner deliberately provides.
3. **Adaptive personalization:** behavior-based learning across users and time.

The USP showcase should prove the first two now. Adaptive personalization is a
future Phase 3 capability and must not be implied before it is validated.

## Current product gap

The initial HVAC-filter, smoke/CO-battery and dryer-vent definitions prove the
technical lifecycle but are too narrow by themselves to communicate a broad
personalization advantage. The near-term gap is a small set of valuable,
reviewed homeowner journeys and visible explanations—not a learning model or
graph database.

## Phase 2.5 goals

- Make different homes produce visibly different, relevant priorities.
- Explain which property or optional-profile facts caused each result.
- Show a useful action and one authoritative recommendation lifecycle.
- Demonstrate the same recommendation consistently across Personalization,
  Dashboard, Maintenance and Property Health.
- Show an immediate, understandable benefit when an owner optionally improves
  recommendations with consented profile information.
- Collect credible relevance, trust and task-outcome evidence from a small
  number of design partners.
- Preserve all current safety, privacy, authorization, review and rollback
  boundaries.

## Non-goals

- Population-level behavioral learning or automated tuning.
- Experiment assignment, holdout, inference or model-registry schema.
- Autonomous rule, copy or recommendation generation.
- Retained household event history or life-transition modeling.
- Causal claims that are not proven by deterministic rule dependencies.
- Scenario simulation, graph extraction or a graph database.
- Statistical claims based on an underpowered sample.

## Candidate deterministic journeys

Select approximately six to ten journeys only after confirming that the
required source facts and authoritative action paths already exist. Candidates
include:

| Candidate journey | Context used | User value | Likely action surface |
|---|---|---|---|
| Home-specific maintenance priorities | assets, service dates, home systems | understand what needs attention first | Maintenance |
| Safety and risk-reduction plan | detectors, safety equipment, inspections, incidents | reduce preventable household risk | Maintenance / Property Health |
| Seasonal preparation | property characteristics, climate/season, relevant assets | prepare the home at the right time | Maintenance |
| Aging system and replacement planning | system age, condition, service history | anticipate major work before failure | Property Health |
| Warranty and service-history opportunity | warranty, asset and prior-service records | avoid unnecessary cost and missed coverage | Maintenance / warranties |
| Energy-efficiency priorities | home systems, climate and existing efficiency facts | focus on practical efficiency improvements | Property Health |
| Seller-preparation guidance | property condition, open work and sale intent | prioritize work that supports a future sale | Seller Prep |
| Inspection or insurance follow-up | inspection findings, coverage facts and open actions | close important documentation or risk gaps | Property Health / insurance |
| Optional aging-in-place priorities | explicit owner goal plus property accessibility facts | surface relevant long-term improvements | Personalization / Maintenance |
| Optional budget-sensitive ordering | explicit preference applied only among equally useful options | emphasize practical lower-cost actions | Personalization / Maintenance |

These are candidates, not catalog commitments. Every implemented definition
requires a reliable source fact, domain owner, reviewed rule, reviewed copy,
safety classification, explanation and supported action or destination.

## Explanation experience

Every showcase recommendation should make personalization observable. The UI
should answer:

- Why is this relevant to this home?
- Which facts were used?
- Was each fact property-derived or explicitly provided?
- What information is unknown or missing?
- What action should the homeowner take?
- Where can the homeowner correct the underlying information?

Example pattern:

> Recommended because this home's HVAC system was last serviced 14 months ago
> and the recorded system uses forced-air filtration.

Explanations must use reviewed templates and bounded evidence. They must never
expose raw optional-profile payloads, database identifiers, private comments or
unreviewed causal claims.

## Optional-profile before-and-after demonstration

Basic property guidance remains available before consent. When an owner chooses
**Improve my recommendations**, the product should visibly explain any permitted
change:

- A long-term-home goal may prioritize durability, preventive maintenance or
  accessibility-related guidance.
- A lower-cost preference may reorder equally useful non-safety options.
- An optional answer may add a relevant reviewed definition when the rule
  explicitly depends on that answer.

Safety recommendations and eligibility floors must never be reduced by budget,
engagement or lifestyle preferences. The UI should distinguish property facts
from optional owner-provided facts and provide correction/reset controls.

## Demonstration properties

Maintain a production-isolated, clearly labeled demonstration dataset with
several property archetypes, for example:

- an older home with overdue systems;
- a newer energy-efficient home;
- a storm-prone property;
- a property preparing for sale;
- a long-term aging-in-place property; and
- a budget-conscious maintenance property.

The same application and reviewed evaluator should produce different results
for each archetype. Demo fixtures must not create fake production engagement,
feedback, learning or outcome history. They should be safe to recreate and
must never be presented as real-user evidence.

The focused tranche's UI-only setup procedure is documented in
[Phase 2.5 demo data setup through the UI](phase2-5-demo-data-setup.md).

## Cross-module proof

A recommendation has one definition, rule/content version, explanation,
status and action history. Personalization, Dashboard, Maintenance and Property
Health consume the same shared DTO instead of copying eligibility logic.

The showcase should verify that:

1. the same recommendation title and summary appear consistently;
2. the detailed explanation remains available from the authoritative surface;
3. supported Maintenance conversion creates at most one task;
4. feedback and completion update the shared recommendation lifecycle; and
5. pause, retirement and the global kill switch hide stored output everywhere.

## Connected-intelligence presentation

Use the existing owner-only context map to explain how ContractToCozy connects
current facts:

```text
Property fact
  -> derived signal
    -> reviewed recommendation
      -> homeowner action
```

The current graph-shaped API is sufficient for this proof. A compact,
explainable list or trace is preferred to a graph canvas while the fact set is
small. Optional household facts appear only after profile consent. The product
must not claim that a relationship is causal unless deterministic rule
dependencies prove it.

## Limited-user validation

Use approximately five to ten design partners, with repeated sessions where
possible. The purpose is qualitative product validation and data-quality
learning, not statistically significant optimization.

### Suggested session protocol

1. Confirm or enter enough property facts to support known journeys.
2. Show generic homeowner guidance as a comparison baseline.
3. Show ContractToCozy's property-specific top recommendations.
4. Ask the participant to explain what appears relevant, incorrect or missing.
5. Review the explanation and correction experience.
6. Optionally enable the household profile and compare the before/after result.
7. Complete or simulate one supported action.
8. Repeat after new facts or completed work to test lifecycle behavior.

A domain expert may review early outputs as a disclosed concierge-quality
check. The production evaluator remains deterministic; expert involvement must
not be misrepresented as automated learning.

## Evidence to collect

For a small sample, prioritize direct usefulness and trust evidence:

- percentage of top-three recommendations judged relevant;
- time to the first useful recommendation;
- acceptance or task-conversion rate;
- task completion where enough time passes;
- not-relevant, wrong-details and bad-timing reasons;
- property/profile correction rate;
- explanation clarity and trust rating;
- perceived time saved;
- whether different properties receive meaningfully different guidance; and
- whether optional-profile answers visibly improve relevance.

Use within-person comparisons—generic guidance versus property-specific
guidance—rather than an underpowered population A/B test. The existing
20-decision threshold remains a manual review and data-quality gate, not a
statistical learning threshold.

## Credible product claims

The product may say:

- “ContractToCozy creates explainable guidance from your home's actual
  condition, systems, history and priorities.”
- “Your guidance remains consistent across the product.”
- “Optional goals can improve recommendations without withholding basic
  property guidance.”

The product must not yet claim:

- automatic learning from homeowner behavior;
- proven population-level outcome improvement;
- predictive graph intelligence or life-transition forecasting;
- statistically validated experiment lift; or
- accurate inferred household traits.

## Technical and data boundaries

- Reuse the current recommendation, rule, content, evaluation, feedback,
  suppression, action, audit, property-trait and optional-profile entities.
- Keep module routing and supported actions as reviewed code-owned metadata.
- Prefer catalog/rule/content additions over new infrastructure.
- Create no migration scripts or backfills for this phase.
- Avoid new learning, experiment, inference, history or graph schema until an
  approved evidence-backed requirement exists.
- Keep demo fixtures separate from production bootstrap data.
- Require MFA-protected audited activation and explicit confirmation for safety-sensitive rules. Defer a true two-session author/reviewer workflow until UI authoring or real-user risk justifies it.
- Preserve owner-only access to optional-profile facts and mixed context.

## Phase 2.5 exit criteria

Phase 2.5 is complete when:

- at least three demonstration archetypes produce materially different,
  explainable top recommendations;
- a focused reviewed catalog supports several high-value homeowner journeys;
- property guidance provides value without optional-profile consent;
- optional-profile enablement produces an understandable, policy-compliant
  improvement where reviewed rules support it;
- shared placements show consistent recommendation state and explanation;
- supported actions remain idempotent;
- design partners can understand why guidance is relevant and how to correct
  facts; and
- collected evidence identifies the next catalog, UX or data-quality change
  without claiming population-level learning.

## Transition to Phase 3 learning

Begin a full learning slice only when:

- real-user decisions form a sufficiently large, reasonably unbiased sample;
- event and attribution definitions are stable;
- a specific decision cannot be solved adequately with reviewed deterministic
  policy;
- a primary metric, safety floors, evaluation design, owner and rollback are
  declared in advance; and
- privacy/ethics approval exists for the proposed signals and inference.

## Transition to Phase 4 graph intelligence

Extend beyond the current context facade only when:

- at least three high-value multi-hop journeys are observed in real use;
- source data and relationship meaning are trustworthy;
- retention, consent and deletion behavior are approved;
- the required decision cannot be explained adequately by the current
  relational facade; and
- PostgreSQL benchmarks demonstrate the actual query or scale constraint before
  a graph database is considered.

Graph intelligence does not imply a graph database. PostgreSQL remains the
preferred store when it satisfies the validated journeys and operational
requirements.
