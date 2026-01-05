📦 ContractToCozy — Inventory & Coverage
Functional + Technical Design Document (V1)
1. Overview
Objective

The Inventory and Coverage features form a foundational layer of ContractToCozy that enables:

Accurate tracking of home assets & valuables

Document-driven ownership proof

Automated detection of coverage gaps

Insurance readiness (claims + quotes)

Tight integration with Action Center orchestration

Inventory is now a core navigation item in the dashboard.

Coverage is a derived intelligence layer surfaced via actions, badges, and contextual modals (not yet a top-level page).

2. Inventory Feature — Functional Scope
2.1 Core Capabilities

Create and manage Inventory Rooms

Create, update, and view Inventory Items

Attach documents (receipts, warranties, manuals)

Store financial metadata:

Purchase cost

Replacement cost

Currency

Link inventory items to:

HomeAsset (system-level assets)

Warranty

Insurance Policy

2.2 Inventory UX Surfaces
A. Navbar

Inventory added as a top-level navigation item

Signals inventory as a foundational feature

B. Inventory List Page

Grid/list of InventoryItemCard

Top actions:

Add item

Export CSV (insurance-ready)

Coverage gap banner (planned enhancement)

Room-based organization

C. Inventory Item Card

Item name, category, room

Replacement value

Document count indicator

Warranty / Insurance pills

Coverage Gap badge (if missing warranty or insurance)

D. Inventory Item Drawer

Item details

Warranty & Insurance dropdowns

Documents section:

Upload

Auto-attach

View / unlink

Coverage status & actions:

“Get insurance quotes”

“What’s covered?”

3. Coverage Feature — Functional Scope

Coverage is derived, not manually created.

3.1 Coverage Types

Warranty coverage

Insurance coverage

3.2 Coverage Gap Detector (V1)

Automatically identifies high-value inventory items with:

No coverage

Partial coverage

Expired coverage

High-value threshold (V1):

Replacement cost ≥ $1,500

3.3 Coverage Gap Surfacing
Surface	Status
Action Center	✅ Implemented
Inventory Item Card badge	✅ Implemented
Inventory Item Drawer	✅ Implemented
Inventory page banner	⏳ Pending
Coverage summary page	⏳ Pending
4. Action Center Integration

Coverage gaps are injected into orchestration as derived risk actions.

Action Characteristics

Stable actionKey: COVERAGE_GAP::<inventoryItemId>

Priority:

HIGH → No coverage

MEDIUM → Partial / expired coverage

CTAs:

Get insurance quotes

What’s covered?

Suppression

Fully integrated with existing:

Snoozes

User-completed actions

Checklist suppression

Maintenance task suppression

5. Insurance Quote Flow (Coverage → Action)
Functional Flow

Coverage gap action shown

User clicks Get insurance quotes

Modal opens (prefilled context)

User submits request

InsuranceQuoteRequest record created

Optional notification triggered

Purpose

Internal lead pipeline

No paid APIs

Future monetization hook

6. “What’s Covered?” Explanation
Purpose

Educate users clearly on:

What warranty covers

What insurance covers

Why both matter

Current coverage status per item

Data Sources

Warranty.coverageDetails

InsurancePolicy fields

Active/expired status

7. Document Intelligence (Inventory + Coverage)
Capabilities

Upload & analyze documents

Extract:

Product name

Brand

Model

Serial number

Auto-create Warranty (when detected)

Auto-attach document to inventory item

AI Asset Mapping

Suggests matching:

InventoryItem

HomeAsset

Confidence scoring with explanation

User-controlled (no forced auto-linking)

8. Inventory Export (Insurance-Ready)
Export Type

CSV (V1)

Includes

Room

Item metadata

Costs

Warranty & Insurance details

Attached document names

Use Cases

Insurance claims

Adjuster communication

Backup documentation

9. Data Model Changes
New Tables
inventory_rooms

propertyId

name

floorLevel

sortOrder

inventory_items

propertyId

roomId

homeAssetId

warrantyId

insurancePolicyId

name

category

condition

brand

model

serialNo

purchaseCostCents

replacementCostCents

currency

notes

tags

insurance_quote_requests

homeownerProfileId

propertyId

inventoryItemId

source

gapType

exposureCents

contact preferences

status

Updated Relations

InventoryItem ↔ Warranty

InventoryItem ↔ InsurancePolicy

InventoryItem ↔ HomeAsset

InventoryItem ↔ Document

10. Backend Files Added / Updated
New

coverageGap.service.ts

insuranceQuote.routes.ts

Updated

orchestration.service.ts

document.routes.ts

Inventory routes (export endpoint)

Prisma schema

11. Frontend Files Added / Updated
Inventory

InventoryClient.tsx

InventoryItemCard.tsx

InventoryItemDrawer.tsx

Coverage

InsuranceQuoteModal.tsx

WhatsCoveredModal.tsx

Navigation

Dashboard navbar (Inventory added)

12. Pending Features (Next Logical Steps)
High Priority

Inventory page Coverage Gap banner + filter

Coverage summary page (Inventory → Coverage tab)

PDF export for insurance claims

Medium Priority

Coverage confidence scoring

Coverage gap trend over time

Bulk coverage review

Low Priority

Auto-create inventory item from document

Insurance provider marketplace integration

Claim pre-fill workflows

13. Architectural Principles Followed

No paid APIs

Deterministic AI (explainable)

Orchestration-driven actions

Document-first intelligence

Inventory as system-of-record