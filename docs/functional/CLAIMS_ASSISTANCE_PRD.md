PRD / RFC — Claims Assistance Workflow (Guided)
1. Summary

Build a guided workflow that helps homeowners initiate, manage, and complete insurance/warranty claims during high-stress events. V1 focuses on checklist + document hub + coverage reference + timeline + notes/attachments. Future AI hooks add claim summary generation and required-doc inference.

2. Goals

Reduce user stress and cognitive load during claim events.

Increase claim completion rate (less missing documentation).

Centralize claim-related artifacts (docs/photos/estimates/communications).

Provide transparent “what’s next” timeline.

Create structured data foundation for orchestration + AI assistance.

3. Non-goals (V1)

Filing claims automatically with insurers/warranty providers.

Integrating insurer APIs (status sync, adjuster portals).

Legal/dispute workflows (appraisal, arbitration, attorney referrals).

Payments/refunds tracking beyond basic “settlement amount” fields.

4. Primary users / personas

Home Owner: managing repairs, insurance, warranty coverage; wants clarity and organization.

(Future) Home Buyer: might use the same workflow for inspection-related warranty/repair claims, but not primary V1 focus.

5. User problems & jobs-to-be-done

“I don’t know what documents I need.”

“I can’t find my policy coverage details.”

“I don’t know what step I’m on or what happens next.”

“I need a single place for photos, invoices, notes, calls, and emails.”

“I want reminders to follow up.”

6. Key use cases (V1)

Create a claim from an incident (manual start).

Auto-generate checklist based on claim type (water, storm, HVAC, etc.).

Upload documents/photos and attach to checklist items and timeline steps.

Reference coverage (link to InsurancePolicy / HomeWarranty / Coverage artifact).

Maintain timeline of key steps (submitted, inspection, estimate, adjuster follow-up, settlement).

Add notes (call log, claim number, adjuster info).

Mark claim as closed.

7. UX scope (V1)
Claim Dashboard (single claim)

Header: Claim title + type + status + provider + claim number

“Next step” card (from timeline/checklist)

Checklist section (progress)

Documents section (files grouped by category)

Timeline section (stepper / event log)

Notes section (freeform + structured contact details)

Claim List (per property)

Filter: Open / Closed / Draft

Sort: Last updated

Quick stats: checklist completion, next follow-up date

8. Data model overview

Core entities:

Claim (top-level object)

ClaimChecklistItem (auto-generated tasks)

ClaimDocument (uploads + attachments)

ClaimTimelineEvent (events / steps)

Optional: ClaimNote (either separate or embedded notes in Claim + timeline events)

Relationships:

Claim belongs to Property (+ User owner)

Claim references a coverage source:

Insurance policy (optional)

Home warranty contract (optional)

9. Checklist generation (V1)

Rule-based templates (no AI yet):

ClaimType → template items (ordered)

Each item: title, description, required flag, document category suggestions

Example (WATER_DAMAGE):

Take photos/video of source + damaged areas (required)

Mitigation / plumber invoice (required)

Policy declaration page (recommended)

Claim submission confirmation (required)

Adjuster visit scheduled (recommended)

10. Status model (V1)

ClaimStatus

DRAFT (created but not started/submitted)

IN_PROGRESS (actively collecting docs / steps)

SUBMITTED (user submitted to provider)

UNDER_REVIEW (waiting on provider/adjuster)

APPROVED (approved; settlement pending/received)

DENIED

CLOSED

ChecklistItemStatus

OPEN, DONE, NOT_APPLICABLE

11. Permissions & security

Claims are scoped by propertyId.

Enforce propertyAuthMiddleware checks for all claim routes.

Documents stored with signed URLs; access requires property ownership.

Audit fields: createdBy, updatedBy, timestamps.

12. API surface (suggested)

(Names align with your backend patterns)

GET /properties/:propertyId/claims

POST /properties/:propertyId/claims (create; optionally from template)

GET /properties/:propertyId/claims/:claimId

PATCH /properties/:propertyId/claims/:claimId

POST /properties/:propertyId/claims/:claimId/documents

POST /properties/:propertyId/claims/:claimId/timeline

PATCH /properties/:propertyId/claims/:claimId/checklist/:itemId

POST /properties/:propertyId/claims/:claimId/notes (optional)

13. Integrations (future)

Orchestration engine:

Inject “follow up” actions if timeline is stale

Suppression logic if claim exists for the issue

AI:

Claim summary generator from notes + timeline + docs list

Required-docs inference based on policy text + claim type

14. Success metrics

% claims with ≥ 80% checklist completion

Time to “Submitted” from claim creation

Reduction in “missing docs” user-reported issue

Engagement: documents uploaded per claim, timeline events added

Retention uplift for users who experience a claim event

15. Risks & mitigations

Overwhelming UX → progressive disclosure; keep V1 minimal

Liability concerns → disclaimers: “guidance only”

Storage costs → file size limits, retention policy, compress images

Security → strict property scoping + signed URLs

DB Schema (Postgres / Prisma)

Below is a schema you can drop into schema.prisma and iterate. It assumes you already have User and Property. It also optionally references InsurancePolicy / HomeWarranty (rename to match your existing models).

Enums
enum ClaimStatus {
  DRAFT
  IN_PROGRESS
  SUBMITTED
  UNDER_REVIEW
  APPROVED
  DENIED
  CLOSED
}

enum ClaimType {
  WATER_DAMAGE
  FIRE_SMOKE
  STORM_WIND_HAIL
  THEFT_VANDALISM
  LIABILITY
  HVAC
  PLUMBING
  ELECTRICAL
  APPLIANCE
  OTHER
}

enum ClaimSourceType {
  INSURANCE
  HOME_WARRANTY
  MANUFACTURER_WARRANTY
  OUT_OF_POCKET
  UNKNOWN
}

enum ClaimChecklistStatus {
  OPEN
  DONE
  NOT_APPLICABLE
}

enum ClaimDocumentType {
  PHOTO
  VIDEO
  INVOICE
  ESTIMATE
  REPORT
  POLICY
  COMMUNICATION
  RECEIPT
  OTHER
}

enum ClaimTimelineEventType {
  CREATED
  CHECKLIST_GENERATED
  DOCUMENT_UPLOADED
  SUBMITTED
  INSPECTION_SCHEDULED
  INSPECTION_COMPLETED
  ESTIMATE_RECEIVED
  FOLLOW_UP
  APPROVED
  DENIED
  SETTLEMENT_ISSUED
  CLOSED
  NOTE
  OTHER
}

Models
model Claim {
  id            String      @id @default(cuid())
  propertyId    String
  userId        String

  title         String
  description   String?     // incident narrative (user-entered or AI-generated later)
  type          ClaimType
  status        ClaimStatus @default(DRAFT)

  // Provider + reference details
  sourceType    ClaimSourceType @default(UNKNOWN)
  providerName  String?     // e.g., "State Farm", "American Home Shield"
  claimNumber   String?     // provider claim reference
  externalUrl   String?     // link to provider portal (if user pastes it)

  // Coverage references (optional)
  insurancePolicyId String?
  homeWarrantyId    String?

  // Key dates
  incidentAt     DateTime?  // when issue occurred
  openedAt       DateTime?  // when claim started (can be set when moved out of draft)
  submittedAt    DateTime?
  closedAt       DateTime?

  // Financial (optional, V1 light)
  deductibleAmount Int?     // store cents if you use money pattern, or Decimal
  estimatedLossAmount Int?
  settlementAmount Int?

  // Convenience fields
  checklistCompletionPct Int? @default(0)
  lastActivityAt     DateTime @default(now())
  nextFollowUpAt     DateTime?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  property      Property   @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  user          User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  insurancePolicy InsurancePolicy? @relation(fields: [insurancePolicyId], references: [id], onDelete: SetNull)
  homeWarranty    HomeWarranty?    @relation(fields: [homeWarrantyId], references: [id], onDelete: SetNull)

  checklistItems ClaimChecklistItem[]
  documents      ClaimDocument[]
  timelineEvents ClaimTimelineEvent[]

  @@index([propertyId, status])
  @@index([userId, status])
  @@index([propertyId, lastActivityAt])
}

model ClaimChecklistItem {
  id          String @id @default(cuid())
  claimId     String

  orderIndex  Int
  title       String
  description String?
  required    Boolean @default(false)

  status      ClaimChecklistStatus @default(OPEN)
  completedAt DateTime?
  completedBy String? // userId

  // optional link: a doc that satisfies this item
  primaryDocumentId String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  claim       Claim @relation(fields: [claimId], references: [id], onDelete: Cascade)
  primaryDocument ClaimDocument? @relation("ChecklistPrimaryDoc", fields: [primaryDocumentId], references: [id], onDelete: SetNull)

  @@index([claimId, status])
  @@unique([claimId, orderIndex])
}

model ClaimDocument {
  id          String @id @default(cuid())
  claimId     String
  propertyId  String
  uploadedBy  String // userId

  type        ClaimDocumentType @default(OTHER)
  title       String?
  notes       String?

  // Storage fields (adapt to your storage approach)
  storageKey  String // S3/GCS key or internal path
  fileName    String
  mimeType    String
  fileSize    Int

  // Optional metadata
  capturedAt  DateTime?
  sourceUrl   String?  // if user links to external doc

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  claim       Claim    @relation(fields: [claimId], references: [id], onDelete: Cascade)
  property    Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  uploader    User     @relation(fields: [uploadedBy], references: [id], onDelete: Cascade)

  // Reverse relation for checklist primary doc
  checklistPrimaryFor ClaimChecklistItem[] @relation("ChecklistPrimaryDoc")

  @@index([claimId, type])
  @@index([propertyId, createdAt])
}

model ClaimTimelineEvent {
  id          String @id @default(cuid())
  claimId     String
  propertyId  String
  createdBy   String // userId (or system)

  type        ClaimTimelineEventType
  title       String?
  description String?

  occurredAt  DateTime @default(now()) // event time (not necessarily createdAt)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Optional attachment to timeline event
  documentId  String?

  // Optional structured data for future AI / integrations
  meta        Json?

  claim       Claim    @relation(fields: [claimId], references: [id], onDelete: Cascade)
  property    Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  creator     User     @relation(fields: [createdBy], references: [id], onDelete: Cascade)
  document    ClaimDocument? @relation(fields: [documentId], references: [id], onDelete: SetNull)

  @@index([claimId, occurredAt])
  @@index([propertyId, occurredAt])
}

Notes on money fields

If your codebase already uses a “cents as Int” convention (common in Postgres apps), keep Int (cents). If you use Decimal, change to Decimal @db.Decimal(12,2).

Implementation notes (practical)
1) Minimal migration strategy

Add enums

Add Claim

Add ClaimChecklistItem, ClaimDocument, ClaimTimelineEvent

Add storage integration for ClaimDocument.storageKey

Add indexes (already included)

2) Computing checklistCompletionPct

On checklist item update, recompute:

doneCount / totalCount (excluding NOT_APPLICABLE, or include—your choice)

Update claim.lastActivityAt on:

any doc upload

timeline event add

checklist change

claim status change

3) Template-driven checklist generation

Keep templates in code (V1):

claimChecklists.templates.ts keyed by ClaimType

On claim create (or when moving out of DRAFT), generate items + add timeline event CHECKLIST_GENERATED