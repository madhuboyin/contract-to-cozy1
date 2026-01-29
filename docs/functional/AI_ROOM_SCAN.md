# Functional Requirements Document (FRD)
## AI Room Scan → Inventory Drafts

---

## 1. Overview

The **AI Room Scan** feature enables homeowners to upload photos of a room and automatically generate **inventory drafts** using computer vision and AI. Users can review, select, dismiss, and confirm detected items into their inventory.

This feature is designed to:
- Reduce manual inventory entry
- Improve accuracy via AI-assisted detection
- Maintain user control via draft review
- Support future premium and confidence-based workflows

---

## 2. Goals & Non-Goals

### Goals
- Detect items in room images using AI
- Create inventory drafts tied to a scan session
- Allow users to review, select, dismiss, or confirm drafts
- Safely handle partial failures and model unavailability
- Provide a stable, backward-compatible API contract

### Non-Goals
- No auto-confirmation without user review
- No hard dependency on a single AI provider
- No premium gating enforced yet

---

## 3. User Flow

1. User navigates to **Room → AI Scan**
2. Uploads 1–10 room photos
3. Backend:
   - Creates a scan session
   - Calls Gemini Vision model
   - Extracts item candidates
   - Stores results as `InventoryDraftItem`
4. Frontend:
   - Displays drafts with category & confidence
   - Allows multi-select
5. User actions:
   - **Add selected to inventory**
   - **Dismiss selected**
6. Confirmed drafts become real `InventoryItem` records

---

## 4. Functional Requirements

### 4.1 Scan Room (AI)

**Endpoint**
POST /api/properties/:propertyId/inventory/rooms/:roomId/scan-ai

css
Copy code

**Input**
- Multipart form-data
- One or more image files

**Output**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "drafts": [
      {
        "id": "uuid",
        "name": "Bed",
        "category": "FURNITURE",
        "confidence": 0.65
      }
    ]
  }
}
Behavior

Always returns a sessionId

Always returns drafts as an array (empty allowed)

Errors are surfaced with structured error codes

4.2 Inventory Drafts
Drafts represent AI-suggested items, not yet part of inventory.

Properties

Name

Category

Confidence score

Room association

Scan session association

Status (DRAFT, CONFIRMED, DISMISSED)

4.3 Bulk Confirm Drafts
Allows users to confirm multiple drafts at once.

Endpoints (both supported)

swift
Copy code
POST /inventory/drafts/bulk-confirm
POST /inventory/drafts/bulk/confirm
Input

json
Copy code
{
  "draftIds": ["uuid1", "uuid2"]
}
Behavior

Creates InventoryItem records

Marks drafts as CONFIRMED

Idempotent per draft ID

4.4 Bulk Dismiss Drafts
Allows users to discard drafts.

Endpoints (both supported)

swift
Copy code
POST /inventory/drafts/bulk-dismiss
POST /inventory/drafts/bulk/dismiss
Behavior

Marks drafts as DISMISSED

No inventory item is created

5. Error Handling
Structured Error Codes
Code	Meaning
ROOM_SCAN_MODEL_UNAVAILABLE	AI model not accessible
INTERNAL_ERROR	Unexpected backend failure
VALIDATION_ERROR	Invalid input
NOT_FOUND	Route or resource missing

Guarantees
No silent failures

UI-safe error messages

Backend logs contain full stack trace

6. Backend Files Created / Updated
Controllers
inventoryRoomScan.controller.ts

inventoryDraft.controller.ts

inventoryOcr.controller.ts

Services
roomScan.service.ts

inventoryDraft.service.ts

inventory.service.ts

Routes
inventory.routes.ts

Added alias routes for bulk-confirm / bulk-dismiss

Middleware
auth.middleware.ts

propertyAuth.middleware.ts

rateLimiter.middleware.ts

error.middleware.ts

validate.middleware.ts

7. Frontend Files Updated
Components
RoomScanModal.tsx

RoomDetailClient.tsx

RoomShowcaseClient.tsx

RoomsClient.tsx

RoomsHubClient.tsx

InventoryClient.tsx

API Layer
inventoryApi.ts

client.ts

UX Enhancements
Draft count + selected count

Confidence indicator

Graceful empty-state handling

Clear error banners

8. Database Changes
New / Used Tables
inventory_draft_items
id

property_id

room_id

scan_session_id

name

category

confidence

status

created_at

inventory_items
Created on confirm

Linked back to draft via source metadata

Notes
No destructive migrations

Fully backward-compatible

Draft lifecycle is explicit and auditable

9. Configuration & Environment
Required Environment Variables
nginx
Copy code
GEMINI_API_KEY
ROOM_SCAN_GEMINI_MODEL
Model Fallback Strategy
Tries configured model first

Fails gracefully with explicit error if unavailable

No hard-coded model dependency

10. Security & Permissions
Auth required for all routes

Property ownership enforced

Rate limiting applied to scan endpoint

Scan sessions scoped to property + room

11. Observability
Backend logs AI provider failures clearly

Frontend logs raw scan responses in dev

Session ID surfaced in UI for debugging

12. Future Enhancements (Planned)
Phase 2
Confidence-based auto-selection

Group similar items (e.g., pillows → bedding)

Draft editing before confirmation

Retry scan with different model

Phase 3
Premium gating (OCR + Vision)

Multi-room batch scan

Duplicate detection against inventory

Confidence explanations (Why detected?)

Nice-to-Have
Heatmap overlay on images

Image-to-item bounding boxes

Confidence learning from user feedback

Scan history per room

Export drafts to CSV / PDF

13. Open Questions
Should low-confidence items auto-unselect?

Should dismissed drafts be permanently ignored?

How long should scan sessions be retained?

14. Summary
The AI Room Scan feature is now:

Stable

Backward-compatible

User-safe

Extensible

It forms a strong foundation for intelligent inventory creation and future AI-driven home insights.

markdown
Copy code

If you want, next we can:
- Turn this into a **1-page executive summary**
- Split it into **FRD + TRD**
- Add **sequence diagrams** (Mermaid)
- Or prepare **Phase 2 implementation tickets**


***** Enhancements ******

AI Room Scan – Phase 3 (Best-in-Class Experience)
1. Overview

Phase 3 elevates AI Room Scan from a functional inventory tool into a best-in-class, trust-first, claims-ready experience.

The focus is on:

Visual explainability (what was detected and where)
Effortless capture and review
Scan history and progress over time
Practical exports users immediately value
Lightweight learning from user feedback

Phase 3 does not introduce premium gating yet, but is architected to support it later.

2. Phase 3 Goals

Primary Goals

Make AI detections explainable, visual, and trustworthy
Reduce user effort to complete a room scan (< 2 minutes)
Provide insurance-ready outputs with minimal clicks
Encourage repeat scanning via history + deltas
Improve AI usefulness via explicit user feedback

Non-Goals

No fully automated inventory confirmation
No opaque or “black box” AI decisions
No hard dependency on a single AI provider
No retraining claims (feedback is preference-based, not model-level)

3. Phase 3 Feature Set (High Level)
Category	Feature
Visual Trust	Bounding boxes, image↔item linking
Capture UX	Guided scan mode, quality checks
History	Scan history per room + deltas
Export	Draft export to CSV / Insurance-ready PDF
Learning	Confidence calibration from feedback
Utility	Bulk actions, quick review tools

4. User Experience & Flow

4.1 Guided Room Scan (Capture Phase)

New UX

“Guided Scan Mode” overlay:
Suggested angles (corners, wide shot)
Quality indicators (blur / low light)

Progressive results:
Drafts appear as they are detected
No blocking spinner

Outcome

Higher recall
Fewer missed items
Less rescanning

4.2 Visual Explainability (Review Phase)

Each draft item includes:

One or more bounding boxes on source images
Confidence tier: HIGH | MEDIUM | LOW
“Why detected” explanation:
visual cues
multi-image agreement
size/shape consistency

UX interactions

Tap item → highlight bounding boxes
Tap box → scroll to item
Heatmap overlay (optional toggle)

4.3 Draft Review Enhancements

Building on Phase 2:

Confidence-based auto-selection (already implemented)
Grouped items (e.g., pillows → bedding)
Delta awareness:
“New since last scan”
“Seen before (duplicate)”
“Removed / missing”

4.4 Scan History Per Room

Each room maintains a scan timeline.
Session metadata
Timestamp
Status
Item counts (draft / confirmed / dismissed)
Provider used
Error (if any)
User actions
Reopen session
Compare with previous scan
Export drafts
UX goal
Scanning feels like maintenance, not a one-time chore

4.5 Draft Export (Fast Utility Win)
CSV Export (Phase 3 – required)

Draft metadata
Confidence values
Duplicate markers

Grouping info
Room + session IDs

PDF Export (Phase 3 – optional, insurance-ready)
Room-by-room listing
Item photos
Condition notes
Replacement value estimate (if available)

4.6 Confidence Learning from User Feedback

Feedback signals

Confirmed
Dismissed
Renamed
Re-categorized

What learns

User preferences per home
Auto-selection thresholds
Duplicate suppression behavior

What does NOT happen
No hidden model retraining
No cross-user learning

Transparency is required.

5. Functional Requirements
5.1 Bounding Boxes & Image-Item Linking

Requirements

Each draft item MAY reference one or more bounding boxes
Bounding boxes are stored per image
Data captured
Image ID
Normalized coordinates (x, y, w, h)
Confidence per box
Detection source

5.2 Scan History & Delta Tracking

Requirements
Persist scan sessions per room
Support listing, reopening, exporting
Compute deltas vs last completed scan

Delta types

NEW
DUPLICATE
REMOVED
UNCHANGED

5.3 Export Drafts to CSV

Endpoint
GET /api/properties/:propertyId/inventory/drafts/export

Filters

roomId
scanSessionId
status
Guarantees
Always downloadable
Includes Phase 2 metadata

UTF-8 safe

5.4 Insurance-Ready PDF (Optional Phase 3b)

Output
Branded PDF
Room-grouped
Embedded images
Timestamp + session ID

6. Data Model Changes
New Tables
inventory_scan_images
Field	Notes
id	uuid
scan_session_id	FK
file_path	
width / height	
created_at	
inventory_draft_boxes
Field	Notes
id	uuid
draft_item_id	FK
image_id	FK
x / y / w / h	normalized
confidence	
created_at	
inventory_scan_deltas
Field	Notes
id	uuid
scan_session_id	
previous_session_id	
draft_item_id	
delta_type	ENUM
created_at	
Existing Tables (Extended)
inventory_draft_items

Add:

explanation_json
first_seen_session_id
last_seen_session_id

7. Backend Changes
Services

roomScan.service.ts
image processing
box association
inventoryDraft.service.ts
delta computation
export adapters
Controllers
Scan history listing

Draft export (CSV / PDF)

8. Frontend Changes
Components

RoomScanModal
Guided mode
Box overlays

RoomDetailClient
Scan history
Delta badges

RoomShowcaseClient
Read-only scan history (optional)
UX Enhancements
Heatmap toggle

Confdence explanations

Bulk actions

9. Error Handling & Trust

Guarantees
No silent AI failures
Explicit fallback messaging
User data never lost on failure

Error codes
ROOM_SCAN_PARTIAL_RESULT
ROOM_SCAN_BOX_MISSING
EXPORT_GENERATION_FAILED

10. Observability & Metrics

Track:

Time to finish scan
% drafts auto-selected
Edit rate post-scan
Duplicate suppression accuracy
Export usage

11. Definition of Done (Phase 3)

User can scan, understand, and trust results
Visual link exists between images and items
Scan history visible per room
Drafts export cleanly
No regression to Phase 1–2

12. Phase 3b / Phase 4 (Future)

Video-based room scans
Storage-aware inventory (bins, shelves)
Incident-driven auto-selection (fire/water)
Premium analytics (scan completeness trends)

Final Note

This Phase 3 positions ContractToCozy AI Room Scan as:
More trustworthy than generic AI tools
More useful than inventory apps
More homeowner-centric than claims software

