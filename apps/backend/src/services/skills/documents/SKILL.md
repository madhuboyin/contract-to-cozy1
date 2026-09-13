# Documents Skill

## Purpose

Look up uploaded documents on file for this home -- inspection reports, estimates, invoices, contracts, permits, and other records -- grouped by type and verification status.

## Select this Skill when

- Show my documents
- What documents do I have for this property?
- List my documents by type
- How many documents do I have on file?

## Do not select this Skill when

- Which facts extracted from my uploaded files are waiting on me? (document-promotion Skill -- pending extraction candidates, not the document vault itself)
- Show my appliance inventory (property-record Skill)

## Operations

- `DOCUMENT_LOOKUP`

## Consumers

- ASK: DOCUMENT_LOOKUP

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.

This document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, providers, and canonical services control execution.
