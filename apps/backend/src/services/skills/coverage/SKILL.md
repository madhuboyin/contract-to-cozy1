# Coverage Skill

## Purpose

Review recorded warranty and insurance coverage gaps and evidence readiness, and check how your current insurance policy compares to alternative quotes or terms.

## Select this Skill when

- Which items have missing coverage?
- Show coverage gaps for my appliances
- What is uncovered in my home?
- Show missing coverage for my applicances
- What's my coverage comparison status?
- Should I switch my home insurance?
- Compare my current insurance policy against alternatives

## Do not select this Skill when

- Confirm definitively that an insurance claim will be covered
- Compare these contractor bids

## Operations

- `COVERAGE_GAPS`
- `COVERAGE_COMPARISON_STATUS`

## Consumers

- ASK: COVERAGE_GAPS, COVERAGE_COMPARISON_STATUS

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

This document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, providers, and canonical services control execution.
