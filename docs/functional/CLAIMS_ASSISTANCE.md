Claims Assistance – Comprehensive Documentation

Format: Markdown (.md)
Audience: Product Owner, Tech Architect, Future Contributors
Status: Backend + Frontend MVP complete, extensible foundation

1️⃣ Overview

The Claims Assistance feature enables homeowners to create, manage, and track insurance or warranty claims directly within a property context.
It provides:

Structured claim lifecycle management

Auto-generated guided checklists

Document uploads tied to claims

Full audit timeline

Status-driven automation

Notification-ready domain events

The implementation is property-scoped, IDOR-safe, and fully integrated into the existing Contract-to-Cozy backend + frontend architecture.

2️⃣ Database Schema Changes
New Models
model Claim {
  id                     String   @id @default(uuid())
  propertyId             String
  createdBy              String

  title                  String
  description            String?
  type                   ClaimType
  status                 ClaimStatus
  sourceType             ClaimSourceType

  providerName           String?
  claimNumber            String?
  externalUrl            String?

  insurancePolicyId      String?
  warrantyId             String?

  incidentAt             DateTime?
  openedAt               DateTime?
  submittedAt            DateTime?
  closedAt               DateTime?

  deductibleAmount       Decimal?
  estimatedLossAmount    Decimal?
  settlementAmount       Decimal?

  checklistCompletionPct Int       @default(0)
  lastActivityAt         DateTime
  nextFollowUpAt         DateTime?

  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  checklistItems         ClaimChecklistItem[]
  documents              ClaimDocument[]
  timelineEvents         ClaimTimelineEvent[]
}

model ClaimChecklistItem {
  id                     String   @id @default(uuid())
  claimId                String
  orderIndex             Int
  title                  String
  description            String?
  required               Boolean
  status                 ClaimChecklistStatus
  completedAt            DateTime?
  completedBy            String?
  primaryClaimDocumentId String?
}

model ClaimDocument {
  id           String @id @default(uuid())
  claimId      String
  documentId   String
  type         ClaimDocumentType
  title        String?
  notes        String?
  createdAt    DateTime @default(now())
}

model ClaimTimelineEvent {
  id              String   @id @default(uuid())
  claimId         String
  propertyId      String
  createdBy       String
  type            ClaimTimelineEventType
  title           String?
  description     String?
  occurredAt      DateTime
  claimDocumentId String?
  meta            Json?
  createdAt       DateTime @default(now())
}

Enums Added

ClaimType

ClaimStatus

ClaimSourceType

ClaimChecklistStatus

ClaimDocumentType

ClaimTimelineEventType

3️⃣ Backend – Files Added / Modified
Types
apps/backend/src/types/claims.types.ts


Canonical DTOs + enums for claims

Used by services + controllers

Validators (Zod)
apps/backend/src/validators/claims.validators.ts


Create / Update Claim

Add Document

Add Timeline Event

Update Checklist Item

Regenerate Checklist

Templates
apps/backend/src/services/claims/claims.templates.ts


Checklist templates per ClaimType

Drives guided workflows

Services
apps/backend/src/services/claims/claims.service.ts


Key logic implemented:

Create claim + auto checklist

Regenerate checklist on type change

Auto status timestamps:

SUBMITTED → submittedAt

CLOSED → closedAt

Checklist completion %

Timeline event emission

Document attachment

Property-scoped authorization

Idempotent updates

Controller
apps/backend/src/controllers/claims.controller.ts


Wires validation → service

Passes authenticated userId

Routes
apps/backend/src/routes/claims.routes.ts


All routes are:

/api/properties/:propertyId/claims/...

Protected by propertyAuthMiddleware

4️⃣ Frontend – Files Added / Modified
Shared Types
apps/frontend/src/types/claims.types.ts


Frontend-safe mirror of backend DTOs

API Client
apps/frontend/src/app/(dashboard)/properties/[id]/claims/claimsApi.ts


Supports:

listClaims

getClaim

createClaim

updateClaim

regenerateChecklist

addClaimDocument

addClaimTimelineEvent

updateClaimChecklistItem

UI Components
ClaimCreateModal.tsx        → Create claim
ClaimChecklist.tsx          → Guided checklist
ClaimTimeline.tsx           → Notes + events
ClaimDocuments.tsx          → Claim-linked documents
ClaimQuickActions.tsx       → Status / type changes
ClaimStatusBadge.tsx        → Visual status indicator

Property Page Integration
apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx


Decision:
✅ Claims live as a Property Tab
(Claims are property-specific, not global)

Future-proofed to promote to standalone dashboard later if needed.

5️⃣ Features Implemented ✅
Core

Create & edit claims

Property-scoped access (IDOR safe)

Claim status lifecycle

Auto timestamps

Claim type → checklist template mapping

Checklist

Auto-generated steps

Required vs optional

Progress tracking %

Regeneration on type change

Timeline

Automatic events (created, checklist generated, status change)

Manual notes

Document-linked events

Documents

Attach files to claims

Optional linkage to insurance/warranty

View/download support

Notifications (Foundation)

Domain events emitted:

CLAIM_SUBMITTED

CLAIM_CLOSED

Ready for worker-based notifications

6️⃣ Known Fixes / Hardening Done

Defensive UI state updates (no undefined claims)

Duplicate prevention on create

Safe .map() rendering

Idempotent status transitions

Validation parity frontend ↔ backend

7️⃣ Pending Features / Enhancements 🚧
Product Enhancements

Claim assignment (adjuster / contractor)

SLA & follow-up reminders

Settlement tracking UI

Claim export (PDF / insurer-ready pack)

Multi-claim analytics per property

UX Enhancements

Inline document upload in checklist

Checklist item → document enforcement

Claim progress visualization

Status transition confirmation UI

Automation

Auto follow-up timeline events

Claim aging alerts

Coverage gap detection

Smart recommendations (repair vs claim)

Integrations

Insurance carrier APIs

Home warranty providers

Contractor marketplace tie-in


COMPLETED CHANGES (THIS SESSION)
1️⃣ Claims Timeline Enhancements (Backend)
✅ STATUS_CHANGE timeline events (CRITICAL)

Implemented first-class STATUS_CHANGE events on real claim status transitions

Emitted only when:

requestedStatus !== currentStatus

Transition is valid (via assertValidTransition)

Ensures idempotency (no duplicate events for same status)

Event details

type: STATUS_CHANGE
title: "Status changed"
description: "FROM → TO"
meta: {
  fromStatus,
  toStatus,
  autoTimestamps: { openedAt, submittedAt, closedAt, nextFollowUpAt }
}


Impact

Enables accurate SLA calculations

Improves auditability

Powers timeline UI and insights logic

2️⃣ DOCUMENT_ADDED Timeline Events (Bulk + Inline Uploads)

Added DOCUMENT_ADDED timeline events for bulk uploads

Includes:

claimDocumentId

meta.checklistItemId

meta.bulk = true

Optional metadata added (recommended)

meta: {
  kind: 'DOCUMENT_ADDED',
  checklistItemId,
  bulk: true,
  claimDocumentType,
  fileName
}


Impact

Timeline shows document additions

Enables future automations (doc classification, reminders)

3️⃣ Claim Insights — SLA Accuracy (Backend)
✅ Switched SLA source-of-truth to Timeline

getClaimInsights now:

Queries latest STATUS_CHANGE event

Uses occurredAt as status start time

Validates meta.toStatus === claim.status before trusting it

Falls back to timestamps (openedAt, submittedAt) if missing

Fixes

SLA is no longer inferred

Handles older claims safely

Prevents incorrect SLA breach warnings

4️⃣ Follow-up Risk Scoring (Backend)

Implemented followUp.risk:

Score: 0–100

Levels: LOW | MEDIUM | HIGH

Signals:

Overdue follow-ups

Days since last activity

Missing activity history

Returned as:

followUp: {
  isOverdue,
  nextFollowUpAt,
  risk: { score, level, reasons }
}

5️⃣ SLA Breach Warnings (Backend)

Implemented sla object:

sla: {
  maxDays,
  daysInStatus,
  isAtRisk,
  isBreach,
  message
}


Uses status-specific SLA thresholds

Differentiates:

Approaching SLA

SLA breached

6️⃣ Settlement vs Estimate Insights (Backend)

Implemented financial comparison:

financial: {
  estimatedLossAmount,
  settlementAmount,
  settlementVsEstimate,
  settlementRatio,
  visual: { label, direction }
}


Handles missing values gracefully

No DB changes required

7️⃣ Claim Health Score (Backend)

Computed health score:

Range: 0–100

Levels: GOOD | FAIR | POOR

Factors:

Follow-up risk

SLA breach / risk

Checklist completion

Activity staleness

Returned as:

health: {
  score,
  level,
  reasons
}

8️⃣ Insights UI Enhancements (Frontend)

Updated ClaimDetailClient.tsx to render:

SLA warning banner (amber / red)

Follow-up risk card

Claim health progress bar

Settlement vs estimate section

Existing recommendation preserved

UX fixes

Avoided double submit confirmation

Centralized submit blocking via ClaimQuickActions

Cleared stale blocking state on refresh/checklist updates

9️⃣ Timeline UI Improvements (Frontend)

Updated ClaimTimeline.tsx:

Event type badges (NOTE, STATUS_CHANGE, DOCUMENT_ADDED)

Clickable “View document” links (when backend includes nested document)

Keyboard shortcut: Cmd/Ctrl + Enter to add note

Removed raw “Document ID” display

Defensive timestamp formatting

🗂️ FILES TOUCHED / UPDATED
Backend

apps/backend/src/services/claims/claims.service.ts

updateClaim → emits STATUS_CHANGE

getClaimInsights → SLA, risk, health, financials

apps/backend/src/services/claims/claims.transitions.ts (used as-is)

Prisma enum already contained STATUS_CHANGE (no schema change needed)

Frontend

ClaimDetailClient.tsx

ClaimTimeline.tsx

ClaimQuickActions.tsx (submit flow coordination)

ClaimChecklist.tsx (unchanged, but integrated with blocking flow)

⏳ PENDING / NOT YET DONE
UX / UI Enhancements

Checklist item doc count progress (e.g. 1 / 2 uploaded)

Inline tooltips instead of text blocks for errors

Visual differentiation for SLA breach vs follow-up risk severity

Timeline Enhancements

Show creator name on timeline events (requires DTO include)

Render STATUS_CHANGE meta (from → to) more visually

Group bulk document uploads into a single expandable event (optional)

Automation (Future)

Auto-create FOLLOW_UP timeline events when overdue

Auto-reminder jobs based on SLA breach / risk

Auto-classification of uploaded documents

Testing

Unit tests for:

computeFollowUpRisk

computeSla

computeHealth

Integration test:

Status change → timeline event → SLA update

🔒 STABILITY / SAFETY NOTES

All changes are backward compatible

Older claims without STATUS_CHANGE events still work (fallback logic)

No DB schema changes required in this session

No breaking API changes to frontend consumers

▶️ NEXT SESSION RECOMMENDED START POINT

When you resume, the highest-ROI next step is:

Finish UX polish on checklist requirements

Doc count progress

Inline tooltips

Visual clarity on why submit is blocked

Followed by:

Timeline creator display

Optional automation hooks