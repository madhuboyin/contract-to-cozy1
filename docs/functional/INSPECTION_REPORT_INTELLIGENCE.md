# Inspection Report Intelligence

## Overview

Inspection Report Intelligence transforms a static inspection PDF into a living, structured record that updates the homeowner's entire property profile. A professional home inspection report is the most data-rich document a homeowner ever receives — yet it typically sits unused in an email folder within weeks of being delivered.

The feature ingests inspection reports from any stage of homeownership (purchase, annual, pre-listing, specialty), extracts every finding through AI, and writes the results back into the Digital Twin, Capital Timeline, Permit Tracker, Coverage Intelligence, Reserve Health Score, and resale Vault. The findings become persistent, trackable work items that accumulate across the life of ownership — not a one-time PDF summary.

**Core differentiation from generic AI tools.** Any AI chat product can summarize an inspection PDF. The differentiated value here is the write-back: findings update home system condition scores, shift replacement timelines, cross-reference permit records, flag insurance coverage gaps, and trigger contractor quote workflows — all without manual re-entry. Three years later, when the homeowner is selling, the open items from this report are still tracked and auto-populate the disclosure package.

---

## Scope Boundaries

| Capability | In Scope | Out of Scope |
|---|---|---|
| PDF inspection report ingestion | ✓ | Real-time video or live inspection feed |
| AI finding extraction | ✓ | Building code lookup or compliance interpretation |
| Write-back to Digital Twin, Capital Timeline, Permit Tracker | ✓ | Automatic permit filing |
| Buyer negotiation package | ✓ | Legal advice on negotiation strategy |
| Seller fix/disclose decision | ✓ | Disclosure form generation (legal document) |
| Open item tracking and resolution | ✓ | Contractor scheduling (links to Service Provider Directory) |
| Multi-inspection comparison | ✓ | Appraisal report processing |
| Specialty inspection reports (roof, sewer, HVAC) | ✓ | Environmental reports (asbestos, lead, mold lab) |

---

## User Personas and Entry Points

### Persona 1 — The Buyer (highest urgency)
Just received a purchase inspection report. Has 5–10 days to decide what to negotiate. Needs: prioritized findings, cost estimates, a negotiation package, and a way to track what the seller agrees to fix before closing.

### Persona 2 — The Existing Homeowner (highest frequency)
Had an annual or maintenance inspection done on a home they already own. Needs: their home records updated, an understanding of what changed since last time, and a prioritized list of what to address in the next 12 months.

### Persona 3 — The Pre-Listing Seller (highest financial stakes)
Had a pre-listing inspection to get ahead of buyer requests. Needs: a fix/disclose/price-adjust decision for each finding, and an updated Vault disclosure package that reflects what they've chosen to address.

---

## Feature Components

### 1. Report Upload and Ingestion

The homeowner uploads one or more inspection report PDFs to a property. The system accepts:

- Digital PDFs (text-native, direct extraction)
- Scanned PDFs (OCR pipeline with confidence scoring)
- PDFs with embedded photos (photos extracted and stored alongside their parent findings)

**Report type classification.** On upload, the user selects the report type from: General Home Inspection, Roof Inspection, HVAC Inspection, Sewer Scope, Electrical Inspection, Foundation/Structural, Pre-Purchase, Pre-Listing, Annual/Maintenance, or Other. Report type drives which Digital Twin systems are primarily updated.

**Inspection metadata.** The system attempts to auto-extract: inspector name, license number, company, inspection date, and property address. If extraction confidence is below threshold, the user is prompted to confirm.

**Multi-report support.** A property can have unlimited inspection reports across its history. All reports are stored, versioned, and comparable.

---

### 2. AI Extraction Engine

The extraction engine processes each report and produces structured findings, not a prose summary. Every finding is extracted into a discrete, database-stored record with the following fields:

- **Home system** — mapped to one of 13 standardized categories matching the Digital Twin (see Data Model)
- **Subsystem / location** — specific component and location within the home (e.g., "Northwest corner, master bathroom, under-sink supply line")
- **Condition rating** — extracted from inspector language and normalized to: Good / Fair / Poor / Safety Concern
- **Severity classification** — assigned by AI based on language, cost implication, and system criticality: SAFETY / MAJOR / MINOR / MONITOR / INFORMATIONAL
- **Inspector's description** — verbatim extracted text from the report
- **Inspector's recommendation** — extracted action: Monitor / Repair / Replace / Further Evaluation / Safety-Immediate
- **AI-interpreted action** — C2C's interpretation translated into homeowner-friendly language
- **Cost estimate range** — local-market-adjusted range in cents (low/high), pulled from the platform's existing service pricing data and regional cost indices
- **Associated photos** — any photos in the PDF anchored to this finding
- **Extraction confidence** — HIGH / MEDIUM / LOW per finding

**Confidence handling.** Findings with LOW confidence are flagged for mandatory user review before any write-back occurs. Users can edit the extracted text, reclassify the system, or dismiss the finding entirely before confirming.

**Appliance identification.** When a finding references a specific appliance, the engine attempts to extract make, model, and approximate age to cross-reference against the Recall Matching system and the homeowner's existing inventory.

---

### 3. Review and Confirmation Interface

After extraction, the homeowner reviews all findings before any write-back occurs. This is not automatic — the homeowner is the authority.

**Finding review screen.** Findings are grouped by home system. Each finding shows: severity chip, condition rating, inspector description, AI-interpreted action, cost range, and a preview of what will be written back to the platform. The homeowner can:
- Accept as extracted
- Edit any field (description, severity, cost estimate)
- Reassign to a different home system
- Dismiss (with optional reason: "already resolved," "inspector error," "not applicable")

**Write-back preview panel.** Before confirming, a summary panel shows exactly which platform systems will be updated: "This will update 3 Digital Twin system scores, add 2 Capital Timeline events, flag 1 permit cross-reference, and surface 1 coverage gap in Coverage Intelligence." The homeowner confirms once to apply all write-backs.

---

### 4. Write-Back to Platform Systems

This is the core differentiator. Each confirmed finding triggers updates across the platform based on its system and severity.

#### 4a. Digital Twin — System Condition Scores
Each of the 13 home system categories has a condition score in the Digital Twin (0–100). Confirmed inspection findings update these scores:
- SAFETY finding → condition score drops to the severity floor for that system (0–25 range)
- MAJOR finding → score moves into the 26–50 range if currently above it
- MINOR finding → score moves into the 51–75 range if currently above it
- MONITOR finding → no automatic score change; recorded as a condition note
- INFORMATIONAL / Good condition findings → can positively contribute to score

Score changes from inspection findings are timestamped and attributed to the report, so the condition history is fully auditable.

#### 4b. Capital Timeline
When a finding contains remaining-lifespan language (e.g., "roof has approximately 3–5 years of useful life remaining"), the engine extracts the estimate and proposes a Capital Timeline event update:
- If no event exists for that system: creates a new replacement event at the midpoint of the estimated range
- If an event already exists: shows a side-by-side comparison of the current planned date vs. the inspection-implied date and asks the homeowner to confirm which to use

Cost estimate from the finding is attached to the Capital Timeline event and flows into the Reserve Health Score recalculation.

#### 4c. Permit Tracker Cross-Reference
When a finding indicates work that should have required a permit (e.g., "electrical panel appears to have been upgraded," "room addition," "HVAC system replaced," "deck added"), the system:
- Queries the Permit Tracker for that work type on the property
- If a matching permit exists: links the finding to the permit record (resolved — permitted work)
- If no matching permit exists: creates an unpermitted work flag in the Permit Tracker with source `INSPECTION_REPORT_FINDING`, mirroring the manual flag workflow already in the Permit Tracker

This is the connection that no generic AI tool can make — it knows what was permitted at this specific address.

#### 4d. Coverage Intelligence Gap Flagging
When a finding reveals a condition that may have insurance implications, a gap flag is raised in Coverage Intelligence:
- Foundation cracks or water intrusion → checks if policy covers foundation/water damage; flags if excluded
- HVAC system failure noted as pre-existing → flags that a home warranty claim may be denied on this item as a known condition
- Roof deterioration → flags if policy has a roof age clause that may affect claims or renewability
- Electrical panel type (Federal Pacific, Zinsco, aluminum wiring) → flags known insurer surcharge or non-renewal triggers

#### 4e. Recall Matching
Any appliance identified by make and model in a finding is checked against the active recall database. If a match is found, the recall alert is surfaced on the finding card and in the homeowner's main notification feed.

#### 4f. Reserve Health Score
After write-back to Capital Timeline, the Reserve Health Score is automatically recalculated to reflect the updated replacement schedule. If the inspection reveals the need to pull major replacements forward, the score adjusts and surfaces a new monthly savings target.

---

### 5. Open Item Tracking

Every confirmed finding with a non-INFORMATIONAL severity becomes a tracked open item. The homeowner sees all open items across all reports for a property in a single view, filterable by severity, system, and report.

**Resolution workflow.** An item can be marked resolved through:
- Linking to a completed Project Execution record (contractor work with invoice)
- Linking to a home event log entry (DIY repair)
- Homeowner attestation with optional notes and photo upload

When resolved, the item is closed with a timestamp, resolution method, and cost paid. The Digital Twin condition score for the affected system is updated upward based on the repair.

**Warranty tracking.** If the resolution was contractor work, the homeowner is prompted to log the warranty period. The system sets a reminder before warranty expiration so the homeowner can inspect the repaired area before the warranty lapses.

---

### 6. Multi-Report Comparison

When two or more inspection reports exist for a property, a comparison view shows the delta across inspections:

- **Resolved** — items that appeared in an older report but are no longer present (and were marked resolved)
- **Persisted** — items that appeared in an older report and are still open
- **New** — items that appear for the first time in the newer report
- **Worsened** — items present in both reports where the condition rating declined

This view answers the question: "In the 3 years since I bought this home, have things gotten better or worse?" It is also the primary input for the pre-listing seller's disclosure workflow.

---

### 7. Buyer Negotiation Package

Available when the report type is Pre-Purchase and the homeowner has accepted it into a property record.

The homeowner selects which findings to include in the negotiation request. The system generates a structured negotiation package with:

- Selected findings with inspector descriptions, severity ratings, and C2C cost estimates
- A "request for credit" total (sum of cost estimate midpoints for selected items)
- A "request for repair" list (items where repair is preferable to credit)
- Items classified as "accept as-is" (minor/informational items the buyer accepts)

The package integrates with the existing Negotiation Shield: the buyer can see leverage points, comparable repair costs from the Service Price Radar, and AI-generated response language if the seller pushes back on individual items.

The package does not generate legal documents. It generates a structured, data-backed position the buyer can use in negotiation — copy-paste ready but presented as a homeowner tool, not a legal form.

---

### 8. Seller Fix / Disclose Decision Workflow

Available when the report type is Pre-Listing.

For each finding, the seller chooses one of three paths:
- **Fix before listing** — links to Service Provider Directory to get quotes; once resolved, removes from disclosure consideration (with documentation)
- **Disclose and price-adjust** — marks as a known condition to be included in the disclosure package; optionally attach a cost estimate the seller will communicate to buyers
- **Disclose and offer credit** — same as above but flags that the seller intends to offer a buyer credit rather than repair

The aggregate output — a structured list of known conditions with fix/disclose status — auto-populates the property's Vault disclosure package. The Vault is what prospective buyers or their agents access via shared link.

---

### 9. Inspection Hub (Property-Level Dashboard)

Each property has an Inspection Hub that shows:

- All inspection reports uploaded, in chronological order, with report type and date
- Open item count per report and in aggregate across all reports
- Condition score history for each home system, with inspection events marked on the timeline
- A "since purchase" summary: total open items found, total resolved, total cost of repairs made
- Quick actions: Upload new report, View all open items, Compare two reports, Generate disclosure package

---

## Data Model

### InspectionReport

```
id                  String    (PK)
propertyId          String    (FK → Property)
reportType          Enum      (GENERAL | ROOF | HVAC | SEWER | ELECTRICAL | FOUNDATION | PRE_PURCHASE | PRE_LISTING | ANNUAL | OTHER)
inspectionDate      DateTime
inspectorName       String?
inspectorLicense    String?
inspectorCompany    String?
sourceFileKey       String    (S3 key for original PDF)
status              Enum      (PROCESSING | REVIEW_PENDING | CONFIRMED | ARCHIVED)
totalFindings       Int
openFindings        Int
safetyFindings      Int
majorFindings       Int
extractionModel     String    (AI model version used)
createdAt           DateTime
processedAt         DateTime?
confirmedAt         DateTime?
```

### InspectionFinding

```
id                      String    (PK)
reportId                String    (FK → InspectionReport)
propertyId              String    (FK → Property, denormalized for query efficiency)
homeSystem              Enum      (ROOF | EXTERIOR | FOUNDATION | BASEMENT_CRAWLSPACE | STRUCTURAL | ELECTRICAL | PLUMBING | HVAC | INTERIOR | ATTIC_INSULATION | APPLIANCES | GARAGE | SITE_GRADING)
subsystem               String?   (free text, e.g. "Main electrical panel", "Supply line under kitchen sink")
location                String?   (e.g. "Northwest corner, second floor")
conditionRating         Enum      (GOOD | FAIR | POOR | SAFETY_CONCERN)
severity                Enum      (SAFETY | MAJOR | MINOR | MONITOR | INFORMATIONAL)
inspectorDescription    String    (verbatim extracted text)
inspectorRecommendation Enum      (MONITOR | REPAIR | REPLACE | FURTHER_EVALUATION | SAFETY_IMMEDIATE)
aiInterpretation        String    (homeowner-friendly restatement)
estimatedCostCentsLow   Int?
estimatedCostCentsHigh  Int?
extractionConfidence    Enum      (HIGH | MEDIUM | LOW)
status                  Enum      (OPEN | RESOLVED | DISMISSED | ACCEPTED_AS_IS)
resolvedAt              DateTime?
resolutionMethod        Enum?     (CONTRACTOR_WORK | DIY | SELLER_REPAIR | CREDITED_AT_CLOSING | DISMISSED)
resolutionNotes         String?
resolutionCostCents     Int?
warrantyExpiresAt       DateTime?
permitFlagId            String?   (FK → PermitUnpermittedFlag if cross-ref created)
inventoryItemId         String?   (FK → InventoryItem if matched)
recallMatchId           String?   (FK → recall record if matched)
photoKeys               String[]  (S3 keys for extracted photos)
createdAt               DateTime
updatedAt               DateTime
```

### InspectionWriteBack

Audit log of every write-back action taken when a report is confirmed.

```
id              String    (PK)
reportId        String    (FK → InspectionReport)
findingId       String?   (FK → InspectionFinding, null for report-level write-backs)
targetSystem    Enum      (DIGITAL_TWIN | CAPITAL_TIMELINE | PERMIT_TRACKER | COVERAGE_INTELLIGENCE | RECALL_MATCHING | RESERVE_SCORE)
targetRecordId  String?   (ID of the record that was created or updated)
action          Enum      (CREATED | UPDATED | FLAGGED | LINKED)
payload         Json      (snapshot of what was written)
appliedAt       DateTime
appliedByUserId String
```

---

## Integration Points

| Platform System | What Triggers | What C2C Does |
|---|---|---|
| Digital Twin | Any SAFETY/MAJOR/MINOR finding confirmed | Updates condition score for the affected home system; records inspection event on condition history timeline |
| Capital Timeline | Finding contains lifespan estimate or MAJOR finding for a replaceable system | Proposes new or updated replacement event; user confirms |
| Reserve Health Score | Capital Timeline updated | Recalculates immediately; surfaces new monthly savings target if score drops |
| Permit Tracker | Finding references work that requires a permit | Queries permit history; creates unpermitted flag if no matching permit found |
| Coverage Intelligence | Finding has insurance implication (water, foundation, electrical, roof) | Creates coverage gap flag with context note |
| Recall Matching | Finding identifies appliance by make/model | Checks against recall database; raises alert if match found |
| Inventory / Appliance Oracle | Finding references a specific appliance | Links finding to inventory record; updates condition; adjusts lifespan estimate if stated |
| Service Provider Directory | User selects "Get Quotes" on a finding | Pre-filters by the required trade type for the finding's home system |
| Negotiation Shield | Buyer selects findings to negotiate | Surfaces leverage context and response language for each item |
| Vault | Seller runs fix/disclose workflow | Disclosure package auto-updates with confirmed known conditions |
| Document Vault | Report upload | Original PDF stored alongside other property documents |

---

## UI/UX Requirements

### Screens

**1. Upload Screen**
- Drag-and-drop zone accepting PDF files up to 200MB
- Report type selector (dropdown, required)
- Inspection date picker (required; defaults to today)
- Optional: inspector name override field
- Processing starts immediately on upload; user does not wait on this screen

**2. Processing Screen**
- Progress indicator with status messages: "Reading report structure → Extracting findings → Estimating costs → Cross-referencing your home data → Ready for review"
- Target processing time: under 90 seconds for a standard 50-page report
- Error state: if processing fails, user is shown the failure reason and offered manual entry as fallback

**3. Review Screen — Finding List**
- Grouped by home system (tabs or collapsible sections)
- Each finding card shows: severity chip (color-coded), condition rating, subsystem/location, cost range, AI confidence indicator
- LOW confidence findings are visually distinguished and cannot be bulk-confirmed — they must be individually reviewed
- Bulk confirm available for HIGH and MEDIUM confidence findings within a group
- Edit icon on each card opens the detail sheet

**4. Finding Detail Sheet**
- Full inspector description (verbatim)
- AI interpretation (editable)
- Severity selector (editable)
- Home system selector (editable)
- Cost estimate range (editable, in dollars)
- Write-back preview: what will be updated in the platform if this finding is confirmed
- Photos carousel (if any extracted from report)
- Recall alert badge (if appliance matched)
- Save / Dismiss controls

**5. Write-Back Confirmation Panel**
- Shown before final confirmation of the entire report
- Summary: "X findings confirmed. Here's what will be updated across your property:"
  - List of Digital Twin systems with new condition scores
  - Capital Timeline events being added or modified
  - Permit flags being created
  - Coverage gaps being raised
  - Recall alerts being surfaced
- "Confirm and Apply" CTA — single action applies all write-backs
- "Go back and review" link

**6. Inspection Hub (per property)**
- Card for each report with: report type, date, inspector, open/resolved counts, severity breakdown bar
- "Add Report" CTA
- "All Open Items" CTA → filters to unresolved findings across all reports
- Condition Score History chart with inspection events marked
- Compare two reports selector

**7. Open Items View**
- Table or card list of all unresolved findings across all reports for the property
- Filters: Severity, Home System, Report, Date Range
- Sort: Severity (default), Cost (high to low), System
- Each item has a "Resolve" button and "Get Quotes" shortcut
- SAFETY findings always pinned to top regardless of sort

**8. Multi-Report Comparison View**
- Two-column layout with report A on left, report B on right
- Sections: Resolved Since A, New in B, Persisted (open in both), Worsened
- Each row shows the finding with before/after condition rating

**9. Buyer Negotiation Package**
- Checklist of confirmed findings
- Per-item controls: Negotiate / Accept as-is / Request repair (vs. credit)
- Running total of requested credit (sum of cost midpoints)
- Preview of the package as it will appear to the other party
- "Copy to clipboard" and "Export PDF" options

**10. Seller Fix / Disclose Workflow**
- Finding list with three-way radio per item: Fix / Disclose + Price Adjust / Disclose + Credit
- Resolved findings (already fixed) are automatically excluded
- Running tally of estimated fix costs and disclosures
- "Update Vault Disclosure Package" CTA at bottom

---

## Business Rules

1. **No write-back without user confirmation.** The platform previews every write-back action before applying it. Write-backs cannot be triggered automatically without explicit user confirmation at the review screen.

2. **SAFETY findings are mandatory review.** SAFETY severity findings cannot be bulk-confirmed. They must be individually reviewed and require explicit acknowledgment before the homeowner can proceed past the review screen.

3. **LOW confidence findings cannot be bulk-confirmed.** They must be individually reviewed and either edited to acceptable accuracy or dismissed.

4. **Permit cross-reference runs automatically but flags are created only on user confirmation.** The query runs at processing time. The permit flag in the Permit Tracker is only created when the finding is confirmed in the review step.

5. **Cost estimates are always shown as ranges, never point values.** Displayed as "$1,200 – $3,500" to avoid over-precision. Ranges are derived from the platform's service pricing data adjusted for the property's zip code.

6. **An item can only be marked Resolved via an auditable method.** Accepted methods: linked Project Execution record, linked Home Event log entry, or homeowner attestation. Attestation requires a text note and prompts (but does not require) a photo upload.

7. **Dismissed findings are retained, not deleted.** A dismissed finding is stored with a dismissed status, reason, and timestamp. It is excluded from open item counts and write-backs but remains visible in the report's finding history.

8. **Digital Twin score changes from inspection findings are bounded.** An inspection finding can lower a system's condition score but can never raise it above the score that would result from a "Good" condition finding. Condition scores increase through resolved items and positive maintenance records, not through inspection findings alone.

9. **Multi-report comparison only compares confirmed reports.** Reports still in REVIEW_PENDING or PROCESSING status are excluded from comparison views.

10. **The Negotiation Package and Fix/Disclose workflow are mutually exclusive per report.** A Pre-Purchase report can generate a Negotiation Package. A Pre-Listing report can generate a Fix/Disclose workflow. A General report cannot generate either (it goes to open item tracking only).

11. **The Vault disclosure package reflects fix/disclose decisions, not raw findings.** Only findings where the seller chose "Disclose + Price Adjust" or "Disclose + Credit" appear in the Vault package. Fixed items are documented as resolved, not as active disclosures.

12. **All extracted photos are stored in the homeowner's Document Vault**, linked to both the report and the individual finding. They are not discarded after the report is processed.

---

## AI Processing Requirements

### Supported Input Formats
- Text-native PDF (direct extraction, no OCR required)
- Scanned PDF (OCR pipeline; minimum 150 DPI for acceptable accuracy)
- PDF with embedded JPEG/PNG images (extracted and stored separately)
- Combined reports (single PDF containing multiple inspection types)

### Extraction Targets
The extraction pipeline must reliably produce structured output for:
- All ASHI-standard and InterNACHI-standard report formats
- Common proprietary inspector software formats (HomeGauge, Spectora, Horizon, 3D Inspection System)
- Non-standard inspector-authored formats (PDF narrative style)

### Confidence Scoring
Each finding is assigned a confidence score based on:
- Whether the finding boundary was clearly delineated in the source document
- Whether the home system classification was unambiguous
- Whether the severity was explicit in inspector language vs. inferred
- Whether the cost estimate was stated by the inspector vs. fully AI-generated

### Performance Targets
- Standard 50-page general inspection report: under 90 seconds from upload to review-ready
- Large specialty reports or multi-specialty combined reports (100+ pages): under 4 minutes
- Processing runs asynchronously; user is notified via in-app notification and email when review is ready

### Fallback
If the AI extraction pipeline fails or produces fewer than 5 findings on a report that appears substantive, the system surfaces a manual entry fallback. The user can enter findings one by one using a structured form. The original PDF is always stored in Document Vault regardless of extraction outcome.

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| PDF upload size limit | 200MB per file |
| Storage | All PDFs and extracted photos stored in S3 with property-scoped access control |
| Access control | Only the property owner and invited household members can view, confirm, or dismiss findings |
| Retention | Reports and findings retained for the life of the property record; not deleted on plan downgrade |
| Audit trail | All write-back actions logged to `InspectionWriteBack` with user, timestamp, and payload snapshot |
| GDPR / data deletion | If user deletes their account, reports and findings are purged within 30 days; write-back logs anonymized |
| Mobile support | Upload, review, and open item tracking fully supported on mobile (PWA). Negotiation package and comparison views are desktop-primary with readable mobile fallback. |
| Offline | Upload queued for when connectivity returns. Review and confirmation require connectivity. |

---

## Out of Scope

- **Legal disclosure form generation.** The feature produces inputs for a disclosure package but does not generate legally compliant disclosure forms. Those vary by jurisdiction and require legal review.
- **Environmental lab reports.** Asbestos, lead, mold lab, radon measurement, and water quality reports are out of scope. These require licensed professionals to interpret and carry liability implications.
- **Appraisal reports.** A different document type with different regulatory implications.
- **Real-time or live inspection capture.** The feature processes completed inspection reports as PDFs, not live inspection sessions.
- **Automated contractor booking.** The feature surfaces findings and links to the Service Provider Directory for quotes. It does not automatically create bookings.
- **Building code interpretation.** When a finding references a code violation, C2C notes it but does not interpret local code or render a compliance opinion.
