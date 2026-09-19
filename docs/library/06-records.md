# Home Records, Maintenance & Digital Twin

[Library home](README.md) · [Flags](FLAGS.md)

14 documents. Flag key: 🔴 conflicting/superseded · 🟠 status lags reality or cites missing code · 🟡 historical snapshot. Blank = no issue found (not proof it is current - check *Last changed*).

## Requirements (FRD/PRD) (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
| 🟠 C2 | [Smart Home / IoT Sensor Integration — Functional Requirements Document](../functional/SMART_HOME_IOT_INTEGRATION_FRD.md) |  | 2026-07-07 | 781 |

## Feature reference (7)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Contract-to-Cozy](../functional/HOME_DIGITAL_TWIN.md) | P0–P2 implementation complete as of July 28, 2026. Section 7 | 2026-07-28 | 352 |
|  | [Home Tools — Functional Requirements Document (FRD)](../functional/HOME_TOOLS.md) | v1.1 | 2026-07-28 | 632 |
|  | [ROOMS_EXPERIENCE.md](../functional/ROOMS_EXPERIENCE.md) | Implemented (v1), extensible | 2026-07-23 | 430 |
|  | [Household Collaboration Layer](../functional/HOUSEHOLD_COLLABORATION.md) |  | 2026-06-27 | 625 |
| 🔴 C2 | [Smart Home Integration Hub](../functional/SMART_HOME_INTEGRATION_HUB.md) |  | 2026-06-27 | 1124 |
| 🟡 | [Executive Summary — Home Timeline](../functional/ES_HOME_TIMELINE.md) |  | 2026-01-16 | 88 |
| 🟡 | [Functional Requirements Document (FRD)](../functional/HOME_TIMELINE.md) |  | 2026-01-16 | 255 |

## Audit / analysis (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Home Digital Twin Capability Audit and Implementation Plan](../product/HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | P0–P2 gap register implemented July 28, 2026. Remaining future work is limited t | 2026-07-28 | 1759 |

## Status / phase record (5)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
| 🟠 C11 | [Contract to Cozy - Seasonal Maintenance Feature Handoff Document](../functional/SEASONAL_MAINTENANCE_HANDOFF.md) | 🟢 Canonical Home integration implemented; historical sections retained for subsy | 2026-07-20 | 1874 |
|  | [Inspection Report Intelligence](../functional/INSPECTION_REPORT_INTELLIGENCE.md) |  | 2026-06-28 | 459 |
| 🟠 C15 | [Home Material Specification Registry](../functional/MATERIAL_SPEC_REGISTRY.md) |  | 2026-06-27 | 708 |
|  | [Permit History & Unpermitted Work Tracker](../functional/PERMIT_HISTORY_TRACKER.md) |  | 2026-06-27 | 1210 |
| 🔴 C11 | [CONTRACT TO COZY - SEASONAL MAINTENANCE FEATURE CONTEXT](../functional/SEASONAL_FEATURE_SESSION_PROMPT.md) |  | 2026-01-03 | 668 |

## Flag details for this area

- 🟠 **functional/MATERIAL_SPEC_REGISTRY.md** - Route exists in code but many cited frontend/worker files do not (14/24 and 3/8): implementation moved or partial. Verify before relying on file-level detail.
- 🔴 **functional/SEASONAL_FEATURE_SESSION_PROMPT.md** - A session prompt, not a spec; untouched since Jan 3. Cites deleted checklistItem controller/component.
- 🟠 **functional/SEASONAL_MAINTENANCE_HANDOFF.md** - Body predates the deprecated ChecklistItem -> PropertyMaintenanceTask consolidation; 3 cited files deleted. Header notes "canonical Home integration implemented; historic..."
- 🔴 **functional/SMART_HOME_INTEGRATION_HUB.md** - Superseded by SMART_HOME_IOT_INTEGRATION_FRD.md (stated in that FRD, not in this file). 28/33 cited code paths do not exist.
- 🟠 **functional/SMART_HOME_IOT_INTEGRATION_FRD.md** - No status line; 18/27 cited code paths (smartHome routes/services) do not exist and no smart-home route/page found in code - appears unimplemented.
