# Quote Comparison Skill

## Purpose

Create a governed quote workspace and compare recorded bids, estimates, and proposals.

## Select this Skill when

- Create a quote comparison workspace
- Compare my contractor bids
- Which estimate is best?
- Review my quotes and estimats

## Do not select this Skill when

- Select, contact, or hire a contractor without homeowner confirmation

## Operations

- `QUOTE_COMPARISON_CREATE`
- `QUOTE_COMPARISON_REVIEW`

## Consumers

- ASK: QUOTE_COMPARISON_CREATE, QUOTE_COMPARISON_REVIEW

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

This document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, providers, and canonical services control execution.
