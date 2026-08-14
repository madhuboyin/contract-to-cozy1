# Property Record Skill

## Purpose

Help authorized household members understand the selected home record and find recorded appliances, systems, and inventory details.

## Select this Skill when

- the homeowner asks for a summary or completeness view of the selected home record;
- the homeowner asks what is recorded about a named appliance or system; or
- an approved consumer needs the same bounded, canonical read capability.

## Do not select this Skill when

- the homeowner asks what action should be prioritized next;
- the request is a repair-or-replace, coverage, maintenance, or financial analysis;
- the request concerns a different or unauthorized property; or
- the homeowner asks for proof that an unrecorded fact is absent or a system is safe.

## Operations

- `PROPERTY_SUMMARY`
- `INVENTORY_LOOKUP`

## Consumers

- Ask may use both operations.
- Concierge Home may discover both operations.
- Home Actions may discover Property Summary only; it cannot broaden this Skill into arbitrary inventory access.

## Canonical ownership and boundaries

Property summary and inventory reads remain owned by their existing canonical services. This Skill does not copy property data, create a second navigation catalog, or infer facts from missing records. Every execution must reapply current property authorization.

This document provides semantic guidance only. The machine manifest, operation registry, consumer policy, adapters, and canonical services control execution.
