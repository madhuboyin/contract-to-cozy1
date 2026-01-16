Functional Requirements Document (FRD)
Feature: Rooms Experience

Product: Contract-to-Cozy
Status: Implemented (v1), extensible
Last Updated: 2026-01-15

1. Purpose & Scope

The Rooms Experience provides a structured, room-centric layer on top of inventory, maintenance, and insights. It enables homeowners to:

Understand each room’s condition and readiness

Maintain lightweight, recurring micro-checklists

Capture room-specific context without rigid schemas

Surface explainable, rule-based insights (no AI dependency)

Build a consistent maintenance rhythm across the home

This feature intentionally avoids “admin dashboard” complexity and instead emphasizes calm, contextual, habit-forming UX.

2. Goals & Non-Goals
2.1 Goals

Provide a canonical room abstraction across inventory, checklists, and timelines

Support common residential room types out-of-the-box

Store room-specific data flexibly via JSON profiles

Offer default checklists to reduce setup friction

Compute explainable room health scores using simple signals

Maintain a consistent “Apple Reminders”-style UI

2.2 Non-Goals

No AI-generated insights (rule-based only)

No hard DB schema per room subtype

No gradients, charts, or dense dashboards

No automation scheduling (future phase)

No legacy room pages expansion

3. User Personas
Primary

Homeowner (Owner-Occupied)
Wants peace of mind, simple maintenance cues, and clarity.

Secondary

Homebuyer / Inspector (Future)
Wants room-by-room readiness snapshots.

4. Canonical Room Types
4.1 Supported Room Types (Enum)
KITCHEN
LIVING_ROOM
BEDROOM
BATHROOM
DINING
LAUNDRY
GARAGE
OFFICE
BASEMENT
OTHER

4.2 Subtyping Rules

Subtypes are stored only in room.profile JSON

No additional Prisma enums are created for subtypes

Example:

{
  "bedroomKind": "MASTER"
}

5. Information Architecture
5.1 Routes (Canonical)
Purpose	Route
Rooms Hub	/dashboard/properties/[id]/rooms
Room Showcase	/dashboard/properties/[id]/rooms/[roomId]
Room Detail (Profile / Checklist / Timeline)	/dashboard/properties/[id]/inventory/rooms/[roomId]

Legacy pages (RoomsClient.tsx, etc.) are out of scope.

6. Core Components & Responsibilities
6.1 RoomsHubClient

Responsibilities

List all rooms for a property

Auto-detect room type from name

Persist detected type via patchRoomMeta

Detection Priority

room.type (source of truth)

Name-based fallback

6.2 RoomDetailClient

Responsibilities

Resolve effective room type

Render:

Profile Form

Checklist Panel

Timeline

Insights Card

Health Score Ring

Coordinate data loading + saving

Tabs

PROFILE

CHECKLIST

TIMELINE

6.3 RoomProfileForm

Purpose
Capture lightweight, room-specific context.

Rules

Stored entirely in room.profile JSON

No validation beyond basic UX

Optional fields only

Save-on-demand

Examples

Kitchen: countertops, vent hood

Bedroom: bedroomKind

Laundry: washer type, venting

Basement: humidity control, sump pump

6.4 RoomChecklistPanel

Purpose
Enable habit-forming micro-maintenance.

Features

CRUD checklist items

Status toggling

Frequency tagging

Default seeding per room type

Default Seeding UX

Appears only when checklist is empty

“Add recommended checklist (3–6 items)”

Idempotent (no duplicates)

Editable after insertion

Allowed Frequencies

ONCE | WEEKLY | MONTHLY | QUARTERLY | SEASONAL

6.5 RoomTimeline

Purpose
Unified chronological view of:

Maintenance tasks

Incidents

Room-scoped events

Notes

Events only appear if linked via roomId

Read-only in current phase

6.6 Insights Cards

Design Principles

White cards

Grouped list layout

Chips for highlights

Max 3 “Quick Wins”

Rule-based logic only

Cards Implemented

KitchenInsightsCard

LivingRoomInsightsCard

BedroomInsightsCard

DiningInsightsCard

LaundryInsightsCard

GarageInsightsCard

OfficeInsightsCard

BathroomInsightsCard

BasementInsightsCard

6.7 RoomHealthScoreRing

Purpose
Summarize room readiness as a simple score (0–100).

Inputs

Inventory item count

Linked documents

Coverage gaps

Profile completion

Room-specific safety signals

Rules

Fully explainable

No backend dependency

Light weighting (nudges, not judgments)

7. Functional Requirements (Detailed)
FR-1 Room Type Resolution

System MUST prefer room.type

MUST fallback to name matching

MUST handle unknown names as OTHER

FR-2 Profile Storage

MUST store all data in room.profile

MUST NOT require schema migration for new fields

MUST support partial completion

FR-3 Checklist Defaults

MUST provide room-specific recommended sets

MUST avoid duplicate insertion

MUST allow user modification post-seed

FR-4 Insights Generation

MUST be deterministic

MUST not call AI services

MUST use profile + known signals only

FR-5 Health Score

MUST be recomputable client-side

MUST clamp between 0–100

MUST explain score via sublabel text

FR-6 UX Consistency

MUST use:

rounded-2xl

border border-black/10

bg-white

grouped lists (bg-black/[0.02])

MUST avoid gradients, charts, dense tables

8. Default Checklist Templates (Summary)
Room	Examples
Kitchen	Clean hood filter, check under-sink
Bedroom	Change sheets, dust vents
Laundry	Clean lint trap, check hoses
Garage	Test door auto-reverse, organize chemicals
Bathroom	Check leaks, test GFCI
Basement	Moisture check, sump pump test
Office	Cable tidy, dust electronics
Dining	Wipe table, inspect chairs
9. Error Handling & Edge Cases

Missing room.profile → treated as empty object

Unknown room.type → rendered as OTHER

Checklist API failure → non-blocking UI

Profile save failure → retry allowed

10. Security & Data Integrity

All mutations scoped by propertyId

Room access enforced via backend auth

No sensitive data stored in profile JSON

11. Extensibility & Future Enhancements
Planned

Room Showcase quick wins summary for all room types

Template-as-data (config-driven checklists)

Seasonal reminders & scheduling

Smart home signal ingestion

AI-assisted insights (optional, gated)

Explicitly Supported

Adding new room types with:

Enum entry

Profile section

Insights card

Checklist defaults

12. Success Metrics (Qualitative)

Time-to-first-checklist < 30s

Reduced “empty room” states

Increased recurring checklist usage

Positive user feedback on clarity + calmness

13. Appendix
A. Files In Scope (Frontend)

RoomDetailClient.tsx

RoomsHubClient.tsx

RoomProfileForm.tsx

RoomChecklistPanel.tsx

RoomTimeline.tsx

RoomHealthScoreRing.tsx

*InsightsCard.tsx

B. Explicit Constraints

No Prisma schema per subtype

No gradients

No AI dependency

End of FRD