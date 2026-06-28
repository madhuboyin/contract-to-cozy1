# Live Project Execution Tracker

## Overview

Live Project Execution Tracker gives homeowners a structured workspace for managing a contractor-executed home project from signed contract through final payment and warranty period. It covers the gap in the current platform: Contract to Cozy handles everything before a renovation (risk assessment, permits, quotes, price finalization, financing) and everything after (material specs, home timeline, Digital Twin update, capital plan), but nothing during the weeks or months the work is actually happening.

That gap is where homeowners lose the most money. Scope creep goes untracked. Payments are made before milestones are verified. Permit inspections are missed. Progress photos vanish in text threads. Contractor disputes have no paper trail.

**Core differentiation from generic project management tools.** A spreadsheet or Notion board can track milestones. What no generic tool can do is connect project execution to the homeowner's live property record: permit inspection checkpoints from the Permit Tracker surface automatically as project milestones; when work is complete, the Digital Twin condition scores update, Capital Timeline replacement clocks reset, Material Specs populate, and the completed project becomes part of the property's resale documentation in the Vault. The project record is not a standalone document — it is a transaction in the home's living data.

---

## Scope Boundaries

| Capability | In Scope | Out of Scope |
|---|---|---|
| Project creation from Price Finalization, Booking, or manual | ✓ | Real-time contractor communication (chat) |
| Milestone timeline with scheduling and delay tracking | ✓ | Contractor-facing project portal |
| Payment schedule gated on milestone completion | ✓ | Automated payment processing or disbursement |
| Change order log with contract total tracking | ✓ | Contract generation or legal document drafting |
| Progress photo and daily log | ✓ | Video streaming of work in progress |
| Permit inspection checkpoint integration | ✓ | Permit filing or scheduling with municipalities |
| Issue and dispute log | ✓ | Formal arbitration or legal dispute resolution |
| Completion write-back to platform systems | ✓ | Automatic contractor invoice generation |
| Warranty period tracking and reminders | ✓ | Warranty claim processing |
| Contractor performance rating on completion | ✓ | Contractor licensing verification |

---

## User Personas and Entry Points

### Persona 1 — The Renovation Homeowner (core case)
Running a major project: kitchen remodel, roof replacement, HVAC installation, bathroom gut, addition. Project spans 4–16 weeks, involves a general contractor and potentially multiple subcontractors, and has a contract value of $10K–$200K+. Needs: milestone control, payment gating, change order discipline, and a paper trail. Has the highest financial exposure and the most to lose from poor execution management.

### Persona 2 — The Repair Homeowner
Running a smaller, defined-scope project: replace water heater, repair foundation crack, rewire a circuit, replace windows. Project spans 1–5 days, single contractor, defined price. Needs: simple milestone completion, payment confirmation, receipt storage, and warranty tracking. Lower complexity but same write-back value (replacement clock resets, system condition updates).

### Persona 3 — The Pre-Sale Executor
Running seller prep projects identified from a pre-listing inspection or the Seller Prep tool. Has a defined list of items to complete before listing and a hard deadline. Needs: status tracking across multiple concurrent small projects, completion documentation for the Vault disclosure, and a way to show buyers what was recently done.

---

## Feature Components

### 1. Project Creation

A project can be created from three sources:

**From Price Finalization.** When the homeowner has finalized a contractor quote through the Price Finalization feature, a "Start Tracking This Project" CTA appears on the finalized record. The project inherits: contractor name and contact, scope description, contract amount, and start date. No re-entry required.

**From a Booking record.** If the work was booked through the Service Provider Directory, a project can be spun up from the confirmed booking with contractor, service category, and scheduled date pre-populated.

**Manual creation.** The homeowner fills in the project from scratch. Required fields: project name, project type, contractor name, contract amount, and start date.

**Project type selection.** The homeowner selects a project type from a predefined list (see Project Types section). The type drives milestone templates, the home systems to be updated on completion, and the permit inspection checkpoints to surface.

**Milestone template.** On creation, the platform offers a milestone template for the selected project type. The homeowner can accept, modify, or replace the template entirely. Templates are starting points, not locked structures.

**Documents.** On creation, the homeowner is prompted to attach the signed contract (from Document Vault or direct upload). Not required, but strongly recommended — contracts are referenced in the dispute log workflow.

---

### 2. Milestone Timeline

Milestones are the backbone of the project. Every project must have at least one milestone before moving to IN_PROGRESS status.

**Milestone types:**

- **STANDARD** — A homeowner-defined project checkpoint (e.g., "Demolition complete," "Tile installation done," "Final walkthrough")
- **PERMIT_INSPECTION** — A required municipal inspection pulled automatically from the Permit Tracker (e.g., rough-in electrical, framing, insulation, final) — see Integration section
- **PAYMENT_TRIGGER** — A milestone that releases a payment when marked complete; draws from the Payment Schedule
- **CUSTOM** — Homeowner-defined with no special behavior

**Milestone fields:**

- Name and description
- Type (from above)
- Scheduled date
- Completion date (set when marked complete)
- Status: UPCOMING / IN_PROGRESS / COMPLETE / DELAYED / DISPUTED / BLOCKED
- Linked payment (if PAYMENT_TRIGGER type)
- Linked permit inspection (if PERMIT_INSPECTION type)
- Requires photo evidence (toggle) — if on, the milestone cannot be marked COMPLETE without at least one photo attached
- Completion notes and completed-by user

**Delay cascade.** When a milestone's scheduled date passes without being marked COMPLETE, its status automatically shifts to DELAYED. The homeowner is notified. Any subsequent milestones whose scheduled dates assumed the delayed milestone was on time shift forward by the same number of days. The homeowner can override the cascade if the delay does not affect later work.

**Milestone ordering.** Milestones are ordered by scheduled date by default. Dependencies can be set explicitly: "This milestone cannot start until milestone X is complete." Dependency violations block the dependent milestone from being marked IN_PROGRESS.

**Disputed milestones.** If the homeowner believes a milestone has not actually been completed to the agreed standard, they can mark it DISPUTED. A DISPUTED milestone counts as incomplete for payment purposes and creates an entry in the Issue Log automatically.

---

### 3. Payment Schedule

The payment schedule tracks all financial installments for the project. Payments are always defined before the project starts and are adjusted only through approved change orders.

**Payment fields:**

- Description (e.g., "Deposit," "Rough-in complete," "Final payment")
- Amount (in cents)
- Trigger type: MILESTONE (released when a specific milestone is marked COMPLETE), DATE (due on a specific calendar date), or MANUAL (homeowner manually marks as due)
- Linked milestone (if MILESTONE trigger)
- Due date (calculated from trigger, or set directly for DATE type)
- Status: PENDING / DUE / PAID / OVERDUE / DISPUTED / ON_HOLD
- Paid date and payment method (when marked PAID)
- Receipt document (upload or link from Document Vault)

**Payment gating.** A payment with trigger type MILESTONE cannot have its status changed to DUE until its linked milestone is marked COMPLETE. The payment status remains PENDING regardless of the calendar date until the milestone condition is satisfied. This is the core protection against paying for unfinished work.

**Overdue tracking.** Once a payment is triggered (milestone complete or date reached), if it is not marked PAID within 3 days, it becomes OVERDUE. An OVERDUE payment on a project with an active contractor relationship generates a notification to the homeowner.

**Running totals.** The payment schedule view always shows:
- Original contract amount
- Approved change order delta
- Current contract total
- Paid to date
- Remaining balance

**On-hold payments.** When a BLOCKING issue is logged, all PENDING and DUE payments (except past due paid amounts) are placed ON_HOLD automatically. Payments resume only when the issue is marked RESOLVED.

---

### 4. Change Order Log

Every modification to the agreed scope or price after contract signing is recorded as a change order. Untracked scope changes are the primary source of renovation disputes.

**Change order fields:**

- Change number (sequential within the project, auto-assigned)
- Title and detailed description of what is changing
- Category: HOMEOWNER_REQUEST / UNFORESEEN_CONDITION / MATERIAL_SUBSTITUTION / DESIGN_CHANGE / ERROR_CORRECTION / OTHER
- Cost delta in cents (positive = contract increase, negative = decrease or credit)
- Status: PROPOSED / APPROVED / REJECTED / VOIDED
- Supporting document (optional — contractor's written change order, if provided)
- Proposed by (homeowner or contractor name)
- Approved by (homeowner user record) and approval timestamp

**Contract total tracking.** Only APPROVED change orders affect the current contract total. The change order log shows the cumulative impact: original contract, each approved change order (with +/- amount), and the running current total.

**Variance alert.** When the sum of approved change orders exceeds 10% of the original contract amount, the homeowner receives a budget variance alert: "Your project is running $X over the original contract. Review your open change orders."

**No approval, no payment.** A payment amount that references a change order cannot be marked PAID if the associated change order is still in PROPOSED status.

---

### 5. Progress Photo and Daily Log

All project documentation lives here. The log is a chronological feed of photos and notes organized by milestone and date.

**Log entry types:**

- **Milestone photo** — photo attached directly to a milestone, required if milestone has "requires photo evidence" enabled
- **Daily progress note** — freeform text note for a given date (no milestone required)
- **Issue photo** — photo attached to a logged issue
- **Material delivery record** — photo of materials delivered on site with material type, quantity, and supplier noted

**Photo metadata.** All photos capture: upload timestamp, device timestamp (if available), and optionally the room/area of the home the photo depicts. Room tagging links the photo to the Room Insights system.

**Material tagging at log time.** When a material delivery photo is logged, the homeowner can tag it with the material type (paint, tile, flooring, fixtures, etc.), brand, color, model, and supplier. These entries pre-populate the Material Specs Registry on project completion — the homeowner does not enter materials twice.

**Searchable archive.** All log entries and photos are full-text searchable within the project. Photos are retained permanently in the Document Vault under the project record.

---

### 6. Permit Inspection Checkpoint Integration

When a project is created and a project type is selected, the platform queries the Permit Tracker for active permits on the property that match the project's trade type.

**Checkpoint surfacing.** Active permits with outstanding inspection milestones appear automatically as PERMIT_INSPECTION type milestones on the project timeline. These are read-synced from the Permit Tracker — when the inspection is passed, the milestone in both systems updates simultaneously.

**Example for a kitchen remodel:**
- Rough-in plumbing inspection → PERMIT_INSPECTION milestone (synced from Permit Tracker permit #XXXX)
- Rough-in electrical inspection → PERMIT_INSPECTION milestone (synced from same or related permit)
- Final inspection → PERMIT_INSPECTION milestone

**Failed inspections.** If an inspection is marked failed (correction notice issued), the PERMIT_INSPECTION milestone becomes BLOCKED. Downstream payment milestones gated on that inspection are frozen until the re-inspection passes. This prevents final payment being made before a failed inspection is resolved.

**No active permit.** If a project type typically requires a permit but no active permit is found in the Permit Tracker, a banner is shown: "No active permit found for this type of work. If a permit is required and none is pulled, it will be flagged as unpermitted work at project completion." The homeowner can dismiss this if the work type does not actually require a permit in their jurisdiction.

---

### 7. Issue and Dispute Log

Issues are formal records of problems encountered during the project. They range from minor (contractor arrived late) to BLOCKING (structural problem discovered that pauses all work).

**Issue fields:**

- Title and detailed description
- Severity: MINOR / MAJOR / BLOCKING
- Category: QUALITY_CONCERN / SCOPE_DISPUTE / TIMELINE_DISPUTE / COMMUNICATION / SAFETY / DAMAGE / PAYMENT_DISPUTE / OTHER
- Status: OPEN / ACKNOWLEDGED / RESOLVED / ESCALATED
- Blocks payment (auto-set to true for BLOCKING severity; manually togglable for MAJOR)
- Resolution notes and resolved timestamp

**BLOCKING issues.** When an issue with severity BLOCKING is logged:
- Project status shifts to PAUSED
- All DUE and PENDING payments shift to ON_HOLD
- A banner appears on the project dashboard: "Project paused due to a blocking issue. Payments are on hold until resolved."
- The homeowner can escalate to ESCALATED status, which surfaces a "Document for Dispute" CTA — this compiles the project's contract, change orders, milestone log, payment history, and photos into a single timestamped package downloadable as a PDF

**Issue timeline.** All issues are timestamped and immutable after logging. Notes can be added at any time. The issue log is ordered chronologically and serves as the paper trail if a dispute goes to arbitration or a contractor review.

---

### 8. Completion Workflow

When all milestones are COMPLETE (or ACCEPTED — see below), all payments are PAID, and there are no open BLOCKING issues, the homeowner can initiate the Completion Workflow.

**Pre-completion checklist.** The system verifies:
- All PERMIT_INSPECTION milestones are passed (if any existed)
- No milestones in DISPUTED status
- No open issues with BLOCKING or MAJOR status
- Final payment marked PAID
- At least one photo in the progress log

If any condition is unmet, the completion workflow is blocked with specific items listed for resolution.

**Contractor rating.** Before confirming completion, the homeowner rates the contractor across four dimensions:
- Work quality (1–5)
- Timeline adherence (1–5)
- Communication (1–5)
- Budget discipline (1–5 — based on change order history, auto-calculated suggestion based on variance)

Optional freeform review text. Ratings are posted to the contractor's profile in the Service Provider Directory.

**Warranty logging.** Prompted to enter the warranty period for the work (months). If a warranty document exists, upload or link from Document Vault. System sets a warranty expiry date and schedules a reminder 60 days before expiry.

**Write-back confirmation.** Before confirming, the homeowner sees a preview of all platform systems that will be updated (see section 9). They confirm once to apply all write-backs.

**Completion Record generation.** On confirmation, a completion record PDF is generated and stored in Document Vault. It contains:
- Project name, type, dates (start → completion)
- Contractor name, license, and contact
- Original contract amount, approved change orders, final contract total
- Milestone log with completion dates
- Payment log with paid dates and methods
- Open issues and resolutions
- Selected progress photos (up to 20, chosen by homeowner)

This document is the single authoritative record of the project. It auto-links to the Vault for resale disclosure: prospective buyers can see documented completed work as part of the property record.

---

### 9. Write-Back to Platform Systems on Completion

This is what distinguishes the project record from a standalone document. All write-backs occur only on COMPLETED status — not during the active project.

#### 9a. Digital Twin — System Condition Scores
Each home system type touched by the project gets its condition score reset. A newly replaced system starts with a condition score of 95–100. A repaired (but not replaced) system moves to the 75–85 range. The homeowner can override these defaults with their own assessment during the completion workflow. Condition changes are timestamped and attributed to the project record.

#### 9b. Capital Timeline — Replacement Clock Reset
For systems that were replaced (not just repaired), the Capital Timeline replacement event is updated:
- The replacement date is set to today (the completion date)
- The next expected replacement is calculated using the standard lifespan for the system type and the specific equipment installed (if make/model was logged in materials)
- The capital event cost estimate is reset to reflect current pricing for a future replacement
- The Reserve Health Score recalculates immediately — a replaced system reduces near-term reserve requirements

#### 9c. Material Specs Registry — Auto-Population
All materials tagged in the Progress Photo Log during the project are transferred to the Material Specs Registry:
- Material type, brand, color, model, finish, supplier, purchase date
- Room/area association (from photo room tags)
- Project source link (homeowner can trace any material record back to the project where it was installed)

This eliminates double-entry: materials logged during the project do not need to be re-entered in Material Specs.

#### 9d. Home Timeline
A Home Timeline event is created for the project:
- Event type: RENOVATION / REPAIR / REPLACEMENT (based on project type)
- Date range: project start → completion date
- Summary: project name, contractor, total cost paid
- Linked to: project record, completion PDF, and permit records if applicable

#### 9e. Home Events Log
A Home Events entry is created summarizing the work: system affected, work type, contractor, date, cost, and a link to the project record.

#### 9f. Permit Tracker
If any permits were associated with this project, they are marked as having reached Final Inspection Passed status (if the final inspection milestone was marked complete). The permit record links to the project completion record.

#### 9g. Vault — Resale Disclosure Package
The completion record is added to the homeowner's Vault as a "Recent Work" disclosure item. Prospective buyers or agents accessing the Vault via shared link can see:
- What work was done, when, and by whom
- Final cost
- Permits pulled and passed
- Warranty period remaining (calculated from warranty expiry date)

This evidence of well-documented, permitted, and completed work is a resale asset. Buyers assign higher value to documented improvements than undocumented ones.

#### 9h. Inspection Report Intelligence
If any Inspection Report findings were linked to this project (i.e., this project was initiated to resolve inspection findings), those findings are automatically marked RESOLVED with the project completion record as the resolution evidence.

---

## Project Types

Project types drive milestone templates, home system associations for write-back, and permit inspection lookups.

| Project Type | Home Systems Affected | Typical Milestones | Permit Likely |
|---|---|---|---|
| ROOF_REPLACEMENT | ROOF_EXTERIOR | Tear-off, underlayment, shingle installation, gutters, final | Yes |
| HVAC_REPLACEMENT | HVAC | Equipment delivery, old unit removal, installation, duct work, commissioning, final inspection | Yes |
| HVAC_REPAIR | HVAC | Diagnosis, repair, system test | Rarely |
| KITCHEN_REMODEL | PLUMBING, ELECTRICAL, INTERIOR | Demo, rough-in plumbing, rough-in electrical, inspections, cabinet install, countertop, appliances, final | Yes |
| BATHROOM_REMODEL | PLUMBING, ELECTRICAL, INTERIOR | Demo, rough-in plumbing, rough-in electrical, tile, fixtures, final | Yes |
| ELECTRICAL_PANEL | ELECTRICAL | Permit, old panel removal, new panel install, final inspection | Yes |
| PLUMBING_REPIPING | PLUMBING | Access, old pipe removal, new pipe installation, pressure test, wall repair, final | Yes |
| WATER_HEATER | PLUMBING | Old unit removal, installation, gas/electric connection, commissioning | Sometimes |
| FOUNDATION_WORK | STRUCTURAL | Assessment, excavation/access, repair, waterproofing, backfill, final | Yes |
| WINDOW_REPLACEMENT | EXTERIOR | Measurements, delivery, installation, caulk/seal, cleanup | Sometimes |
| FLOORING | INTERIOR | Subfloor prep, material installation, transitions, cleanup | No |
| PAINTING_INTERIOR | INTERIOR | Prep, primer, painting, touch-ups | No |
| PAINTING_EXTERIOR | ROOF_EXTERIOR | Prep, primer, painting, trim, cleanup | No |
| DECK_PATIO | STRUCTURAL, EXTERIOR | Permit, footing/foundation, framing, decking, railing, final inspection | Yes |
| ADDITION | STRUCTURAL, ELECTRICAL, PLUMBING | Full permit series, framing, MEP rough-in, inspections, insulation, drywall, finish | Yes |
| SEWER_LINE | PLUMBING | Permit, excavation, pipe replacement, inspection, backfill | Yes |
| SOLAR_INSTALLATION | ELECTRICAL | Design approval, permit, racking, panels, inverter, interconnection inspection | Yes |
| LANDSCAPING_MAJOR | SITE | Design approval, grading, drainage, planting, hardscape | Sometimes |
| GENERAL_REPAIR | (user selects) | User-defined | No |
| CUSTOM | (user selects) | User-defined | User indicates |

---

## Data Model

### ProjectRecord

```
id                          String
propertyId                  String          FK → Property
contractorId                String?         FK → Provider (from Service Provider Directory)
contractorName              String          (denormalized, in case contractor not in directory)
contractorLicense           String?
contractorPhone             String?
projectType                 Enum            (see Project Types above)
name                        String
description                 String?
status                      Enum            DRAFT | PLANNING | IN_PROGRESS | PAUSED | COMPLETED | CANCELLED | DISPUTED
sourceType                  Enum            PRICE_FINALIZATION | BOOKING | MANUAL
sourceId                    String?         FK to Price Finalization or Booking record
contractAmountCents         Int
approvedChangeOrderDeltaCents Int           (sum of approved change order deltas, updated on approval)
currentContractAmountCents  Int             (contractAmountCents + approvedChangeOrderDeltaCents)
paidToDateCents             Int             (sum of PAID payments)
startDate                   Date
expectedEndDate             Date?
actualEndDate               Date?
homeSystemsAffected         InventoryItemCategory[]
serviceCategory             ServiceCategory?
contractDocumentKey         String?         (S3 key)
completionRecordKey         String?         (S3 key, generated on completion)
warrantyPeriodMonths        Int?
warrantyExpiresAt           DateTime?
warrantyDocumentKey         String?         (S3 key)
contractorRatingQuality     Int?            (1–5)
contractorRatingTimeline    Int?            (1–5)
contractorRatingComms       Int?            (1–5)
contractorRatingBudget      Int?            (1–5)
contractorReviewText        String?
writeBackAppliedAt          DateTime?
createdAt                   DateTime
updatedAt                   DateTime
```

### ProjectMilestone

```
id                      String
projectId               String          FK → ProjectRecord
propertyId              String          (denormalized)
position                Int             (sort order within project)
name                    String
description             String?
milestoneType           Enum            STANDARD | PERMIT_INSPECTION | PAYMENT_TRIGGER | CUSTOM
status                  Enum            UPCOMING | IN_PROGRESS | COMPLETE | DELAYED | DISPUTED | BLOCKED
scheduledDate           Date?
actualCompletedDate     Date?
completionNotes         String?
completedByUserId       String?         FK → User
requiresPhotoEvidence   Boolean
dependsOnMilestoneId    String?         FK → ProjectMilestone (dependency)
linkedPaymentId         String?         FK → ProjectPayment (for PAYMENT_TRIGGER type)
linkedPermitMilestoneId String?         FK → PermitInspectionMilestone (for PERMIT_INSPECTION type)
daysDelayed             Int?            (calculated on delay)
createdAt               DateTime
updatedAt               DateTime
```

### ProjectPayment

```
id                      String
projectId               String          FK → ProjectRecord
description             String
amountCents             Int
triggerType             Enum            MILESTONE | DATE | MANUAL
triggerMilestoneId      String?         FK → ProjectMilestone
dueDate                 Date?           (calculated from trigger or set directly)
status                  Enum            PENDING | DUE | PAID | OVERDUE | DISPUTED | ON_HOLD
paidDate                Date?
paymentMethod           String?
receiptDocumentKey      String?         (S3 key)
notes                   String?
createdAt               DateTime
updatedAt               DateTime
```

### ProjectChangeOrder

```
id                      String
projectId               String          FK → ProjectRecord
changeNumber            Int             (sequential within project)
title                   String
description             String
category                Enum            HOMEOWNER_REQUEST | UNFORESEEN_CONDITION | MATERIAL_SUBSTITUTION | DESIGN_CHANGE | ERROR_CORRECTION | OTHER
costDeltaCents          Int             (positive = increase, negative = decrease)
status                  Enum            PROPOSED | APPROVED | REJECTED | VOIDED
proposedByName          String          (contractor name or homeowner)
supportingDocumentKey   String?         (S3 key)
approvedByUserId        String?         FK → User
approvedAt              DateTime?
notes                   String?
createdAt               DateTime
updatedAt               DateTime
```

### ProjectProgressLog

```
id                      String
projectId               String          FK → ProjectRecord
milestoneId             String?         FK → ProjectMilestone (nullable for daily notes)
entryDate               Date
entryType               Enum            MILESTONE_PHOTO | DAILY_NOTE | ISSUE_PHOTO | MATERIAL_DELIVERY
notes                   String?
photoKeys               String[]        (S3 keys)
roomId                  String?         FK → Room (for room-tagging)
materialType            String?         (for MATERIAL_DELIVERY entries)
materialBrand           String?
materialModel           String?
materialColor           String?
materialSupplier        String?
materialQuantity        String?
loggedByUserId          String
createdAt               DateTime
```

### ProjectIssue

```
id                      String
projectId               String          FK → ProjectRecord
title                   String
description             String
severity                Enum            MINOR | MAJOR | BLOCKING
category                Enum            QUALITY_CONCERN | SCOPE_DISPUTE | TIMELINE_DISPUTE | COMMUNICATION | SAFETY | DAMAGE | PAYMENT_DISPUTE | OTHER
status                  Enum            OPEN | ACKNOWLEDGED | RESOLVED | ESCALATED
blocksPayment           Boolean
resolutionNotes         String?
resolvedAt              DateTime?
resolvedByUserId        String?         FK → User
attachmentKeys          String[]        (S3 keys — photos, documents as evidence)
createdAt               DateTime
updatedAt               DateTime
```

### ProjectWriteBack

Audit log of every write-back action applied at completion.

```
id                  String
projectId           String          FK → ProjectRecord
targetSystem        Enum            DIGITAL_TWIN | CAPITAL_TIMELINE | MATERIAL_SPECS | HOME_TIMELINE | HOME_EVENTS | PERMIT_TRACKER | VAULT | INSPECTION_FINDINGS
targetRecordId      String?         (ID of the record created or updated)
action              Enum            CREATED | UPDATED | RESET | LINKED | RESOLVED
payload             Json            (snapshot of what was written)
appliedAt           DateTime
appliedByUserId     String
```

---

## Integration Points

| Platform System | Trigger | What the Project Tracker Does |
|---|---|---|
| Price Finalization | User clicks "Start Tracking" on a finalized quote | Creates ProjectRecord pre-populated with contractor, scope, and contract amount |
| Booking | User creates project from confirmed booking | Creates ProjectRecord with contractor and service category pre-populated |
| Permit Tracker | Project created for a permit-required project type | Queries active permits for property; surfaces outstanding inspections as PERMIT_INSPECTION milestones |
| Permit Tracker | PERMIT_INSPECTION milestone marked pass/fail | Updates the corresponding PermitInspectionMilestone record in the Permit Tracker |
| Digital Twin | Project marked COMPLETED | Updates condition scores for all affected home systems |
| Capital Timeline | REPLACEMENT-type project marked COMPLETED | Resets replacement event to today's date; recalculates next replacement using installed system lifespan |
| Reserve Health Score | Capital Timeline updated on project completion | Recalculates immediately; near-term reserve need for replaced system drops |
| Material Specs Registry | Project marked COMPLETED | Transfers all material delivery log entries to Material Specs for affected rooms/systems |
| Home Timeline | Project marked COMPLETED | Creates a Home Timeline event spanning start date to completion date |
| Home Events Log | Project marked COMPLETED | Creates a Home Events entry summarizing the work done |
| Document Vault | Contract, change order docs, receipts uploaded; completion record generated | Stores all documents with property and project association |
| Vault (Resale Disclosure) | Project marked COMPLETED | Adds completion record to Vault as "Recent Work" disclosure item with permit status and warranty remaining |
| Service Provider Directory | Project marked COMPLETED with contractor rating submitted | Posts rating to contractor's profile across the four dimensions |
| Inspection Report Intelligence | Project completion | Marks linked InspectionFinding records as RESOLVED with the project as resolution evidence |
| Negotiation Shield | User logs SCOPE_DISPUTE issue with ESCALATED status | Surfaces Negotiation Shield context for the scope in dispute |

---

## UI/UX Requirements

### Screens

**1. Project Creation Wizard**
Three-step flow: (1) Choose source — from Price Finalization, from Booking, or manual. (2) Project details — name, type, contractor, contract amount, start date, expected end date, contract document upload. (3) Milestone setup — accept template or customize. CTA: "Start Tracking."

**2. Project Dashboard (per project)**
- Header: project name, type chip, status chip, contractor name, start date, expected end date
- Four KPI tiles: Current Contract Total, Paid to Date, Remaining Balance, Days Until Expected Completion (or Days Overdue if past date)
- Milestone progress bar (count of complete / total milestones)
- Next upcoming milestone highlighted with scheduled date
- Quick action strip: Log Progress, Add Issue, Record Payment, Add Change Order
- Tabs below: Timeline, Payments, Change Orders, Log, Issues

**3. Milestone Timeline View**
Vertical timeline with milestone cards. Each card shows: name, type chip, scheduled date, status chip, linked payment indicator (if PAYMENT_TRIGGER), linked permit indicator (if PERMIT_INSPECTION), photo count badge. Expand to see description, completion notes, and photos. DELAYED and BLOCKED milestones are visually emphasized. Mark Complete button on each incomplete milestone.

**4. Payment Schedule View**
Table showing all payments in order. Columns: description, amount, trigger, due date, status chip, paid date. Row-level actions: Mark Paid (opens modal for payment method and receipt upload), Dispute. Footer row shows: contract total, paid to date, remaining. Budget variance banner appears if change orders exceed 10%.

**5. Change Order Log**
Chronological list of all change orders. Each entry: change number, title, category, cost delta (+/-), status chip. Approve/Reject actions on PROPOSED entries. Footer: original contract → change order deltas → current contract total. Add Change Order CTA at top.

**6. Progress Photo and Daily Log**
A reverse-chronological feed with date headers. Each entry shows: entry type chip, milestone association (if any), notes, photo thumbnails. Filter by milestone, date range, or entry type. Add Log Entry FAB — opens a modal for notes, photos, milestone tag, and material entry fields.

**7. Issue Log**
List of all issues. Filter by severity and status. Each issue card: title, severity chip, category, status chip, date logged, blocking payment indicator (if applicable). Open issue: full description, resolution notes, attachment thumbnails, status change controls. ESCALATED issues show the "Package for Dispute" CTA.

**8. Completion Workflow (multi-step)**
Step 1: Pre-completion checklist (green checks / red blocks with specific items). Step 2: Contractor rating (four sliders + text field). Step 3: Warranty entry (months + document upload). Step 4: Write-back preview — list of all systems to be updated. Step 5: Confirm. Progress indicator across top.

**9. Dispute Package Export**
Triggered from an ESCALATED issue. Single screen listing what will be included: contract document, signed change orders, milestone log with dates, payment history, issues log, progress photos (selectable). Generate PDF button — produces a timestamped compilation PDF stored in Document Vault.

**10. Project Hub (property-level)**
Card grid of all projects for the property. Active projects: status chip, milestone progress bar, next milestone due, current contract total. Completed projects: completion date, final cost, warranty expiry (if applicable). Cancelled projects: shown dimmed. Add Project CTA. Total spend across all projects aggregated at top (lifetime value tracker).

**11. Mobile-First Summary View**
On mobile, the Project Dashboard condenses to: status banner, next milestone due with Mark Complete button, payment due alert (if any), quick log photo button. All detail views are accessible but the mobile view prioritizes the most time-sensitive actions.

---

## Business Rules

1. **A project cannot move from DRAFT to IN_PROGRESS without at least one milestone and one payment defined.** The IN_PROGRESS status indicates active tracking, not just creation.

2. **A payment with MILESTONE trigger cannot be set to DUE status until its linked milestone is COMPLETE.** The system enforces this — there is no override for homeowners. Milestone completion is the gate.

3. **BLOCKING issues set the project to PAUSED and all DUE/PENDING payments to ON_HOLD.** Both conditions lift only when the BLOCKING issue is marked RESOLVED.

4. **Change orders must reach APPROVED status before they affect the current contract total.** PROPOSED and REJECTED change orders are visible in the log but excluded from financial totals.

5. **A project cannot be marked COMPLETED if any of these are true:** open BLOCKING or MAJOR issues, any milestone in DISPUTED status, final payment not marked PAID, active permits with outstanding inspections not yet passed.

6. **All write-backs to platform systems (Digital Twin, Capital Timeline, Material Specs, etc.) occur only on COMPLETED status.** Partial project progress does not trigger write-backs.

7. **For REPLACEMENT project types, the Capital Timeline reset uses the expected lifespan of the specific equipment installed.** If make/model was logged in the Progress Log, the platform looks up the standard lifespan for that equipment type. If not logged, a standard lifespan assumption is used by project type.

8. **Milestone completion requires a photo when "requires photo evidence" is enabled.** The Mark Complete action is blocked until at least one photo is attached to the milestone.

9. **Contractor ratings are required to complete the Completion Workflow.** They cannot be skipped. Ratings are posted to the contractor's Service Provider Directory profile only after the homeowner confirms completion — not at the time of rating entry.

10. **A Warranty reminder fires 60 days before expiry, and again at 30 days.** The reminder links directly to the project record so the homeowner can review the scope and contractor contact before the warranty lapses.

11. **A project with no activity (no log entries, milestone updates, or payment actions) for 30 calendar days generates a "Project Update Needed" notification.** This prevents projects from silently stalling without the homeowner noticing.

12. **Cancelled projects are soft-deleted.** All data is retained. The project can be reopened if the work resumes. No write-backs occur for CANCELLED status.

13. **The dispute package PDF is a timestamped, immutable export.** Once generated, it cannot be edited. A new version can be generated at any time (also immutable), and all versions are stored in Document Vault.

14. **Material Specs write-back deduplicates on material type + room.** If a material entry from the progress log matches an existing Material Specs record (same type and room), the existing record is updated rather than creating a duplicate.

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| Mobile support | Project Dashboard, Milestone Timeline, Progress Log, and Issue Log are fully functional on PWA mobile. Completion Workflow and Dispute Package are desktop-primary with mobile-accessible fallback. |
| Document storage | All uploaded documents (contracts, receipts, photos, change orders) stored in S3 with property-scoped access control. Retained for the life of the property record. |
| Photo upload limit | 50MB per photo, up to 200 photos per project |
| Dispute package PDF size | Generated PDFs capped at 100MB; homeowner selects photo subset if over limit |
| Access control | Project visible to: property owner and all invited Household Collaboration members. Write access (milestone completion, payment recording) requires EDITOR or OWNER role. |
| Offline | Progress log entries and photos queued for upload when connectivity returns. Milestone status changes require connectivity. |
| Audit trail | All milestone completions, payment status changes, change order approvals, and completion write-backs are logged with user, timestamp, and previous state. |
| Notifications | In-app + push notifications for: milestone becoming DELAYED, payment becoming DUE or OVERDUE, BLOCKING issue opened, project stale for 30 days, warranty expiring in 60 and 30 days. |

---

## Out of Scope

- **Contractor-facing portal.** The project tracker is the homeowner's tool. Contractors are referenced by name and contact but do not have logins to view or update the project.
- **Automated payment processing.** The tracker records that a payment was made. It does not process, hold, or disburse funds.
- **Contract drafting.** The tracker stores and references contracts but does not generate them. Legal contract generation requires attorney involvement.
- **Building code lookup.** When permit inspections are surfaced, the tracker does not interpret what the inspector checks for or what code compliance requires.
- **Real-time contractor communication.** There is no in-app messaging to contractors. Communication happens outside the platform (phone, email, text); the project log is for recording outcomes, not facilitating conversation.
- **Multi-contractor subcontractor management.** The project is associated with a primary contractor. Subcontractors are referenced in notes and log entries but do not have separate tracking records. A general contractor managing subcontractors does so outside the platform.
- **Insurance claim initiation from project damage.** If the project causes or reveals damage, the homeowner is directed to the existing Claims Assistance feature. The two are not automatically linked.
