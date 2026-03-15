# Home Digital Will

## Overview

Home Digital Will is a property-scoped Home Tool that helps a homeowner answer:

- Who needs to know how this home works?
- What would happen if I were suddenly unavailable?
- Does anyone else know where the shutoffs are, who handles repairs, and what the house rules are?

It is a continuity record — a structured, living document that lets homeowners capture critical operational knowledge about their home and share it with trusted people.

The feature covers:

1. a guided setup flow to populate essential sections
2. eight structured knowledge sections covering emergency instructions, utilities, contractors, insurance, and more
3. a trusted contacts system with configurable access levels
4. a readiness/completion tracking system
5. an emergency read-only mode surfacing the most critical information first
6. a delete-safe, full CRUD authoring experience for entries and contacts

## Product Scope

Home Digital Will is a self-contained authoring and access tool. It does not integrate with external systems.

Current behavior:

- one digital will per property, created on first use
- eight predefined section types, each with its own entry list
- entries support type, priority, content, summary, and pinned/emergency flags
- trusted contacts support roles, access levels, and a primary contact designation
- readiness and status are manually managed by the homeowner
- emergency view surfaces high-priority content in a focused, read-only layout
- guided setup checklist tracks completion of five baseline steps
- full CRUD for sections, entries, and trusted contacts
- section and entry reordering via dedicated endpoints

Not included in the current implementation:

- external sharing or unauthenticated access
- email or push notification delivery to trusted contacts
- AI-generated content or auto-fill from home data
- document or file attachment upload
- comments or collaborative editing
- scheduled review reminders
- audit log or change history per entry
- contact verification or identity confirmation

## Database Design

Home Digital Will uses four Prisma models in [apps/backend/prisma/schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma).

### `HomeDigitalWill`

Root record for one property's digital will.

Table:

- `home_digital_wills`

Purpose:

- stores the top-level will metadata, status, readiness, and completion tracking

Key fields:

- `id`
- `propertyId`
- `title`
- `status`
- `readiness`
- `completionPercent`
- `setupCompletedAt`
- `lastReviewedAt`
- `publishedAt`
- `createdAt`
- `updatedAt`

Indexes:

- `@@index([propertyId])`

Constraints:

- `@@unique` on `propertyId` — exactly one will per property

Relationships:

- belongs to `Property` via `propertyId`, cascades on delete
- has many `HomeDigitalWillSection`
- has many `HomeDigitalWillTrustedContact`

### `HomeDigitalWillSection`

Typed knowledge section inside a will.

Table:

- `home_digital_will_sections`

Purpose:

- groups entries by topic area (emergency, utilities, contractors, etc.)
- each section type may appear only once per will

Key fields:

- `id`
- `digitalWillId`
- `type`
- `title`
- `description`
- `sortOrder`
- `isEnabled`
- `createdAt`
- `updatedAt`

Indexes:

- `@@index([digitalWillId])`

Constraints:

- `@@unique([digitalWillId, type])` — one section per type per will

Relationships:

- belongs to `HomeDigitalWill` via `digitalWillId`, cascades on delete
- has many `HomeDigitalWillEntry`

### `HomeDigitalWillEntry`

Individual knowledge item inside a section.

Table:

- `home_digital_will_entries`

Purpose:

- stores a single instruction, note, contact reference, preference, or rule
- entries track priority, emergency flag, pinned state, and optional effective date range

Key fields:

- `id`
- `sectionId`
- `entryType`
- `title`
- `content`
- `summary`
- `priority`
- `sortOrder`
- `isPinned`
- `isEmergency`
- `effectiveFrom`
- `effectiveTo`
- `createdAt`
- `updatedAt`

Indexes:

- `@@index([sectionId])`
- `@@index([sectionId, sortOrder])`
- `@@index([priority])`
- `@@index([isEmergency])`

Relationships:

- belongs to `HomeDigitalWillSection` via `sectionId`, cascades on delete

### `HomeDigitalWillTrustedContact`

A person who has been given access to this home's digital will.

Table:

- `home_digital_will_trusted_contacts`

Purpose:

- stores name, contact details, role, access level, and primary designation for each trusted person

Key fields:

- `id`
- `digitalWillId`
- `name`
- `email`
- `phone`
- `relationship`
- `role`
- `accessLevel`
- `isPrimary`
- `notes`
- `createdAt`
- `updatedAt`

Indexes:

- `@@index([digitalWillId])`
- `@@index([email])`

Relationships:

- belongs to `HomeDigitalWill` via `digitalWillId`, cascades on delete

### Property Model Update

The `Property` model includes one optional relation field:

```prisma
homeDigitalWill HomeDigitalWill?
```

## Enums

All enums live in [apps/backend/prisma/schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma).

### `HomeDigitalWillStatus`

Lifecycle status of the will as a whole:

- `DRAFT` — still being set up
- `ACTIVE` — ready for use by trusted contacts
- `ARCHIVED` — no longer current

### `HomeDigitalWillReadiness`

Self-reported preparation state:

- `NOT_STARTED` — minimal content added
- `IN_PROGRESS` — being actively maintained
- `READY` — owner considers it complete
- `NEEDS_REVIEW` — content exists but may be stale

### `HomeDigitalWillSectionType`

Defines the eight structured knowledge areas:

- `EMERGENCY` — critical steps and contacts for urgent situations
- `CRITICAL_INFO` — essential knowledge for anyone managing the home
- `CONTRACTORS` — trusted service providers and preferences
- `MAINTENANCE_KNOWLEDGE` — home quirks, routines, and maintenance know-how
- `UTILITIES` — providers, account details, and shutoff procedures
- `INSURANCE` — policies, contacts, and claim guidance
- `HOUSE_RULES` — how the home should be operated and cared for
- `GENERAL_NOTES` — additional notes and information

### `HomeDigitalWillEntryType`

Classifies the nature of a knowledge entry:

- `INSTRUCTION` — step-by-step directive
- `LOCATION_NOTE` — where something is physically located
- `CONTACT_NOTE` — details about a person or business
- `SERVICE_PREFERENCE` — preferred approach or provider for a service
- `MAINTENANCE_RULE` — routine or requirement for maintaining the home
- `POLICY_NOTE` — rule, condition, or coverage detail
- `ACCESS_NOTE` — information about how to access a space, system, or account
- `GENERAL_NOTE` — catch-all for unclassified information

### `HomeDigitalWillEntryPriority`

Importance level for sorting, filtering, and emergency view:

- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

### `HomeDigitalWillTrustedContactRole`

Describes a trusted contact's relationship to the property:

- `SPOUSE`
- `FAMILY_MEMBER`
- `PROPERTY_MANAGER`
- `EMERGENCY_CONTACT`
- `CARETAKER`
- `OTHER`

### `HomeDigitalWillAccessLevel`

Controls what the contact is intended to do with the will:

- `VIEW` — read the full digital will
- `EDIT` — help update and maintain the will
- `EMERGENCY_ONLY` — access intended for urgent situations only

## Backend Architecture

The backend follows the existing CtC Express + service-layer pattern.

### Route Registration

Main route registration:

- [apps/backend/src/index.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/index.ts)

Mounted route group:

- `app.use('/api', homeDigitalWillRoutes);`

### Routes

Defined in:

- [apps/backend/src/routes/homeDigitalWill.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/homeDigitalWill.routes.ts)

Middleware applied to all routes:

- `apiRateLimiter`
- `authenticate`

Property-scoped routes also apply:

- `propertyAuthMiddleware`

Write routes apply:

- `validateBody(schema)`

#### Digital Will endpoints

- `GET  /api/properties/:propertyId/home-digital-will` — fetch the will for a property, returns `null` if not created yet
- `POST /api/properties/:propertyId/home-digital-will` — create or return the existing will (idempotent)
- `PATCH /api/home-digital-wills/:id` — update will title, status, readiness, or review date

#### Section endpoints

- `GET  /api/home-digital-wills/:id/sections` — list all sections
- `POST /api/home-digital-wills/:id/sections` — create a new section
- `POST /api/home-digital-wills/:id/sections/reorder` — reorder sections by sorted ID list
- `PATCH /api/home-digital-will-sections/:sectionId` — update section title, description, or enabled state
- `DELETE /api/home-digital-will-sections/:sectionId` — delete a section and all its entries

#### Entry endpoints

- `GET  /api/home-digital-will-sections/:sectionId/entries` — list entries in a section
- `POST /api/home-digital-will-sections/:sectionId/entries` — create an entry
- `POST /api/home-digital-will-sections/:sectionId/entries/reorder` — reorder entries by sorted ID list
- `PATCH /api/home-digital-will-entries/:entryId` — update an entry
- `DELETE /api/home-digital-will-entries/:entryId` — delete an entry

#### Trusted contact endpoints

- `GET  /api/home-digital-wills/:id/trusted-contacts` — list trusted contacts
- `POST /api/home-digital-wills/:id/trusted-contacts` — add a trusted contact
- `PATCH /api/home-digital-will-trusted-contacts/:contactId` — update a trusted contact
- `DELETE /api/home-digital-will-trusted-contacts/:contactId` — remove a trusted contact

### Controllers

Defined in:

- [apps/backend/src/controllers/homeDigitalWill.controller.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/homeDigitalWill.controller.ts)

Controller functions:

- `getDigitalWillByProperty`
- `createDigitalWillForProperty`
- `updateDigitalWill`
- `listSections`
- `createSection`
- `updateSection`
- `deleteSection`
- `reorderSections`
- `listEntries`
- `createEntry`
- `updateEntry`
- `deleteEntry`
- `reorderEntries`
- `listTrustedContacts`
- `createTrustedContact`
- `updateTrustedContact`
- `deleteTrustedContact`

Responsibilities:

- enforce authenticated access
- read route params (`propertyId`, will `id`, `sectionId`, `entryId`, `contactId`)
- delegate to the service layer
- normalize HTTP status codes and response shapes

### Validators

Defined in:

- [apps/backend/src/validators/homeDigitalWill.validators.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/validators/homeDigitalWill.validators.ts)

Enum schemas:

- `HomeDigitalWillStatusSchema`
- `HomeDigitalWillReadinessSchema`
- `HomeDigitalWillSectionTypeSchema`
- `HomeDigitalWillEntryTypeSchema`
- `HomeDigitalWillEntryPrioritySchema`
- `HomeDigitalWillTrustedContactRoleSchema`
- `HomeDigitalWillAccessLevelSchema`

Body schemas:

- `createDigitalWillBodySchema` — optional `title`
- `updateDigitalWillBodySchema` — optional `title`, `status`, `readiness`, `lastReviewedAt`, `publishedAt`
- `createSectionBodySchema` — `type`, optional `title`, `description`, `sortOrder`
- `updateSectionBodySchema` — optional `title`, `description`, `isEnabled`
- `createEntryBodySchema` — `title`, `entryType`, optional `content`, `summary`, `priority`, `isPinned`, `isEmergency`, `effectiveFrom`, `effectiveTo`
- `updateEntryBodySchema` — all optional partial of above
- `reorderBodySchema` — `ids: string[]`
- `createTrustedContactBodySchema` — `name`, `role`, `accessLevel`, optional `email`, `phone`, `relationship`, `isPrimary`, `notes`
- `updateTrustedContactBodySchema` — all optional partial of above

### Service Layer

Defined in:

- [apps/backend/src/services/homeDigitalWill.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/homeDigitalWill.service.ts)

The service is implemented as a class `HomeDigitalWillService`.

Public methods:

- `getByProperty(propertyId)` — load the will with sections, entries, contacts, and computed counts; returns `null` if not yet created
- `getOrCreateByProperty(propertyId, body)` — idempotent create; seeds all eight default sections on first creation
- `updateWill(willId, userId, body)` — update metadata fields
- `listSections(willId, userId)` — list sections ordered by `sortOrder`
- `createSection(willId, userId, body)` — add a custom section to the will
- `updateSection(sectionId, userId, body)` — update section metadata
- `deleteSection(sectionId, userId)` — delete a section and cascade-delete its entries
- `reorderSections(willId, userId, body)` — bulk-update `sortOrder` from a sorted ID array
- `listEntries(sectionId, userId)` — list entries for a section ordered by `sortOrder`
- `createEntry(sectionId, userId, body)` — add an entry to a section
- `updateEntry(entryId, userId, body)` — update an entry
- `deleteEntry(entryId, userId)` — delete an entry
- `reorderEntries(sectionId, userId, body)` — bulk-update entry `sortOrder`
- `listTrustedContacts(willId, userId)` — list all trusted contacts for the will
- `createTrustedContact(willId, userId, body)` — add a trusted contact
- `updateTrustedContact(contactId, userId, body)` — update contact info or access level
- `deleteTrustedContact(contactId, userId)` — remove a trusted contact

Returned DTO shape from `getByProperty` and `getOrCreateByProperty`:

- `id`, `propertyId`, `title`, `status`, `readiness`, `completionPercent`
- `setupCompletedAt`, `lastReviewedAt`, `publishedAt`
- `sections[]` — each with `entries[]`
- `trustedContacts[]`
- `counts` — `{ sectionCount, entryCount, trustedContactCount, hasEmergencyEntries }`
- `createdAt`, `updatedAt`

### Default Section Seeding

When `getOrCreateByProperty` creates a new will, it seeds all eight default sections with predefined titles and descriptions in the following order:

1. `EMERGENCY` — Emergency Instructions
2. `CRITICAL_INFO` — Critical Information
3. `CONTRACTORS` — Preferred Contractors
4. `MAINTENANCE_KNOWLEDGE` — Maintenance Knowledge
5. `UTILITIES` — Utilities
6. `INSURANCE` — Insurance Notes
7. `HOUSE_RULES` — House Rules
8. `GENERAL_NOTES` — General Notes

The sections are created with sequential `sortOrder` values (0–7). This ensures all users start with a consistent, fully-structured will without any manual setup for sections.

## Frontend Architecture

The frontend follows the Next.js app-router + React Query + shared component approach.

### Main Screen Route

Property-scoped route:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/page.tsx)

Rendered client:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/HomeDigitalWillClient.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/HomeDigitalWillClient.tsx)

Route shape:

- `/dashboard/properties/:propertyId/tools/home-digital-will`

### Frontend API Integration

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/homeDigitalWillApi.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/homeDigitalWillApi.ts)

Primary functions:

- `getDigitalWill(propertyId)` — fetch the will or return `null`
- `getOrCreateDigitalWill(propertyId, title?)` — create or return existing will
- `updateDigitalWill(willId, data)` — update will metadata
- `createEntry(sectionId, data)` — add an entry to a section
- `updateEntry(entryId, data)` — update an entry
- `deleteEntry(entryId)` — delete an entry
- `updateSection(sectionId, data)` — update section metadata
- `createTrustedContact(willId, data)` — add a trusted contact
- `updateTrustedContact(contactId, data)` — update a trusted contact
- `deleteTrustedContact(contactId)` — remove a trusted contact

The API module uses the shared `api` client from `@/lib/api/client` and returns typed responses.

### Frontend Types

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/types.ts)

Type groups:

- enum string union types: `DigitalWillStatus`, `DigitalWillReadiness`, `SectionType`, `EntryType`, `EntryPriority`, `TrustedContactRole`, `TrustedContactAccessLevel`
- entity types: `DigitalWill`, `DigitalWillSection`, `DigitalWillEntry`, `TrustedContact`, `DigitalWillCounts`
- input types: `CreateEntryInput`, `UpdateEntryInput`, `CreateTrustedContactInput`, `UpdateTrustedContactInput`, `UpdateWillInput`

### Screen Composition

The `HomeDigitalWillClient` component is a single-file implementation. All sub-components are colocated inline. There are no shared feature components outside the route directory.

The screen composes:

1. `WillSkeleton` — animated placeholder shown during initial data load
2. `WillEmptyState` — first-time create prompt with `MobilePageIntro` header
3. Error state — `EmptyStateCard` with retry when the query fails
4. `EmergencyView` — full read-only mode (early-return guard when `emergencyMode=true`)
5. Back navigation link
6. `WillHeader` — title, readiness chip, entry/contact counts, last-reviewed date, emergency button, and metadata edit button
7. `SetupChecklist` or `ReadinessNudges` — mutually exclusive guidance blocks
8. Desktop two-column layout — left nav list + right detail panel
9. Mobile stacked views — section list, section detail, and contacts panel are rendered conditionally
10. `RelatedTools` — contextual related tool chips
11. `BottomSafeAreaReserve`

Sheet editors (always mounted, controlled by state):

- `EntryEditorSheet` — create/edit an entry; form sections: Basics, Importance, Timing
- `WillMetadataSheet` — edit will title, status, readiness, last reviewed date
- `ContactEditorSheet` — create/edit a trusted contact; form sections: Identity, Access, Contact details, Notes

### Inline Sub-components

All colocated in `HomeDigitalWillClient.tsx`:

- `WillSkeleton` — `animate-pulse` blocks matching the page layout
- `WillEmptyState` — first-run empty state with create CTA
- `DeleteConfirmButton` — two-step inline delete confirmation (No / Delete) replacing direct-delete buttons
- `SetupChecklist` — five-step guided checklist with progress bar; dismissible; returns `null` when all steps complete
- `ReadinessNudges` — inline nudge row for incomplete essentials after checklist is dismissed
- `WillHeader` — top summary card with status chips, primary contact display, and emergency view trigger
- `SectionCard` — nav button for a single section in the left-rail list
- `TrustedContactsNavCard` — nav button for the trusted contacts panel in the left-rail list
- `EntryCard` — individual entry display with edit + delete controls
- `SectionDetailPanel` — section view with entry list, add button, and empty state
- `ContactItem` — individual contact card with tappable phone/email links, edit, delete, and set-primary controls
- `ContactsDetailPanel` — contacts view with add button, access-level legend, and contact list
- `EmergencyEntryCard` — read-only entry card used inside emergency view
- `EmergencyContactCard` — read-only contact card with tap-to-call and tap-to-email links
- `EmergencyViewSection` — section wrapper with icon, title, and entry list inside emergency view
- `EmergencyView` — full focused read-only layout prioritizing emergency instructions, primary contact, other contacts, utilities, critical info, and other flagged entries

### State Architecture

The main component manages:

- `selectedSectionId` — which section is open in the detail panel
- `showContactsPanel` — whether the contacts panel is active
- `emergencyMode` — toggles the full `EmergencyView` early return
- `setupDismissed` — whether the user has dismissed the setup checklist
- `entryEditorState` — `{ mode, sectionId, entry? }` or `null`
- `metadataEditorOpen` — boolean
- `contactEditorState` — `{ mode, contact? }` or `null`
- `deletingEntryId` — tracks which entry is in a pending delete
- `deletingContactId` — tracks which contact is in a pending delete
- `updatingContactId` — tracks which contact is in a pending primary update

React Query:

- query key: `['home-digital-will', propertyId]`
- stale time: 3 minutes
- `getDigitalWill` called on mount; `invalidateQueries` called after every mutation

Derived state:

- `hasIncompleteSetup` — memoized: `true` if emergency entries, a contact, or a primary contact is missing
- `showSetupChecklist` — `hasIncompleteSetup && !setupDismissed`
- `selectedSection` — resolved from `will.sections` by `selectedSectionId`

### Display Configuration

Colocated static maps in `HomeDigitalWillClient.tsx`:

- `SECTION_CONFIG` — maps each `SectionType` to icon component, icon color, icon background, `StatusChip` tone, label, and hint text
- `READINESS_TONE` / `READINESS_LABEL` — maps readiness values to chip tones and display labels
- `PRIORITY_TONE` — maps entry priority to chip tones
- `ENTRY_TYPE_OPTIONS` / `PRIORITY_OPTIONS` — select options for forms
- `ACCESS_LEVEL_CONFIG` / `ROLE_LABELS` / `ROLE_OPTIONS` / `ACCESS_LEVEL_OPTIONS` — contact form and display config

### Emergency View Behavior

When `emergencyMode=true`, the main component returns `EmergencyView` early, replacing the full page.

Content priority order in emergency view:

1. Amber banner identifying "Emergency View" with an exit button
2. Emergency Instructions section (all entries from `EMERGENCY` section)
3. Primary trusted contact card with tap-to-call and tap-to-email
4. Other trusted contacts
5. Fallback warning if no contacts exist
6. Utilities section
7. Critical Information section (if populated)
8. Other pinned, emergency-flagged, or `CRITICAL` priority entries from remaining sections
9. Footer with will title, last reviewed date, and "Return to full view" button

### Setup Checklist

`SetupChecklist` defines five steps derived from actual will data:

1. Add emergency instructions → navigates to the `EMERGENCY` section
2. Add a trusted contact → opens the contacts panel
3. Set a primary contact → opens the contacts panel
4. Add utility information → navigates to the `UTILITIES` section
5. Mark will as in progress → opens the metadata editor

The component shows a progress bar and returns `null` when all five are complete. It is dismissible at any time via an `X` button. Once dismissed, `ReadinessNudges` is shown instead if any gaps remain.

### Utility Function

`formatDate(dateString, style?)` — consistent date formatter used across all date displays.

- returns `'Never'` for null/undefined
- returns `'Invalid date'` for unparseable strings
- `style='short'` (default): `Jan 15, 2025`
- `style='long'`: `January 15, 2025`

## Mobile Navigation and Entry Points

Home Digital Will is wired into the shared Home Tools catalog and the property-scoped launch flow.

### Shared Home Tool Catalog

Defined in:

- [apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts)

Current catalog entry:

- `key`: `home-digital-will`
- `name`: `Home Digital Will`
- `description`: `Store critical home knowledge for trusted parties`
- `hrefSuffix`: `tools/home-digital-will`
- `navTarget`: `tool:home-digital-will`
- `icon`: `BookOpen` (resolved via `HOME_TOOL_ICON_OVERRIDES`)
- `isActive`: matches `/dashboard/properties/[id]/tools/home-digital-will`

### Tool Registry

Defined in:

- [apps/frontend/src/features/tools/toolRegistry.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/features/tools/toolRegistry.ts)

`home-digital-will` is registered in `TOOL_IDS` and surfaced in the shared `HOME_TOOL_REGISTRY`, which powers related tool lookups and property-aware href building.

### Property Tools Rail

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx)

Behavior:

- desktop shows Home Tools as pill navigation buttons on the property page
- mobile shows Home Tools inside a bottom sheet drawer
- both variants include the Home Digital Will entry from the shared catalog
- this is the primary way users discover and navigate to the feature

### Property Selection Hand-off

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx)

Behavior:

- the `navTarget` value `tool:home-digital-will` resolves through `MOBILE_HOME_TOOL_LINKS`
- when a property is selected, the browser navigates to `/dashboard/properties/:id/tools/home-digital-will`

### Dashboard Layout Navigation

Defined in:

- [apps/frontend/src/app/(dashboard)/layout.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/layout.tsx)

Behavior:

- the dashboard shell reuses `MOBILE_HOME_TOOL_LINKS`
- Home Digital Will participates in the shared navigation ecosystem

### Home Tools Catalog Page

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx)

Current behavior:

- Home Digital Will is **not** included in the `HOME_TOOL_GROUPS` configuration on the Home Tools catalog page
- the feature is available and discoverable through the property-scoped tools rail only
- if added to the catalog page in future, it should be placed in a new group such as `Continuity + Knowledge` or added to `Readiness + Timeline`

### Related Tools Context

Defined in:

- [apps/frontend/src/features/tools/contextToolMappings.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/features/tools/contextToolMappings.ts)

Mapping:

```typescript
'home-digital-will': ['home-event-radar', 'home-risk-replay', 'status-board'],
```

The `RelatedTools` component renders these as inline chips at the bottom of the Home Digital Will screen:

```tsx
<RelatedTools context="home-digital-will" propertyId={propertyId} />
```

### Page Context Resolution

Defined in:

- [apps/frontend/src/features/tools/resolvePageContext.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/features/tools/resolvePageContext.ts)

The pathname pattern `/dashboard/properties/[id]/tools/home-digital-will` resolves to context `'home-digital-will'` for related tools and any other context-aware components.

### Icon Mapping

Defined in:

- [apps/frontend/src/lib/config/iconMapping.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/config/iconMapping.ts)

Entry in `HOME_TOOL_ICON_OVERRIDES`:

```typescript
HOME_DIGITAL_WILL: 'BookOpen',
```

## Feature Flow

Full end-to-end flow:

1. user opens the property tools rail or navigates to `/dashboard/properties/:id/tools/home-digital-will`
2. frontend loads the will via `GET /api/properties/:propertyId/home-digital-will`
3. if no will exists, the empty state prompts the user to create one
4. user clicks "Create Home Digital Will"
5. frontend calls `POST /api/properties/:propertyId/home-digital-will`
6. backend creates the will and seeds all eight default sections
7. frontend invalidates the query and re-renders with the full will
8. the setup checklist appears, guiding the user through five essential steps
9. user selects a section and adds entries via the `EntryEditorSheet`
10. user navigates to the Trusted Contacts panel and adds contacts via the `ContactEditorSheet`
11. user marks a contact as primary either inline or via the contact form
12. as steps are completed, the setup checklist progress bar advances
13. once all five steps are done, the checklist hides and `ReadinessNudges` may optionally appear
14. user can update will status and readiness via `WillMetadataSheet`
15. when the will has content, the amber Emergency button appears in `WillHeader`
16. tapping Emergency activates `EmergencyView`, a focused read-only layout
17. `EmergencyView` can be exited at any time to return to the full editing view

## UX Notes and Guardrails

Current design intentions:

- the feature avoids legal or alarming language — it is a practical knowledge record, not a legal document
- microcopy uses calm, homeowner-friendly language throughout
- entry priority and emergency flags are optional and not required to save
- the setup checklist is dismissible at any time so it does not block authoring
- the two-step `DeleteConfirmButton` (No / Delete) prevents accidental deletion without a modal
- the emergency view is a client-side state toggle and does not require a separate route or API call
- trusted contact access levels are informational only in the current implementation — they do not gate any API access

Accessibility:

- all icon-only buttons have `aria-label`
- selected nav items have `aria-current="page"`
- all Switch toggles have associated `Label` elements via `htmlFor`/`id`
- all Sheet forms have `SheetDescription` for screen readers
- form inputs with validation errors include `aria-describedby` pointing to the error message

## Key Files At A Glance

### Backend

- [apps/backend/prisma/schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma)
- [apps/backend/src/index.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/index.ts)
- [apps/backend/src/routes/homeDigitalWill.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/homeDigitalWill.routes.ts)
- [apps/backend/src/controllers/homeDigitalWill.controller.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/homeDigitalWill.controller.ts)
- [apps/backend/src/validators/homeDigitalWill.validators.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/validators/homeDigitalWill.validators.ts)
- [apps/backend/src/services/homeDigitalWill.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/homeDigitalWill.service.ts)

### Frontend Feature Screen

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/HomeDigitalWillClient.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/HomeDigitalWillClient.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/homeDigitalWillApi.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/homeDigitalWillApi.ts)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/types.ts)

### Frontend Wiring and Navigation

- [apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts)
- [apps/frontend/src/features/tools/toolRegistry.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/features/tools/toolRegistry.ts)
- [apps/frontend/src/features/tools/contextToolMappings.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/features/tools/contextToolMappings.ts)
- [apps/frontend/src/features/tools/resolvePageContext.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/features/tools/resolvePageContext.ts)
- [apps/frontend/src/lib/config/iconMapping.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/config/iconMapping.ts)
- [apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx)
- [apps/frontend/src/app/(dashboard)/layout.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/layout.tsx)
