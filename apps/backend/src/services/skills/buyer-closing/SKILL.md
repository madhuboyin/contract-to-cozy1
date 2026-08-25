# Buyer & Closing Skill

## Purpose

Track and progress an active home purchase from contract through closing — deadlines, documents, inspection findings, financing, title/escrow, walkthrough, and closing-day readiness.

## Select this Skill when

- What's the status of my buyer plan?
- What deadlines are coming up on my home purchase?
- Are my closing documents ready?
- What did the inspection find?
- Create a task to schedule my home inspection
- Mark my financing task complete
- Am I ready for the walkthrough?
- Am I ready to close?

## Do not select this Skill when

- Guarantee that this purchase will close on time
- Approve my mortgage application

## Operations

- `BUYER_PLAN_STATUS`
- `BUYER_DEADLINES`
- `BUYER_DOCUMENT_READINESS`
- `BUYER_INSPECTION_REVIEW`
- `BUYER_TASK_COMPLETE`
- `BUYER_TASK_CREATE`
- `BUYER_TASK_UPDATE`
- `BUYER_MOVE_STATUS`
- `BUYER_FINANCING_READINESS`
- `BUYER_TITLE_ESCROW_READINESS`
- `BUYER_WALKTHROUGH_READINESS`
- `BUYER_DISCLOSURE_FUNDS_READINESS`
- `BUYER_CLOSING_DAY_READINESS`
- `BUYER_CONTRACT_TIMELINE`
- `BUYER_NEGOTIATION_READINESS`
- `BUYER_COST_READINESS`
- `BUYER_FINDING_DISPOSITION`
- `BUYER_LIFECYCLE_UPDATE`

## Consumers

- ASK: all operations above

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

This document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, providers, and canonical services control execution.
