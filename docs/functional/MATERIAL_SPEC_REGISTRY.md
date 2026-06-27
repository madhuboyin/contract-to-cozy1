# Home Material Specification Registry

## Overview

Home Material Specification Registry is a per-room database of the surface materials and finishes that make up a home — paint colors, tile models, flooring species, grout colors, countertop materials, cabinet hardware, and trim profiles. It answers the questions that arise constantly during home ownership: "What paint did we use in the living room?", "My bathroom floor tile cracked — what is it and where do I buy a replacement?", "The contractor needs to match the existing baseboard — what profile is it?"

This feature is intentionally distinct from:
- **Inventory** — which tracks appliances, mechanical systems, and equipment (what does the home *run* with)
- **DIY Project Center** — which tracks projects in progress (what is the homeowner *doing*)
- **Home Timeline** — which records significant events (what *happened*)

The Material Spec Registry tracks what the home *is made of* — the surfaces and finishes that define every room's aesthetic and require exact-match replacements when damaged or extended.

---

## Feature Goals

- Give homeowners a permanent, searchable record of every surface material in their home
- Make the "what is this?" question answerable in under 10 seconds
- Enable exact-match sourcing: manufacturer, product line, SKU, color code, finish, supplier
- Generate a contractor-ready specs sheet for any room or the whole property
- Surface material records at the point of need — from DIY projects, incident reports, and room views

---

## Material Categories

| Category | Scope | Examples |
|---|---|---|
| `PAINT` | Room-level, per surface | "Benjamin Moore OC-17 White Dove, Eggshell, Ceiling" |
| `TILE` | Room-level, per location | "Daltile Restore 4×16 White, bathroom floor" |
| `FLOORING` | Room-level | "Red Oak hardwood, 3¼" strip, Natural finish" |
| `GROUT` | Room-level, per location | "Custom Building Products Polyblend #382 Bright White" |
| `COUNTERTOP` | Room-level | "Silestone Ethereal Noctis, polished, 3cm" |
| `CABINET` | Room-level | "IKEA Sektion frame, Axstad Matt White door" |
| `HARDWARE` | Room-level | "Amerock Blackrock 3¾" cup pull, Matte Black, BP55340FB" |
| `TRIM_MOLDING` | Room-level | "Colonial casing 3½", primed MDF" |
| `WALLPAPER` | Room-level | "Rifle Paper Co. Wildflower Field Blue, batch 2024-03" |
| `ROOFING` | Property-level | "CertainTeed Landmark TL, Moire Black" |
| `SIDING` | Property-level | "James Hardie HardiePlank, Arctic White, 5" exposure" |
| `WINDOW` | Room or property-level | "Andersen 400 Series, White interior, Low-E4 glass" |
| `DOOR` | Room or property-level | "Therma-Tru Fiber-Classic Mahogany, smooth, 36×80" |
| `INSULATION` | Property-level | "Owens Corning R-38, blown fiberglass, attic" |
| `OTHER` | Either | Custom |

---

## Database

### Enums

```prisma
enum MaterialCategory {
  PAINT
  TILE
  FLOORING
  GROUT
  COUNTERTOP
  CABINET
  HARDWARE
  TRIM_MOLDING
  WALLPAPER
  ROOFING
  SIDING
  WINDOW
  DOOR
  INSULATION
  OTHER
}

enum MaterialScopeLevel {
  ROOM      // Associated with a specific InventoryRoom
  PROPERTY  // Whole-property materials (roofing, siding, insulation)
}

enum MaterialSurface {
  WALLS
  CEILING
  FLOOR
  BACKSPLASH
  SHOWER_WALLS
  SHOWER_FLOOR
  TUB_SURROUND
  COUNTERTOP
  EXTERIOR_FACADE
  TRIM
  DOORS
  WINDOWS
  CABINETRY
  OTHER
}

enum MaterialSpecExportStatus {
  PENDING
  GENERATING
  COMPLETED
  FAILED
}
```

---

### Models

#### `MaterialSpec` — A Single Material Record

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `roomId` | String? | FK → InventoryRoom (null for property-level specs like roofing/siding) |
| `scopeLevel` | `MaterialScopeLevel` | ROOM or PROPERTY |
| `category` | `MaterialCategory` | Paint, Tile, Flooring, etc. |
| `surface` | `MaterialSurface`? | Where specifically this material is applied (WALLS, FLOOR, CEILING, etc.) |
| `label` | String | Homeowner-assigned label (e.g. "Living Room Walls", "Master Bath Floor Tile") |
| `manufacturer` | String? | Brand name (e.g. "Benjamin Moore", "Daltile", "Bruce") |
| `productLine` | String? | Product family (e.g. "Aura Interior", "Restore", "Hydropel") |
| `productName` | String? | Specific product name or color name (e.g. "White Dove", "Arctic White") |
| `sku` | String? | Manufacturer SKU or item number |
| `colorCode` | String? | Color code (e.g. "OC-17", "SW 7006", "2856-70") |
| `colorHex` | String? | Hex color for visual display (e.g. "#F4F0E8") — homeowner can enter or auto-matched from colorCode |
| `finish` | String? | Surface finish (e.g. "Eggshell", "Matte", "Satin", "Polished", "Hand-scraped") |
| `dimensions` | String? | Size spec (e.g. "4×16", "3¼\" strip", "5\" exposure") |
| `material` | String? | Base material where applicable (e.g. "Porcelain", "Red Oak", "Fiber Cement") |
| `supplier` | String? | Where it was purchased (e.g. "Home Depot", "Floor & Decor", "local tile shop name") |
| `supplierUrl` | String? | URL to the product page for easy re-ordering |
| `purchaseDate` | DateTime? | When it was purchased/installed |
| `quantityPurchased` | String? | How much was bought (e.g. "2 gallons", "150 sq ft + 15 sq ft extra", "3 boxes") |
| `lotBatch` | String? | Lot or batch number (critical for wallpaper and tile dye-lot matching) |
| `notes` | String? | Freeform notes (e.g. "1 unopened quart stored in garage shelf 3") |
| `isActive` | Boolean | False = soft-deleted |
| `linkedInventoryItemId` | String? | FK → InventoryItem (e.g. link a cabinet spec to the cabinet inventory item) |
| `linkedHomeAssetId` | String? | FK → HomeAsset (e.g. link roofing spec to the roof asset) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Indexes:** `propertyId`, `roomId`, `category`, `propertyId + category`, `isActive`

---

#### `MaterialSpecPhoto` — Reference Photos for a Spec

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `materialSpecId` | String | FK → MaterialSpec |
| `propertyId` | String | FK → Property (denormalised) |
| `photoUrl` | String | S3 URL |
| `fileKey` | String | S3 object key |
| `caption` | String? | e.g. "Paint chip sample", "Close-up of tile pattern", "Label on paint can" |
| `sortOrder` | Int | |
| `createdAt` | DateTime | |

**Index:** `materialSpecId`

---

#### `MaterialSpecExport` — Generated Specs Sheet

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `requestedByUserId` | String | FK → User |
| `status` | `MaterialSpecExportStatus` | |
| `scopeType` | String | `ROOM:{roomId}` or `PROPERTY` — what was included |
| `title` | String | e.g. "Master Bedroom — Material Specs" or "Full Property Material Specs" |
| `totalSpecs` | Int? | Number of specs included |
| `fileUrl` | String? | S3 pre-signed URL |
| `fileKey` | String? | S3 object key |
| `expiresAt` | DateTime? | Pre-signed URL expiry (72 hours) |
| `errorMessage` | String? | |
| `createdAt` | DateTime | |

**Index:** `propertyId + createdAt`

---

## Backend

### Files

| File | Purpose |
|---|---|
| `backend/src/routes/materialSpec.routes.ts` | Express route definitions |
| `backend/src/controllers/materialSpec.controller.ts` | Request/response handling |
| `backend/src/services/materialSpec.service.ts` | CRUD, search, export orchestration |
| `backend/src/services/materialSpecExport.service.ts` | PDF specs sheet generation |
| `backend/src/validators/materialSpec.validators.ts` | Zod v4 input validation schemas |
| `backend/src/index.ts` | Route mounting |

---

### API Endpoints

All endpoints require `Authorization: Bearer <token>` and `propertyAuth.middleware`.

#### Specs — Property-Scoped

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/materials` | List all material specs for the property (filterable) |
| `POST` | `/api/properties/:propertyId/materials` | Create a new material spec |
| `GET` | `/api/properties/:propertyId/materials/:specId` | Get spec detail with photos |
| `PATCH` | `/api/properties/:propertyId/materials/:specId` | Update a spec |
| `DELETE` | `/api/properties/:propertyId/materials/:specId` | Soft-delete (`isActive = false`) |
| `GET` | `/api/properties/:propertyId/materials/search` | Full-text search across label, manufacturer, productName, colorCode, sku |

#### Specs — Room-Scoped (convenience alias)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/rooms/:roomId/materials` | List material specs for a specific room |

#### Photos

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/materials/:specId/photos` | Upload a photo (multipart/form-data) |
| `DELETE` | `/api/properties/:propertyId/materials/:specId/photos/:photoId` | Remove a photo |
| `PATCH` | `/api/properties/:propertyId/materials/:specId/photos/:photoId` | Update caption or sort order |

#### Export

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/materials/export` | Request a specs sheet export (async) |
| `GET` | `/api/properties/:propertyId/materials/export/:exportId` | Get export status and download URL |
| `GET` | `/api/properties/:propertyId/materials/exports` | List past exports |

#### Admin (Template / Color Code Helpers — Phase 2 seed data)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/materials/manufacturers` | List known manufacturer names for autocomplete |
| `POST` | `/api/admin/materials/manufacturers` | Add a manufacturer to the autocomplete list |

#### Material List Query Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `category` | string[] | — | Filter by category |
| `roomId` | string | — | Filter to a specific room |
| `scopeLevel` | string | — | ROOM or PROPERTY |
| `search` | string | — | Full-text search |
| `limit` | number | 50 | |
| `cursor` | string | — | |

---

### Service Layer

#### `MaterialSpecService` (`materialSpec.service.ts`)

- **`listSpecs(propertyId, params)`** — Returns specs matching filters, ordered by `category` then `label`. Includes first photo URL per spec for card display.
- **`listRoomSpecs(propertyId, roomId)`** — Returns all active specs for a specific room, grouped by category.
- **`searchSpecs(propertyId, query)`** — Full-text search across `label`, `manufacturer`, `productName`, `colorCode`, `sku`, `notes`. Returns up to 20 results ordered by relevance.
- **`createSpec(propertyId, userId, payload)`** — Creates a `MaterialSpec`. If `colorCode` is provided and `colorHex` is not, attempts a lookup from the `ManufacturerColorCode` lookup table (seeded for major paint brands: Benjamin Moore, Sherwin-Williams, Behr, PPG). If no match, leaves `colorHex` null.
- **`getSpecDetail(specId, propertyId)`** — Returns spec with all photos ordered by `sortOrder`.
- **`updateSpec(specId, propertyId, patch)`** — Updates spec fields.
- **`softDeleteSpec(specId, propertyId)`** — Sets `isActive = false`.
- **`addPhoto(specId, propertyId, file)`** — Uploads to S3 under `material-specs/{propertyId}/{specId}/{uuid}.jpg`, creates `MaterialSpecPhoto` row.
- **`removePhoto(photoId, specId, propertyId)`** — Deletes from S3; deletes row.
- **`requestExport(propertyId, userId, scope)`** — Creates `MaterialSpecExport` and enqueues generation job.
- **`getExport(exportId, propertyId)`** — Returns export with a fresh pre-signed URL if completed and not expired.

#### `MaterialSpecExportService` (`materialSpecExport.service.ts`)

Generates a structured PDF using the existing `pdf-lib` library.

**PDF structure:**
1. Cover page: property address, export date, scope description
2. Per-room sections (ROOM scope) or category sections (PROPERTY scope):
   - Room name as section header
   - Per spec: label, category, manufacturer + product name, color code + hex swatch, SKU, finish, dimensions, supplier, purchase date, lot/batch, notes
   - Photo thumbnails (up to 2 per spec)
3. Property-level materials section (roofing, siding, insulation)
4. "How to use this document" footer note

Called by `generateMaterialSpecExport.job.ts` worker.

---

### Color Code Lookup

For major paint brands, a `ManufacturerColorCode` seed table maps brand+code to a hex value. This powers the automatic `colorHex` population when a homeowner enters a paint color code.

Seeded brands:
- **Benjamin Moore** — Full NCS-to-hex mapping for primary collection
- **Sherwin-Williams** — SW number to hex
- **Behr** — Behr code to hex
- **PPG** — PPG code to hex

These are static seed data rows, not a live API. Hex values are approximate (paint colors are physical; hex is a display approximation). A disclaimer note is shown next to any auto-populated hex value.

---

### Validators (`materialSpec.validators.ts`)

| Schema | Used By |
|---|---|
| `CreateMaterialSpecSchema` | `POST .../materials` |
| `UpdateMaterialSpecSchema` | `PATCH .../materials/:specId` |
| `UpdatePhotoSchema` | `PATCH .../photos/:photoId` |
| `RequestExportSchema` | `POST .../materials/export` |
| `ListSpecsSchema` | `GET .../materials` (query params) |
| `SearchSpecsSchema` | `GET .../materials/search` (query params) |

---

## Workers / Background Jobs

### Files

| File | Purpose |
|---|---|
| `workers/src/jobs/generateMaterialSpecExport.job.ts` | PDF specs sheet generation |
| `workers/src/worker.ts` | Queue registration |

### `generateMaterialSpecExport.job.ts`

User-triggered (no cron). BullMQ concurrency: 5.

Steps:
1. Load all active `MaterialSpec` rows for the requested scope (room or property)
2. Load all `MaterialSpecPhoto` rows for those specs
3. Generate PDF via `MaterialSpecExportService`
4. Upload PDF to S3 (`material-exports/{propertyId}/{exportId}.pdf`)
5. Store pre-signed URL (72-hour expiry)
6. Update `MaterialSpecExport` with `status = COMPLETED`

---

## Frontend

### Files

| File | Purpose |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/materials/page.tsx` | Property-level material registry hub |
| `frontend/src/app/(dashboard)/dashboard/materials/add/page.tsx` | Add material spec form |
| `frontend/src/app/(dashboard)/dashboard/materials/[id]/page.tsx` | Material spec detail + edit |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/materials/page.tsx` | Property-scoped tool entry |
| `frontend/src/components/features/materials/MaterialSpecCard.tsx` | Spec summary card with color swatch |
| `frontend/src/components/features/materials/MaterialSpecForm.tsx` | Create/edit form with category-aware dynamic fields |
| `frontend/src/components/features/materials/RoomMaterialsList.tsx` | Compact material list embedded in the Rooms Experience page |
| `frontend/src/components/features/materials/ColorSwatch.tsx` | Hex color swatch with optional color code label |
| `frontend/src/components/features/materials/PhotoGallery.tsx` | Scrollable photo grid with upload action |
| `frontend/src/components/features/materials/MaterialSearchSheet.tsx` | Full-text search bottom sheet (triggered from quick-lookup CTA) |
| `frontend/src/components/features/materials/ExportButton.tsx` | Request and download specs sheet |
| `frontend/src/components/features/materials/MaterialUtils.ts` | Category icons, label maps, surface labels |
| `frontend/src/lib/api/client.ts` | API client method additions |
| `frontend/src/types/index.ts` | TypeScript interface additions |

---

### Main Hub Page (`materials/page.tsx`)

**Route:** `/dashboard/materials?propertyId=<id>`

**Layout:**
1. **Search bar** — "Find a material" → opens `MaterialSearchSheet`. Most common entry point after initial setup.
2. **Property-level materials strip** — Horizontal cards for ROOFING, SIDING, INSULATION specs (if any). "Add" chip for each.
3. **By Room** — Accordion list. Each room expands to show its material specs grouped by category. "Add material" chip per room.
4. **"Add Material" FAB** at bottom.
5. **"Generate Specs Sheet"** button → opens scope picker (which rooms to include) → calls export endpoint.

---

### Add Material Form (`materials/add/page.tsx`)

**Route:** `/dashboard/materials/add?propertyId=<id>&roomId=<id>&category=<category>`

Pre-fills `roomId` and `category` if passed in query params (supports launching from room page or DIY project).

**Dynamic fields by category:**

| Category | Fields shown |
|---|---|
| PAINT | manufacturer, productName, colorCode, colorHex (auto-populated), finish, surface, supplier, quantityPurchased, purchaseDate, lotBatch |
| TILE | manufacturer, productLine, productName, sku, dimensions, material, finish, surface, supplier, quantityPurchased, purchaseDate, lotBatch |
| FLOORING | manufacturer, productLine, productName, sku, dimensions, material, finish, supplier, quantityPurchased, purchaseDate |
| GROUT | manufacturer, productName, colorCode, surface, supplier, purchaseDate, lotBatch |
| COUNTERTOP | manufacturer, productLine, productName, material, finish, dimensions, supplier, purchaseDate |
| CABINET | manufacturer, productLine, productName, finish, supplier, purchaseDate |
| HARDWARE | manufacturer, productName, sku, finish, dimensions, supplier, purchaseDate |
| TRIM_MOLDING | manufacturer, productName, dimensions, material, finish, supplier, quantityPurchased |
| WALLPAPER | manufacturer, productName, sku, dimensions, supplier, quantityPurchased, lotBatch |
| ROOFING / SIDING | manufacturer, productLine, productName, colorCode, material, finish, supplier, purchaseDate |
| All | notes, photos (upload) |

**Color code auto-populate:** When the user enters a color code for PAINT and the manufacturer is a known brand, a hex color chip previews next to the field automatically.

---

### Spec Detail Page (`materials/[id]/page.tsx`)

**Route:** `/dashboard/materials/:id?propertyId=<id>`

Sections:
1. Category icon + label, room name (or "Property-level"), surface label
2. Color swatch (`ColorSwatch`) if `colorHex` is set — large square with hex code below
3. Spec fields in a structured grid (manufacturer, SKU, finish, dimensions, supplier, purchase date, lot/batch)
4. Notes (editable inline)
5. Photo gallery (`PhotoGallery`) with upload CTA
6. Linked inventory item / home asset (if set) — tappable link
7. "Edit" and "Delete" actions
8. "Generate room specs sheet" quick link

---

### Room Integration (`RoomMaterialsList.tsx`)

Embedded in the existing Rooms Experience page (`/dashboard/rooms/:roomId`). Shows a compact horizontal scroll of material spec cards for that room. "Add" chip at the end. Tapping a spec opens the spec detail page. This is the primary discovery surface for material specs within the existing room workflow.

---

### `MaterialSearchSheet.tsx`

Triggered from the search bar on the hub page and as a quick-lookup from anywhere in the app ("What was that paint?"). Shows a search input with real-time results. Each result card shows: label, manufacturer + product name, room name, color swatch if applicable, and a "Copy color code" action for paint specs.

---

### `ColorSwatch.tsx`

Displays a rounded rectangle filled with `colorHex`. If no hex value, shows a grey hatched placeholder. Tapping shows the full color details: code, name, manufacturer. A "Copy code" button copies the color code to clipboard.

---

### API Client Methods

```typescript
// Specs
listMaterialSpecs(propertyId: string, params?: MaterialSpecListParams): Promise<{ items: MaterialSpecSummary[]; nextCursor?: string }>
listRoomMaterialSpecs(propertyId: string, roomId: string): Promise<MaterialSpecSummary[]>
searchMaterialSpecs(propertyId: string, query: string): Promise<MaterialSpecSummary[]>
createMaterialSpec(propertyId: string, payload: CreateMaterialSpecPayload): Promise<MaterialSpecDetail>
getMaterialSpecDetail(propertyId: string, specId: string): Promise<MaterialSpecDetail>
updateMaterialSpec(propertyId: string, specId: string, patch: UpdateMaterialSpecPayload): Promise<MaterialSpecDetail>
deleteMaterialSpec(propertyId: string, specId: string): Promise<void>

// Photos
uploadMaterialSpecPhoto(propertyId: string, specId: string, file: File, caption?: string): Promise<MaterialSpecPhoto>
deleteMaterialSpecPhoto(propertyId: string, specId: string, photoId: string): Promise<void>
updateMaterialSpecPhoto(propertyId: string, specId: string, photoId: string, patch: { caption?: string; sortOrder?: number }): Promise<MaterialSpecPhoto>

// Export
requestMaterialSpecExport(propertyId: string, payload: { scope: 'ROOM' | 'PROPERTY'; roomId?: string }): Promise<{ exportId: string }>
getMaterialSpecExport(propertyId: string, exportId: string): Promise<MaterialSpecExportStatus>
listMaterialSpecExports(propertyId: string): Promise<MaterialSpecExportSummary[]>
```

---

### TypeScript Interfaces

```typescript
type MaterialCategory = 'PAINT' | 'TILE' | 'FLOORING' | 'GROUT' | 'COUNTERTOP' | 'CABINET' | 'HARDWARE' | 'TRIM_MOLDING' | 'WALLPAPER' | 'ROOFING' | 'SIDING' | 'WINDOW' | 'DOOR' | 'INSULATION' | 'OTHER'
type MaterialScopeLevel = 'ROOM' | 'PROPERTY'
type MaterialSurface = 'WALLS' | 'CEILING' | 'FLOOR' | 'BACKSPLASH' | 'SHOWER_WALLS' | 'SHOWER_FLOOR' | 'TUB_SURROUND' | 'COUNTERTOP' | 'EXTERIOR_FACADE' | 'TRIM' | 'DOORS' | 'WINDOWS' | 'CABINETRY' | 'OTHER'
type MaterialSpecExportStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED'

interface MaterialSpecSummary {
  id: string
  propertyId: string
  roomId?: string
  roomName?: string
  scopeLevel: MaterialScopeLevel
  category: MaterialCategory
  surface?: MaterialSurface
  label: string
  manufacturer?: string
  productName?: string
  colorCode?: string
  colorHex?: string
  finish?: string
  sku?: string
  primaryPhotoUrl?: string
  createdAt: string
}

interface MaterialSpecPhoto {
  id: string
  photoUrl: string
  caption?: string
  sortOrder: number
  createdAt: string
}

interface MaterialSpecDetail extends MaterialSpecSummary {
  productLine?: string
  dimensions?: string
  material?: string
  supplier?: string
  supplierUrl?: string
  purchaseDate?: string
  quantityPurchased?: string
  lotBatch?: string
  notes?: string
  linkedInventoryItemId?: string
  linkedHomeAssetId?: string
  photos: MaterialSpecPhoto[]
}

interface CreateMaterialSpecPayload {
  roomId?: string
  scopeLevel: MaterialScopeLevel
  category: MaterialCategory
  surface?: MaterialSurface
  label: string
  manufacturer?: string
  productLine?: string
  productName?: string
  sku?: string
  colorCode?: string
  colorHex?: string
  finish?: string
  dimensions?: string
  material?: string
  supplier?: string
  supplierUrl?: string
  purchaseDate?: string
  quantityPurchased?: string
  lotBatch?: string
  notes?: string
  linkedInventoryItemId?: string
  linkedHomeAssetId?: string
}

type UpdateMaterialSpecPayload = Partial<CreateMaterialSpecPayload>

interface MaterialSpecListParams {
  category?: MaterialCategory[]
  roomId?: string
  scopeLevel?: MaterialScopeLevel
  search?: string
  limit?: number
  cursor?: string
}

interface MaterialSpecExportSummary {
  id: string
  title: string
  status: MaterialSpecExportStatus
  totalSpecs?: number
  fileUrl?: string
  expiresAt?: string
  createdAt: string
}
```

---

## Integration Points with Existing Features

### Rooms Experience

The existing room page (`/dashboard/rooms/:roomId`) embeds `RoomMaterialsList` as a new section below the appliance grid. Material specs are co-located with the room they belong to, making the Rooms page the primary management surface for most homeowners.

### DIY Project Center

On project completion for PAINTING, TILE, or FLOORING project types, the completion sheet includes a "Save your material specs" step: a pre-filled `MaterialSpecForm` for the relevant category. Skippable but surfaced at the moment when the homeowner has all the information at hand (paint can is still open).

### Inventory

`MaterialSpec.linkedInventoryItemId` allows linking a material spec to an inventory item. For example, a cabinet material spec links to the "Kitchen Cabinets" inventory item. This creates a bidirectional lookup: from the inventory item detail you can reach the material spec for cabinet finish matching.

### Home Events / Incidents

When an incident involves surface damage (burst pipe → flooring/drywall damage, hail → roofing), the incident detail page shows a "View material specs" link to the affected room's or property's material registry. This gives the homeowner instant access to the specs they need for repair quotes.

### Home Timeline

Material spec creation events can be optionally logged as `HomeEvent` rows (type `IMPROVEMENT`, visibility `PRIVATE`) — "Kitchen backsplash spec added" appears in the property timeline as a lightweight record of when finishes were documented.

### Property Export / Home Report

The existing Home Report Export feature is extended to optionally include a material spec summary page, so the comprehensive property PDF includes both system inventory and surface finish documentation.

---

## Mobile Navigation

The Material Spec Registry is registered in the mobile tool catalog under **Home Tools**:

```typescript
{
  key: 'materials',
  name: 'Material Specs',
  description: 'Paint colors, tile SKUs, and finish specs for every room',
  hrefSuffix: 'tools/materials',
  navTarget: 'tool:materials',
  icon: resolveToolIcon('home', 'materials'),
  isActive: (pathname) =>
    /^\/dashboard\/(properties\/[^/]+\/tools\/materials|materials)(\/|$)/.test(pathname),
}
```

**Source file:** `frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`

The feature also appears contextually:
- Inside each room page as the `RoomMaterialsList` embedded component
- As a quick-access search chip on the dashboard for properties with > 5 spec entries

---

## Data Flow

```
User opens a room → sees "Material Specs" section (RoomMaterialsList)
        │
        ▼
Taps "Add material" → /materials/add?roomId=<id>&category=PAINT
  └─ Dynamic form shows paint-specific fields
  └─ User enters: Benjamin Moore, White Dove, OC-17, Eggshell, Walls
  └─ colorHex auto-populated from BM color code lookup → "#F4F0E8"
  └─ User adds photo of paint can label
  └─ POST /materials → MaterialSpec created
        │
        ▼
6 months later: wall scuff needs touch-up
  └─ User opens search: "What paint is in my living room?"
  └─ GET /materials/search?q=living room paint
  └─ MaterialSearchSheet shows: "Living Room Walls — White Dove OC-17"
  └─ User taps "Copy color code" → "OC-17" in clipboard
  └─ Takes to paint store
        │
        ▼
Homeowner hires a painter for another room
  └─ Opens /materials?propertyId=<id>
  └─ Taps "Generate Specs Sheet" → picks "All Rooms"
  └─ POST /materials/export → generateMaterialSpecExport.job.ts runs
  └─ PDF generated → S3 → pre-signed URL returned
  └─ Homeowner downloads and emails to painter
        │
        ▼
Bathroom tile cracks → opens incident
  └─ Incident detail shows "View material specs for Master Bathroom"
  └─ Opens room material list → "Master Bath Floor — Daltile Restore 4×16 White, #RC44"
  └─ Homeowner has exact SKU for replacement tile order
```

---

## Current Limitations

- Color hex auto-population is static seed data (4 brands, no live API). Hex values are visual approximations and carry a disclaimer.
- No barcode or QR code scanning for product identification. Homeowners must enter specs manually. Phase 2 can add a camera-based barcode lookup against product databases.
- Supplier URLs are homeowner-entered strings, not verified links. No price-checking or availability checking against supplier inventories.
- Photo storage uses the same S3 bucket as other documents. There is no deduplication or compression step beyond what Sharp already provides for inventory scans — this feature should hook into the same pipeline.
- No Gemini integration in Phase 1. Phase 2 can add: "Take a photo of your tile and we'll try to identify the manufacturer and model" using the existing visual inspection Gemini capability.
- Lot/batch matching between a stored spec and a new purchase is informational only. The platform cannot verify that a new box of tile from the same batch is actually a dye-lot match — this requires physical inspection.

---

## Phase 2 Roadmap

| Item | Description |
|---|---|
| Barcode / QR scan | Camera-based UPC scan → product database lookup for tile and flooring |
| Gemini visual identification | "Take a photo of this material and we'll try to identify it" using existing Gemini vision capability |
| Supplier re-order links | Smart-link from a spec directly to the product on Home Depot, Floor & Decor, Benjamin Moore online |
| Dye-lot alert | Prompt when a homeowner is about to order more of the same tile: "Save your new lot number — it may differ from your stored lot" |
| Contractor share link | Time-limited share link for the specs sheet that doesn't require the contractor to have an account |
| Expanded paint brand coverage | Add Farrow & Ball, Dunn-Edwards, Valspar to the color code → hex seed table |

---

## File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/materialSpec.routes.ts` | Route definitions |
| `apps/backend/src/controllers/materialSpec.controller.ts` | Request handlers |
| `apps/backend/src/services/materialSpec.service.ts` | Core business logic |
| `apps/backend/src/services/materialSpecExport.service.ts` | PDF generation |
| `apps/backend/src/validators/materialSpec.validators.ts` | Zod v4 schemas |
| `apps/backend/prisma/schema.prisma` | New models and enums |

### Frontend

| Path | Role |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/materials/page.tsx` | Material registry hub |
| `apps/frontend/src/app/(dashboard)/dashboard/materials/add/page.tsx` | Add spec form |
| `apps/frontend/src/app/(dashboard)/dashboard/materials/[id]/page.tsx` | Spec detail + edit |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/materials/page.tsx` | Property-scoped entry |
| `apps/frontend/src/components/features/materials/MaterialSpecCard.tsx` | Spec summary card |
| `apps/frontend/src/components/features/materials/MaterialSpecForm.tsx` | Create/edit form |
| `apps/frontend/src/components/features/materials/RoomMaterialsList.tsx` | Embedded room section |
| `apps/frontend/src/components/features/materials/ColorSwatch.tsx` | Hex color display |
| `apps/frontend/src/components/features/materials/PhotoGallery.tsx` | Photo grid |
| `apps/frontend/src/components/features/materials/MaterialSearchSheet.tsx` | Quick-lookup search sheet |
| `apps/frontend/src/components/features/materials/ExportButton.tsx` | Specs sheet export |
| `apps/frontend/src/components/features/materials/MaterialUtils.ts` | UI helpers, icons |
| `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts` | Mobile nav registration |
| `apps/frontend/src/lib/api/client.ts` | API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |

### Workers

| Path | Role |
|---|---|
| `apps/workers/src/jobs/generateMaterialSpecExport.job.ts` | PDF specs sheet generation |
| `apps/workers/src/worker.ts` | Queue registration |
| `apps/workers/prisma/schema.prisma` | Synced mirror of backend schema |
