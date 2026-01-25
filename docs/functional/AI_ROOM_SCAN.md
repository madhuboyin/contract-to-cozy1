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






