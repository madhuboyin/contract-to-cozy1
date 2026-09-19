# Property Intelligence, Environment & Event Radar

[Library home](README.md) · [Flags](FLAGS.md)

20 documents. Flag key: 🔴 conflicting/superseded · 🟠 status lags reality or cites missing code · 🟡 historical snapshot. Blank = no issue found (not proof it is current - check *Last changed*).

## Requirements (FRD/PRD) (2)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Environment Report — Functional Requirements Document](../functional/ENVIRONMENT_REPORT_FRD.md) | v1.4 · Implemented, including property-aware preparation and governed long-term hazard  | 2026-09-03 | 1430 |
| 🟠 C4 | [Home Event Radar — Functional Requirements Document](../functional/HOME_EVENT_RADAR_FRD.md) | v1.0 · Proposed \| | 2026-07-27 | 1673 |

## ADR (decision) (3)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [ADR: Home Event Radar Insurance-Market Source](../architecture/adr-home-event-radar-insurance-source.md) | Accepted no-go; category remains unavailable \| | 2026-07-27 | 285 |
|  | [ADR: Home Event Radar Utility-Outage Source](../architecture/adr-home-event-radar-utility-source.md) | Accepted; integration and commercial activation pending \| | 2026-07-27 | 229 |
|  | [ADR — Home Event Radar Canonical Signal Pipeline](../architecture/adr-home-event-radar-canonical-pipeline.md) |  | 2026-07-26 | 102 |

## Plan (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Home Event Radar — Comprehensive Implementation Plan](../functional/HOME_EVENT_RADAR_IMPLEMENTATION_PLAN.md) | v1.0 · In progress — launch acceptance and observability baseline implemented \| | 2026-07-27 | 2388 |

## Feature reference (10)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Home Event Radar](../functional/HOME_EVENT_RADAR.md) |  | 2026-08-06 | 1297 |
|  | [Around Your Home](../functional/NEIGHBORHOOD_CHANGE_RADAR.md) |  | 2026-07-31 | 109 |
|  | [NYC ZAP Property Intelligence Provider](../functional/NYC_ZAP_PROPERTY_INTELLIGENCE_PROVIDER.md) |  | 2026-07-31 | 104 |
|  | [Home Briefing](../functional/HOME_GAZETTE.md) |  | 2026-07-30 | 168 |
| 🟠 C15 | [Past Hazard Exposure](../functional/HOME_RISK_REPLAY.md) |  | 2026-07-30 | 1194 |
|  | [Knowledge Hub](../functional/KNOWLEDGE_HUB.md) |  | 2026-07-30 | 880 |
|  | [Property Brief Functional Contract](../functional/PROPERTY_BRIEF.md) | Slice 8 governed-sharing foundation | 2026-07-30 | 90 |
|  | [Property Intelligence Legacy Retirement](../functional/PROPERTY_INTELLIGENCE_LEGACY_RETIREMENT.md) |  | 2026-07-30 | 62 |
|  | [Property Intelligence Unified Experience](../functional/PROPERTY_INTELLIGENCE_UNIFIED_EXPERIENCE.md) |  | 2026-07-30 | 96 |
|  | [PRD: P2.2 – Recall & Safety Alerts](../functional/RECALL_SAFETY_ALERTS.MD) |  | 2026-01-07 | 284 |

## Audit / analysis (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
| 🟠 C9 | [Property Intelligence and Briefings Capability Audit and Implementation Plan](../product/PROPERTY_INTELLIGENCE_AND_BRIEFINGS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | Recommended implementation plan<br> | 2026-08-01 | 1701 |

## Status / phase record (2)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Property Intelligence Launch Governance](../functional/PROPERTY_INTELLIGENCE_LAUNCH_GOVERNANCE.md) |  | 2026-07-31 | 163 |
| 🟠 C7 | [Property Intelligence — Phase 1 Recommendation (Free Public Sources)](../property-context/PROPERTY_INTELLIGENCE_PHASE1_RECOMMENDATION.md) | v2.0 · Recommendation — not yet approved for implementation | 2026-07-26 | 250 |

## Runbook / ops (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Home Event Radar Test Fixtures](../operations/HOME_EVENT_RADAR_TEST_FIXTURES.md) |  | 2026-07-26 | 73 |

## Flag details for this area

- 🟠 **functional/HOME_EVENT_RADAR_FRD.md** - Status still "Proposed" while the Implementation Plan says "In progress - launch acceptance implemented" and 2 of the 3 Home Event Radar ADRs are Accepted.
- 🟠 **functional/HOME_RISK_REPLAY.md** - Top banner (2026-07-30) says the feature is now "Past Hazard Exposure"; the 1,194-line body still describes the old design and all 4 cited worker provider files are gone. Banner-only reconciliation.
- 🟠 **product/PROPERTY_INTELLIGENCE_AND_BRIEFINGS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md** - Status "Recommended implementation plan" never advanced. Project memory says Home Continuity is fully on main (not re-verified in code here); sibling audits with the same header (Tax, Coverage, Ownership Cost) were updated to "Implemented".
- 🟠 **property-context/PROPERTY_INTELLIGENCE_PHASE1_RECOMMENDATION.md** - "Not yet approved" (Jul 26) but functional/PROPERTY_INTELLIGENCE_*, NYC_ZAP and PROPERTY_BRIEF (Jul 30-31) look like its follow-through.
