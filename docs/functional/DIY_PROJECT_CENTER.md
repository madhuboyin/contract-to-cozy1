# DIY Project Center

## Overview

DIY Project Center gives homeowners execution support for routine repairs and maintenance they can reasonably do themselves — things like replacing a toilet flapper, changing an HVAC filter, patching drywall, caulking a tub, or painting a room. It is intentionally distinct from the existing Home Renovation Advisor (which handles major structural work — additions, ADU construction, roof replacement — requiring permits and licensed contractors).

The feature answers three core homeowner questions:

1. **Can I do this myself?** — A skill-based decision engine that scores project difficulty against the homeowner's self-assessed capability and returns a clear verdict with reasoning.
2. **How do I do it?** — Admin-curated step-by-step project guides with materials lists, tool lists, safety notes, and time estimates. A Gemini-backed custom guide path handles tasks that fall outside the curated template library.
3. **Did I finish it?** — A project tracker that walks the homeowner through steps, accepts notes and photos, and on completion writes a `HomeEvent` and updates any linked maintenance task or incident.

The platform currently assumes all work is done by hired professionals. DIY Project Center is the first first-class workflow for owner-executed work, and it closes the loop from completion back into the property record.

---

## Feature Goals

- Give homeowners a clear DIY vs. hire verdict before they commit to a project
- Surface curated, property-aware project guides for the most common routine repairs
- Track step-level progress so a multi-day project survives app restarts
- Log completed projects as maintenance history in the property record
- Route "hire out" decisions directly to the provider booking flow
- Keep the Renovation Advisor scope intact — DIY Center does not handle permitted structural work

---

## Scope Boundary vs Home Renovation Advisor

| Dimension | DIY Project Center | Home Renovation Advisor |
|---|---|---|
| Project scale | Routine maintenance and minor repairs | Major renovations (structural, additions, ADU) |
| Typical cost | $5 – $500 | $5,000 – $200,000+ |
| Permit scope | Rarely required | Core output of the advisor |
| Who executes | Homeowner or hired trades | Licensed contractor (advisor outcome) |
| Existing models | None (new) | `HomeRenovationAdvisorSession`, `HomeRenovationPermitOutput`, etc. |

---

## Supported Project Categories

| Category | Example Tasks |
|---|---|
| **HVAC** | Filter replacement, thermostat swap, vent cleaning, dryer vent cleaning |
| **PLUMBING** | Toilet flapper, showerhead, faucet aerator, garbage disposal reset, P-trap cleaning |
| **ELECTRICAL** | GFCI outlet replacement, light switch swap, light fixture replacement (no panel work) |
| **PAINTING** | Interior room, trim and baseboards, touch-up patching |
| **GENERAL** | Caulking (bath, kitchen, exterior), door hinge tightening, squeaky floor fix, weather stripping |
| **EXTERIOR** | Gutter cleaning, deck cleaning and staining, power washing, window caulking |
| **FLOORING** | Grout repair, vinyl plank section replacement, threshold installation |
| **APPLIANCE** | Refrigerator coil cleaning, dishwasher filter cleaning, dryer drum belt |
| **LANDSCAPING** | Sprinkler head replacement, mulch installation, basic drainage channel |

---

## Database

### Enums

```prisma
enum DiyProjectCategory {
  HVAC
  PLUMBING
  ELECTRICAL
  PAINTING
  GENERAL
  EXTERIOR
  FLOORING
  APPLIANCE
  LANDSCAPING
  OTHER
}

enum DiySkillLevel {
  BEGINNER     // Little to no prior DIY experience
  INTERMEDIATE // Has completed several home projects independently
  ADVANCED     // Comfortable with most trade-adjacent tasks
}

enum DiyDifficultyLevel {
  EASY         // Under 1 hour, no special tools, minimal risk
  MODERATE     // 1–4 hours, basic tools, some precision required
  HARD         // 4–8 hours, specialty tools, multiple steps to coordinate
  EXPERT_ONLY  // Risk of injury or property damage without trade experience
}

enum DiyProjectStatus {
  PLANNING      // Created but not started
  IN_PROGRESS   // At least one step marked complete
  COMPLETED     // All steps done; completion flow submitted
  ABANDONED     // User stopped and optionally hired out
  HIRED_OUT     // Abandoned specifically to book a provider
}

enum DiyDecisionVerdict {
  DIY_RECOMMENDED   // Score ≥ 70; proceed with confidence
  BORDERLINE        // Score 40–69; doable with care or guidance
  HIRE_RECOMMENDED  // Score 20–39; risk of mistakes outweighs savings
  HIRE_REQUIRED     // Hard safety or permit blocker; do not DIY
}

enum DiyStepStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  SKIPPED
}

enum DiyToolAction {
  ALREADY_OWNED  // Default assumption for common tools
  RENT           // Cost-effective for one-time use
  BUY            // Worth purchasing; reusable
}

enum DiyTemplateStatus {
  DRAFT   // Admin work-in-progress, not visible to users
  ACTIVE  // Published and available in the template library
  ARCHIVED // Retired; existing projects retain their step copy
}

enum DiySafetyLevel {
  LOW      // No significant injury risk
  MODERATE // Risk of minor cuts, burns, strains
  HIGH     // Risk of serious injury without proper precautions (electrical live circuits, working at height)
}

enum DiyAiGuideStatus {
  PENDING
  GENERATING
  COMPLETED
  FAILED
}
```

---

### Models

#### `DiySkillProfile` — Per-User Skill Self-Assessment

One row per user. Created the first time a user completes the skill assessment quiz. Updated in place on re-assessment.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `userId` | String (unique) | FK → User |
| `hvac` | `DiySkillLevel` | Skill level for HVAC tasks |
| `plumbing` | `DiySkillLevel` | |
| `electrical` | `DiySkillLevel` | |
| `painting` | `DiySkillLevel` | |
| `general` | `DiySkillLevel` | |
| `exterior` | `DiySkillLevel` | |
| `flooring` | `DiySkillLevel` | |
| `appliance` | `DiySkillLevel` | |
| `landscaping` | `DiySkillLevel` | |
| `toolsOwnedJson` | Json? | Array of tool canonical IDs the user has flagged as owned (e.g. `"drill"`, `"stud_finder"`, `"wet_dry_vac"`) |
| `quizAnswersJson` | Json? | Raw quiz answer payload, retained for future re-scoring |
| `assessedAt` | DateTime | When the last quiz was submitted |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

---

#### `DiyProjectTemplate` — Admin-Curated Project Guide

One row per project type. Templates are the source of steps, materials, and tools that get copied into user projects.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `slug` | String (unique) | URL-safe identifier (e.g. `hvac-filter-replacement`) |
| `title` | String | Display title (e.g. "Replace HVAC Air Filter") |
| `shortDescription` | String | One-line summary for template cards |
| `longDescription` | String? | Full description shown on template detail page |
| `category` | `DiyProjectCategory` | |
| `difficultyLevel` | `DiyDifficultyLevel` | |
| `requiredSkillLevel` | `DiySkillLevel` | Minimum skill level for a DIY_RECOMMENDED verdict |
| `safetyLevel` | `DiySafetyLevel` | |
| `permitRequirement` | `PermitRequirementStatus` | Reuses existing enum from Renovation Advisor |
| `estimatedMinutes` | Int | Total estimated time to complete |
| `estimatedMaterialCostMinCents` | Int? | Lower bound material cost |
| `estimatedMaterialCostMaxCents` | Int? | Upper bound material cost |
| `professionalCostMinCents` | Int? | Typical pro cost (used in savings display) |
| `professionalCostMaxCents` | Int? | |
| `tags` | String[] | Searchable tags |
| `status` | `DiyTemplateStatus` | |
| `featuredOrder` | Int? | Non-null = appears in featured templates strip, sorted ascending |
| `geminiPromptHint` | String? | Optional hint appended to the Gemini prompt when generating a custom guide based on this template |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Relations:** `DiyTemplateStep[]`, `DiyTemplateMaterial[]`, `DiyTemplateTool[]`, `DiyProject[]`

---

#### `DiyTemplateStep` — Ordered Steps for a Template

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `templateId` | String | FK → DiyProjectTemplate |
| `stepNumber` | Int | 1-indexed sort order |
| `title` | String | Short step label |
| `description` | String | Full instruction text (supports markdown) |
| `estimatedMinutes` | Int? | Time estimate for this step |
| `safetyNote` | String? | Rendered as a warning callout if present |
| `tipNote` | String? | Rendered as a green tip callout if present |
| `imageUrl` | String? | S3 URL for step illustration |
| `isOptional` | Boolean | Optional steps shown but not required for completion |

**Unique constraint:** `templateId + stepNumber`

---

#### `DiyTemplateMaterial` — Materials List for a Template

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `templateId` | String | FK → DiyProjectTemplate |
| `name` | String | Material name (e.g. "HVAC Filter 16x25x1") |
| `description` | String? | Brand notes or spec clarification |
| `unit` | String | Display unit: `each`, `sq ft`, `linear ft`, `oz`, `gal`, `pack` |
| `quantityFormula` | String | Fixed number or a formula referencing property data: `"1"`, `"ceiling_sqft * 0.35"`, `"perimeter_ft / 12"` |
| `unitPriceCents` | Int | Estimated retail price per unit in cents |
| `isOptional` | Boolean | |
| `purchaseNote` | String? | Where to buy or brand recommendations |
| `sortOrder` | Int | Display order |

---

#### `DiyTemplateTool` — Tools Required for a Template

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `templateId` | String | FK → DiyProjectTemplate |
| `name` | String | Tool name (e.g. "Cordless Drill") |
| `canonicalId` | String? | Stable key matching `toolsOwnedJson` entries in `DiySkillProfile` (e.g. `"cordless_drill"`) |
| `description` | String? | |
| `isRequired` | Boolean | False = "nice to have" |
| `defaultToolAction` | `DiyToolAction` | Admin-set default recommendation |
| `rentDailyPriceCents` | Int? | |
| `buyEstimatePriceCents` | Int? | |
| `sortOrder` | Int | |

---

#### `DiyProject` — Homeowner's Project Instance

Created when a user starts a project from a template or from a Gemini-generated custom guide.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `userId` | String | FK → User |
| `templateId` | String? | FK → DiyProjectTemplate (null for AI-generated custom projects) |
| `aiGuideId` | String? | FK → DiyAiGuide (null for template-based projects) |
| `title` | String | Copied from template or Gemini-generated |
| `description` | String? | |
| `category` | `DiyProjectCategory` | |
| `status` | `DiyProjectStatus` | |
| `decisionVerdict` | `DiyDecisionVerdict`? | Verdict at time of project creation |
| `decisionScoreJson` | Json? | Full factor breakdown from the decision engine |
| `maintenanceTaskId` | String? | FK → PropertyMaintenanceTask (if launched from a task) |
| `incidentId` | String? | FK → Incident (if launched as an incident resolution) |
| `inventoryItemId` | String? | FK → InventoryItem (if scoped to an appliance/system) |
| `homeEventId` | String? | FK → HomeEvent (set on completion) |
| `notesJson` | Json? | Array of `{ text: string; createdAt: string }` |
| `photoUrls` | String[] | S3 URLs for project progress photos |
| `actualMinutes` | Int? | Homeowner-reported actual time (set on completion) |
| `actualMaterialCostCents` | Int? | Homeowner-reported actual cost (set on completion) |
| `startedAt` | DateTime? | Set when first step is marked in-progress |
| `completedAt` | DateTime? | Set on completion flow submission |
| `abandonedAt` | DateTime? | Set on abandon |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Indexes:** `propertyId`, `userId`, `status`, `templateId`, `category`

---

#### `DiyProjectStep` — User's Copy of Template Steps

Steps are copied from the template at project creation time so future template edits do not affect in-progress projects.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `projectId` | String | FK → DiyProject |
| `templateStepId` | String? | Reference to source step (null for AI-generated steps) |
| `stepNumber` | Int | |
| `title` | String | |
| `description` | String | |
| `estimatedMinutes` | Int? | |
| `safetyNote` | String? | |
| `tipNote` | String? | |
| `isOptional` | Boolean | |
| `status` | `DiyStepStatus` | |
| `notes` | String? | Homeowner note on this step |
| `completedAt` | DateTime? | |

**Unique constraint:** `projectId + stepNumber`

---

#### `DiyProjectMaterial` — User's Material List (Copied from Template)

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `projectId` | String | FK → DiyProject |
| `name` | String | |
| `unit` | String | |
| `quantity` | Decimal(10,2) | Resolved quantity (formula evaluated against property data at project creation) |
| `unitPriceCents` | Int | |
| `totalEstimateCents` | Int | `quantity * unitPriceCents`, computed at project creation |
| `isOptional` | Boolean | |
| `purchaseNote` | String? | |
| `isPurchased` | Boolean | Homeowner can tick off as purchased |

**Index:** `projectId`

---

#### `DiyProjectTool` — User's Tool List (Copied from Template)

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `projectId` | String | FK → DiyProject |
| `name` | String | |
| `canonicalId` | String? | |
| `isRequired` | Boolean | |
| `defaultToolAction` | `DiyToolAction` | From template |
| `userToolAction` | `DiyToolAction`? | User's choice (may differ from default) |
| `rentDailyPriceCents` | Int? | |
| `buyEstimatePriceCents` | Int? | |

**Index:** `projectId`

---

#### `DiyAiGuide` — Gemini-Generated Custom Project Guide

Created when a user describes a project that has no matching template. The Gemini response is structured and persisted so the guide is available offline and does not require a re-generation.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `userId` | String | FK → User |
| `propertyId` | String | FK → Property |
| `userPrompt` | String | The homeowner's description of the project |
| `category` | `DiyProjectCategory`? | Inferred from Gemini response |
| `status` | `DiyAiGuideStatus` | |
| `generatedTitle` | String? | Gemini-returned title |
| `generatedSummary` | String? | Gemini-returned summary |
| `stepsJson` | Json? | Array of `{ stepNumber, title, description, estimatedMinutes?, safetyNote?, tipNote? }` |
| `materialsJson` | Json? | Array of `{ name, unit, quantity, unitPriceCents?, purchaseNote? }` |
| `toolsJson` | Json? | Array of `{ name, isRequired, defaultToolAction? }` |
| `decisionVerdict` | `DiyDecisionVerdict`? | Gemini-assessed DIY suitability included in the response |
| `safetyWarningsJson` | Json? | Array of safety warnings Gemini flagged |
| `errorMessage` | String? | Set if generation failed |
| `promptTokens` | Int? | Gemini token accounting |
| `completionTokens` | Int? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Index:** `userId`, `propertyId`, `status`

---

## Backend

### Files

| File | Purpose |
|---|---|
| `backend/src/routes/diy.routes.ts` | Express route definitions and middleware chains |
| `backend/src/controllers/diy.controller.ts` | Request/response handling |
| `backend/src/services/diy.service.ts` | Template queries, project CRUD, skill profile management |
| `backend/src/services/diyDecision.service.ts` | DIY vs hire scoring engine |
| `backend/src/services/diyCompletion.service.ts` | Post-completion hooks: HomeEvent creation, maintenance task update |
| `backend/src/services/diyAiGuide.service.ts` | Gemini prompt construction, response parsing, guide persistence |
| `backend/src/validators/diy.validators.ts` | Zod v4 input validation schemas |
| `backend/src/index.ts` | Route mounting |

---

### API Endpoints

All endpoints require `Authorization: Bearer <token>`. Property-scoped endpoints additionally apply `propertyAuth.middleware`.

#### Skill Profile

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/users/me/diy/skill-profile` | Get the authenticated user's skill profile |
| `PUT` | `/api/users/me/diy/skill-profile` | Create or replace skill profile from quiz submission |

#### Template Library

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/diy/templates` | Paginated template list (filterable by category, difficulty, skill level) |
| `GET` | `/api/diy/templates/featured` | Featured templates strip (ordered by `featuredOrder`) |
| `GET` | `/api/diy/templates/:templateId` | Full template detail with steps, materials, tools |

#### Decision Engine

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/diy/decision` | Score a project and return a DIY vs hire verdict |

#### Projects

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/diy/projects` | Create a project from a template ID or an AI guide ID |
| `GET` | `/api/properties/:propertyId/diy/projects` | List projects for a property (filterable by status, category) |
| `GET` | `/api/properties/:propertyId/diy/projects/:projectId` | Full project detail (steps, materials, tools, notes) |
| `PATCH` | `/api/properties/:propertyId/diy/projects/:projectId` | Update project notes or photo URLs |
| `PATCH` | `/api/properties/:propertyId/diy/projects/:projectId/steps/:stepId` | Update step status and notes |
| `POST` | `/api/properties/:propertyId/diy/projects/:projectId/complete` | Submit completion (actual cost + time; creates HomeEvent) |
| `POST` | `/api/properties/:propertyId/diy/projects/:projectId/abandon` | Abandon project; optional `{ hireOut: true }` body routes to booking |

#### AI Guide (Gemini)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/diy/ai-guide` | Submit a free-text project description; returns guide ID immediately, polls for status |
| `GET` | `/api/properties/:propertyId/diy/ai-guide/:guideId` | Get AI guide status and content |

#### Admin

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/diy/templates` | List all templates including DRAFT and ARCHIVED |
| `POST` | `/api/admin/diy/templates` | Create a template |
| `PUT` | `/api/admin/diy/templates/:templateId` | Update a template (steps/materials/tools replaced atomically) |
| `PATCH` | `/api/admin/diy/templates/:templateId/status` | Publish, archive, or restore a template |

#### Template List Query Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `category` | string[] | — | Filter by one or more categories |
| `difficulty` | string[] | — | Filter by difficulty |
| `maxSkillLevel` | string | — | Return templates whose `requiredSkillLevel` ≤ this value |
| `search` | string | — | Full-text search on title and tags |
| `limit` | number | 20 | |
| `cursor` | string | — | Pagination cursor |

#### Project List Query Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `status` | string[] | — | Filter by status |
| `category` | string[] | — | |
| `limit` | number | 20 | |
| `cursor` | string | — | |

---

### Service Layer

#### `DiyService` (`diy.service.ts`)

- **`getSkillProfile(userId)`** — Returns the user's `DiySkillProfile` or null if not assessed.
- **`upsertSkillProfile(userId, payload)`** — Creates or replaces the skill profile from a quiz submission. Computes per-category `DiySkillLevel` from quiz answers.
- **`listTemplates(params)`** — Cursor-paginated template list with filters. Returns ACTIVE templates only.
- **`getFeaturedTemplates()`** — Returns templates with non-null `featuredOrder`, sorted ascending.
- **`getTemplateDetail(templateId)`** — Returns template with all steps, materials, and tools.
- **`createProject(propertyId, userId, payload)`** — Creates a `DiyProject` from a template or AI guide:
  1. Copies all `DiyTemplateStep` rows into `DiyProjectStep`
  2. Evaluates material quantity formulas against property data (room dimensions from `InventoryRoom` if available, else default quantities)
  3. Copies material and tool rows into `DiyProjectMaterial` and `DiyProjectTool`
  4. Applies tool ownership data from `DiySkillProfile.toolsOwnedJson` to set initial `userToolAction`
  5. Records `decisionVerdict` and `decisionScoreJson` at creation time
- **`listProjects(propertyId, params)`** — Cursor-paginated project list.
- **`getProjectDetail(projectId, propertyId)`** — Returns full project with steps, materials, tools, and notes.
- **`updateProject(projectId, propertyId, patch)`** — Updates notes and photo URLs.
- **`updateStep(projectId, propertyId, stepId, patch)`** — Updates step status; if first step marked `IN_PROGRESS`, sets `project.startedAt`; if last required step marked `COMPLETED`, checks if project is eligible for completion prompt.
- **`completeProject(projectId, propertyId, payload)`** — Completes the project:
  1. Sets `status = COMPLETED`, `completedAt = now()`
  2. Records actual cost and time
  3. Calls `DiyCompletionService.onComplete()`
- **`abandonProject(projectId, propertyId, hireOut)`** — Sets status to `ABANDONED` or `HIRED_OUT`.
- **`adminListTemplates(params)`** — Returns all templates regardless of status (admin only).
- **`adminCreateTemplate(payload)`** — Atomic creation of template with nested steps, materials, tools in a Prisma transaction.
- **`adminUpdateTemplate(templateId, payload)`** — Replaces steps, materials, and tools atomically; updates core template fields.
- **`adminUpdateTemplateStatus(templateId, status)`** — Publishes, archives, or restores a template.

---

#### `DiyDecisionService` (`diyDecision.service.ts`)

Produces a `DiyDecisionVerdict` and full factor breakdown for a given project + user combination.

**Input:**

```typescript
interface DiyDecisionInput {
  projectCategory: DiyProjectCategory
  difficultyLevel: DiyDifficultyLevel
  safetyLevel: DiySafetyLevel
  permitRequirement: PermitRequirementStatus
  requiredSkillLevel: DiySkillLevel
  estimatedMinutes: number
  requiredToolCanonicalIds: string[]
  userId: string
}
```

**Scoring factors:**

| Factor | Weight | Notes |
|---|---|---|
| Skill match | 40% | User's per-category skill level vs template's `requiredSkillLevel` |
| Safety risk | 25% | HIGH safety + BEGINNER skill = hard HIRE_REQUIRED override |
| Tool availability | 15% | Proportion of required tools already owned by user |
| Time feasibility | 10% | Projects > 8 hours scored down; > 16 hours = HIRE_RECOMMENDED floor |
| Permit requirement | 10% | REQUIRED or LIKELY_REQUIRED scores down heavily |

**Verdict thresholds:**

| Score | Verdict |
|---|---|
| ≥ 70 | `DIY_RECOMMENDED` |
| 40–69 | `BORDERLINE` |
| 20–39 | `HIRE_RECOMMENDED` |
| < 20 | `HIRE_REQUIRED` |

**Hard overrides (applied before scoring):**

- `safetyLevel = HIGH` AND `userSkillLevel = BEGINNER` → always `HIRE_REQUIRED`
- `permitRequirement = REQUIRED` AND `safetyLevel = HIGH` → always `HIRE_REQUIRED`
- Project category `ELECTRICAL` with `safetyLevel = HIGH` and user not `ADVANCED` → `HIRE_REQUIRED`

**Output:**

```typescript
interface DiyDecisionResult {
  verdict: DiyDecisionVerdict
  score: number          // 0–100
  factors: DiyDecisionFactor[]
  blockers: string[]     // Human-readable hard block reasons
  savingsEstimateCents: number  // professionalCostMid - estimatedMaterialCostMid
  reasoning: string      // One-sentence plain-English summary
}

interface DiyDecisionFactor {
  code: string
  label: string
  effect: 'positive' | 'negative' | 'neutral'
  contributionPoints: number
  description: string
}
```

---

#### `DiyCompletionService` (`diyCompletion.service.ts`)

Runs as part of the `completeProject` flow.

- **`onComplete(project)`**:
  1. Creates a `HomeEvent` via the existing `homeEventService`:
     - `eventType`: `MAINTENANCE` for most categories; `IMPROVEMENT` for PAINTING, EXTERIOR, FLOORING
     - `title`: Project title
     - `description`: "DIY — completed by homeowner"
     - `importance`: `NORMAL`
     - `costCents`: `actualMaterialCostCents` (links to Expense creation)
     - `durationMinutes`: `actualMinutes`
  2. If `project.maintenanceTaskId` is set → marks the linked `PropertyMaintenanceTask` as `COMPLETED`
  3. If `project.incidentId` is set → transitions the linked `Incident` to status `RESOLVED` (if currently `ACKNOWLEDGED`)
  4. Sets `project.homeEventId` to the created event ID

---

#### `DiyAiGuideService` (`diyAiGuide.service.ts`)

Handles custom guide generation via Gemini for projects that do not match any template.

- **`initiateGeneration(userId, propertyId, userPrompt)`** — Creates a `DiyAiGuide` row with `status = PENDING` and enqueues a BullMQ job.
- **`generate(guideId)`** — Called by the worker:
  1. Fetches user's `DiySkillProfile` for context
  2. Fetches property data for context (type, systems, age)
  3. Builds a structured Gemini prompt (see below)
  4. Calls `geminiService.generateContent()`
  5. Parses the JSON response into steps, materials, tools, safety warnings
  6. Updates guide with `status = COMPLETED` and persisted content
  7. On error: sets `status = FAILED` and `errorMessage`
- **`getGuide(guideId, propertyId)`** — Returns guide with status and content.

**Gemini prompt structure:**

```
You are a home maintenance expert helping a homeowner safely complete a DIY project.

Homeowner skill levels: [per-category skills from DiySkillProfile]
Property: [type, age, systems summary]
Project description: "[userPrompt]"

Respond with a JSON object matching this exact schema:
{
  "title": string,
  "summary": string,
  "category": one of [HVAC, PLUMBING, ELECTRICAL, PAINTING, GENERAL, EXTERIOR, FLOORING, APPLIANCE, LANDSCAPING, OTHER],
  "verdict": one of [DIY_RECOMMENDED, BORDERLINE, HIRE_RECOMMENDED, HIRE_REQUIRED],
  "safetyWarnings": string[],
  "steps": [{ "stepNumber": number, "title": string, "description": string, "estimatedMinutes": number | null, "safetyNote": string | null, "tipNote": string | null }],
  "materials": [{ "name": string, "unit": string, "quantity": number, "unitPriceCents": number | null, "purchaseNote": string | null }],
  "tools": [{ "name": string, "isRequired": boolean, "defaultToolAction": "ALREADY_OWNED" | "RENT" | "BUY" | null }]
}

If the project involves main electrical panels, gas lines, load-bearing structural elements, or anything requiring a licensed contractor in most US jurisdictions, set verdict to HIRE_REQUIRED and explain in safetyWarnings. Do not generate steps for those tasks.
```

---

### Validators (`diy.validators.ts`)

| Schema | Used By |
|---|---|
| `UpsertSkillProfileSchema` | `PUT /users/me/diy/skill-profile` |
| `ListTemplatesSchema` | `GET /diy/templates` (query params) |
| `DiyDecisionSchema` | `POST .../diy/decision` |
| `CreateProjectSchema` | `POST .../diy/projects` |
| `UpdateProjectSchema` | `PATCH .../diy/projects/:id` |
| `UpdateStepSchema` | `PATCH .../steps/:stepId` |
| `CompleteProjectSchema` | `POST .../complete` |
| `AbandonProjectSchema` | `POST .../abandon` |
| `GenerateAiGuideSchema` | `POST .../diy/ai-guide` |
| `AdminCreateTemplateSchema` | `POST /admin/diy/templates` |
| `AdminUpdateTemplateSchema` | `PUT /admin/diy/templates/:id` |

---

## Skill Assessment Quiz

The quiz is a one-time, 12-question self-assessment. It is not a test — it asks about past experience and comfort level. Results populate `DiySkillProfile`.

**Question structure:**

```typescript
interface DiyQuizQuestion {
  id: string
  text: string
  category: DiyProjectCategory | 'GENERAL_TOOLS'
  options: { value: number; label: string }[]  // value: 0 (no experience) → 3 (confident)
}
```

**Scoring:** Per-category score = average of question values for that category.

| Score | Skill Level |
|---|---|
| 0–0.9 | `BEGINNER` |
| 1.0–2.0 | `INTERMEDIATE` |
| 2.1–3.0 | `ADVANCED` |

**Tool ownership:** A separate checklist step in the quiz (not scored) captures which common tools the user owns. This populates `toolsOwnedJson` and feeds `DiyProjectTool.userToolAction` on project creation.

---

## Frontend

### Files

| File | Purpose |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/diy/page.tsx` | Main DIY hub — projects list, featured templates, skill profile CTA |
| `frontend/src/app/(dashboard)/dashboard/diy/assess/page.tsx` | Skill assessment quiz flow |
| `frontend/src/app/(dashboard)/dashboard/diy/templates/page.tsx` | Full template library browser |
| `frontend/src/app/(dashboard)/dashboard/diy/templates/[id]/page.tsx` | Template detail — preview, decision check, start project |
| `frontend/src/app/(dashboard)/dashboard/diy/projects/[id]/page.tsx` | Active project tracker — steps, materials, tools, notes |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/diy/page.tsx` | Property-scoped tool entry (redirects with `propertyId`) |
| `frontend/src/components/features/diy/DiyDecisionCard.tsx` | Verdict card with score, factors, savings estimate |
| `frontend/src/components/features/diy/SkillProfileCard.tsx` | User's assessed skill levels summary |
| `frontend/src/components/features/diy/TemplateCard.tsx` | Project template tile (for library and featured strip) |
| `frontend/src/components/features/diy/ProjectStepList.tsx` | Step-by-step checklist with status controls |
| `frontend/src/components/features/diy/MaterialsChecklist.tsx` | Materials list with quantity, cost, purchased toggle |
| `frontend/src/components/features/diy/ToolsList.tsx` | Tool list with rent/buy/owned selection |
| `frontend/src/components/features/diy/SafetyWarningBanner.tsx` | Contextual safety callout (amber or red by severity) |
| `frontend/src/components/features/diy/AiGuideSheet.tsx` | Bottom sheet for custom AI guide generation input |
| `frontend/src/components/features/diy/ProjectCompleteSheet.tsx` | Completion flow — actual cost/time capture |
| `frontend/src/components/features/diy/DiyUtils.ts` | Icons, label maps, color helpers |
| `frontend/src/lib/api/client.ts` | API client method additions |
| `frontend/src/types/index.ts` | TypeScript interface additions |

---

### Main Hub Page (`diy/page.tsx`)

**Route:** `/dashboard/diy?propertyId=<id>`

**Layout (mobile-first, top to bottom):**

1. **Skill Profile banner** — If no `DiySkillProfile` exists, full-width CTA: "Tell us your skill level to get personalised recommendations." If assessed, shows a compact `SkillProfileCard`.
2. **Active Projects** — Horizontal scroll cards for `IN_PROGRESS` and `PLANNING` projects. "No active projects" empty state if none.
3. **Featured Templates** — Horizontal scroll strip of `TemplateCard` components ordered by `featuredOrder`. "Browse all →" link to template library.
4. **Describe Your Project** — "Don't see your project? Describe it." button opens `AiGuideSheet`.
5. **Completed Projects** — Collapsible section showing `COMPLETED` and `ABANDONED` projects.

---

### Skill Assessment Page (`assess/page.tsx`)

**Route:** `/dashboard/diy/assess`

Multi-step quiz flow:
1. Introduction screen — "This takes about 3 minutes. Your answers help us match you with the right projects."
2. 12 questions displayed one at a time with a progress bar
3. Tool ownership checklist (common tools: drill, stud finder, level, utility knife, wet/dry vac, multimeter)
4. Review screen showing per-category skill level computed from answers
5. Confirm → `PUT /api/users/me/diy/skill-profile` → redirect to DIY hub

---

### Template Library (`templates/page.tsx`)

**Route:** `/dashboard/diy/templates?propertyId=<id>`

- Filter chip row: All / HVAC / Plumbing / Electrical / Painting / General / Exterior
- Secondary filter: Difficulty (Easy / Moderate / Hard)
- Search input (debounced, hits `search` query param)
- Masonry grid of `TemplateCard` components
- If user has a `DiySkillProfile`, templates with `requiredSkillLevel` above user's level show a "May be challenging" label

---

### Template Detail (`templates/[id]/page.tsx`)

**Route:** `/dashboard/diy/templates/:id?propertyId=<id>`

Sections:
1. Title, category chip, difficulty chip, time estimate, cost range
2. `SafetyWarningBanner` if `safetyLevel = HIGH`
3. Permit notice if `permitRequirement = REQUIRED` or `LIKELY_REQUIRED`
4. Short and long descriptions
5. **DIY Decision Check** — inline `DiyDecisionCard` with verdict and reasoning (fetched from `POST /diy/decision` on page load using template data + user skill profile)
6. Steps preview (collapsed; "See all X steps" expands)
7. Materials list summary (top 3 + "and X more")
8. Tools needed
9. Estimated savings vs hiring
10. **"Start Project"** CTA — creates project and navigates to project tracker; disabled if verdict is `HIRE_REQUIRED`
11. **"Book a Pro Instead"** secondary CTA — routes to provider booking with category pre-selected

---

### Project Tracker (`projects/[id]/page.tsx`)

**Route:** `/dashboard/diy/projects/:id?propertyId=<id>`

Sections:
1. Project title, status badge, category chip
2. Progress bar (completed required steps / total required steps)
3. **Steps** — `ProjectStepList`:
   - Each step shows title, description, estimated time, safety note, tip
   - Status controls: Mark In Progress / Mark Done / Skip (optional steps only)
   - Notes field per step (textarea)
   - Step-level `SafetyWarningBanner` if `safetyNote` is present
4. **Materials** — `MaterialsChecklist` with purchased toggle per item and total cost estimate
5. **Tools** — `ToolsList` with rent/buy/owned selection (updates `userToolAction`)
6. **Notes & Photos** — Project-level notes textarea; photo upload grid
7. **Complete Project** button — shown when all required steps are `COMPLETED`; opens `ProjectCompleteSheet`
8. **"I'll hire a pro instead"** link — opens confirm → calls abandon + navigates to booking

---

### `DiyDecisionCard.tsx`

Displays the DIY vs hire verdict:

- Verdict badge: DIY Recommended (green) / Borderline (amber) / Hire Recommended (orange) / Hire Required (red)
- Score bar (0–100)
- Savings estimate: "You could save ~$180 vs hiring"
- Expandable factors list: each factor shows label, effect icon, and description
- Hard blockers (if any) shown as a prominent warning block above the score
- One-sentence `reasoning` summary

---

### `ProjectCompleteSheet.tsx`

Bottom sheet triggered when user taps "Complete Project":

1. Congratulations header
2. "How long did it actually take?" — number input (minutes, converts to hours display)
3. "What did materials cost?" — dollar amount input
4. "Add any notes" — optional textarea
5. Confirm → `POST .../complete` → success state showing HomeEvent created + link to Home Timeline

---

### API Client Methods

```typescript
// Skill profile
getDiySkillProfile(): Promise<DiySkillProfile | null>
upsertDiySkillProfile(payload: DiySkillProfilePayload): Promise<DiySkillProfile>

// Templates
listDiyTemplates(params?: DiyTemplateListParams): Promise<{ items: DiyTemplateSummary[]; nextCursor?: string }>
getFeaturedDiyTemplates(): Promise<DiyTemplateSummary[]>
getDiyTemplateDetail(templateId: string): Promise<DiyTemplateDetail>

// Decision
getDiyDecision(
  propertyId: string,
  payload: DiyDecisionInput
): Promise<DiyDecisionResult>

// Projects
createDiyProject(
  propertyId: string,
  payload: CreateDiyProjectPayload
): Promise<DiyProjectDetail>

listDiyProjects(
  propertyId: string,
  params?: DiyProjectListParams
): Promise<{ items: DiyProjectSummary[]; nextCursor?: string }>

getDiyProject(propertyId: string, projectId: string): Promise<DiyProjectDetail>

updateDiyProject(
  propertyId: string,
  projectId: string,
  patch: UpdateDiyProjectPayload
): Promise<DiyProjectDetail>

updateDiyProjectStep(
  propertyId: string,
  projectId: string,
  stepId: string,
  patch: { status: DiyStepStatus; notes?: string }
): Promise<DiyProjectStep>

completeDiyProject(
  propertyId: string,
  projectId: string,
  payload: { actualMinutes?: number; actualMaterialCostCents?: number; notes?: string }
): Promise<{ homeEventId: string }>

abandonDiyProject(
  propertyId: string,
  projectId: string,
  payload: { hireOut?: boolean }
): Promise<void>

// AI Guide
generateDiyAiGuide(
  propertyId: string,
  userPrompt: string
): Promise<{ guideId: string }>

getDiyAiGuide(propertyId: string, guideId: string): Promise<DiyAiGuide>
```

---

### TypeScript Interfaces

```typescript
type DiyProjectCategory = 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'PAINTING' | 'GENERAL' | 'EXTERIOR' | 'FLOORING' | 'APPLIANCE' | 'LANDSCAPING' | 'OTHER'
type DiySkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
type DiyDifficultyLevel = 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT_ONLY'
type DiyProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED' | 'HIRED_OUT'
type DiyDecisionVerdict = 'DIY_RECOMMENDED' | 'BORDERLINE' | 'HIRE_RECOMMENDED' | 'HIRE_REQUIRED'
type DiyStepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
type DiyToolAction = 'ALREADY_OWNED' | 'RENT' | 'BUY'
type DiySafetyLevel = 'LOW' | 'MODERATE' | 'HIGH'
type DiyAiGuideStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED'

interface DiySkillProfile {
  id: string
  hvac: DiySkillLevel
  plumbing: DiySkillLevel
  electrical: DiySkillLevel
  painting: DiySkillLevel
  general: DiySkillLevel
  exterior: DiySkillLevel
  flooring: DiySkillLevel
  appliance: DiySkillLevel
  landscaping: DiySkillLevel
  toolsOwnedJson: string[]
  assessedAt: string
}

interface DiyTemplateSummary {
  id: string
  slug: string
  title: string
  shortDescription: string
  category: DiyProjectCategory
  difficultyLevel: DiyDifficultyLevel
  requiredSkillLevel: DiySkillLevel
  safetyLevel: DiySafetyLevel
  estimatedMinutes: number
  estimatedMaterialCostMinCents?: number
  estimatedMaterialCostMaxCents?: number
  professionalCostMinCents?: number
  professionalCostMaxCents?: number
  tags: string[]
  featuredOrder?: number
}

interface DiyTemplateStep {
  id: string
  stepNumber: number
  title: string
  description: string
  estimatedMinutes?: number
  safetyNote?: string
  tipNote?: string
  imageUrl?: string
  isOptional: boolean
}

interface DiyTemplateMaterial {
  id: string
  name: string
  unit: string
  quantityFormula: string
  unitPriceCents: number
  isOptional: boolean
  purchaseNote?: string
}

interface DiyTemplateTool {
  id: string
  name: string
  canonicalId?: string
  isRequired: boolean
  defaultToolAction: DiyToolAction
  rentDailyPriceCents?: number
  buyEstimatePriceCents?: number
}

interface DiyTemplateDetail extends DiyTemplateSummary {
  longDescription?: string
  permitRequirement: string
  steps: DiyTemplateStep[]
  materials: DiyTemplateMaterial[]
  tools: DiyTemplateTool[]
}

interface DiyDecisionFactor {
  code: string
  label: string
  effect: 'positive' | 'negative' | 'neutral'
  contributionPoints: number
  description: string
}

interface DiyDecisionResult {
  verdict: DiyDecisionVerdict
  score: number
  factors: DiyDecisionFactor[]
  blockers: string[]
  savingsEstimateCents: number
  reasoning: string
}

interface DiyProjectSummary {
  id: string
  title: string
  category: DiyProjectCategory
  status: DiyProjectStatus
  decisionVerdict?: DiyDecisionVerdict
  requiredStepCount: number
  completedStepCount: number
  templateId?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
}

interface DiyProjectStep {
  id: string
  stepNumber: number
  title: string
  description: string
  estimatedMinutes?: number
  safetyNote?: string
  tipNote?: string
  isOptional: boolean
  status: DiyStepStatus
  notes?: string
  completedAt?: string
}

interface DiyProjectMaterial {
  id: string
  name: string
  unit: string
  quantity: number
  unitPriceCents: number
  totalEstimateCents: number
  isOptional: boolean
  purchaseNote?: string
  isPurchased: boolean
}

interface DiyProjectTool {
  id: string
  name: string
  isRequired: boolean
  defaultToolAction: DiyToolAction
  userToolAction?: DiyToolAction
  rentDailyPriceCents?: number
  buyEstimatePriceCents?: number
}

interface DiyProjectDetail extends DiyProjectSummary {
  description?: string
  maintenanceTaskId?: string
  incidentId?: string
  inventoryItemId?: string
  homeEventId?: string
  notesJson: { text: string; createdAt: string }[]
  photoUrls: string[]
  actualMinutes?: number
  actualMaterialCostCents?: number
  steps: DiyProjectStep[]
  materials: DiyProjectMaterial[]
  tools: DiyProjectTool[]
}

interface DiyAiGuide {
  id: string
  status: DiyAiGuideStatus
  userPrompt: string
  category?: DiyProjectCategory
  generatedTitle?: string
  generatedSummary?: string
  stepsJson?: object[]
  materialsJson?: object[]
  toolsJson?: object[]
  decisionVerdict?: DiyDecisionVerdict
  safetyWarningsJson?: string[]
  errorMessage?: string
  createdAt: string
}
```

---

## Workers / Background Jobs

### Files

| File | Purpose |
|---|---|
| `workers/src/jobs/generateDiyAiGuide.job.ts` | Processes queued Gemini guide generation requests |
| `workers/src/worker.ts` | Queue registration (no cron needed; all jobs are user-triggered) |

### `generateDiyAiGuide.job.ts`

Triggered when `DiyAiGuideService.initiateGeneration()` enqueues a job.

Steps:
1. Fetch `DiyAiGuide` by ID (status must be `PENDING` or `GENERATING`)
2. Set `status = GENERATING`
3. Fetch user skill profile and property data for prompt context
4. Call Gemini via `geminiService.generateContent(prompt)`
5. Parse and validate the JSON response
6. Update `DiyAiGuide` with structured content and `status = COMPLETED`
7. On any error: set `status = FAILED` and `errorMessage`

**No cron schedule.** All guide generation jobs are user-triggered. BullMQ concurrency for this queue: 3 (Gemini rate limit buffer).

---

## Integration Points with Existing Features

### Seasonal Checklist

`SeasonalTask` rows that fall within DIY-appropriate categories (HVAC filter changes, gutter cleaning, caulking, deck treatment) expose a `diyTemplateSlug` field. When set, the seasonal task card shows a "Start DIY Project" secondary CTA that opens the template detail pre-linked to the task.

The `DiyProject.maintenanceTaskId` FK covers both seasonal tasks (via `SeasonalTask` → `PropertyMaintenanceTask` hierarchy) and standalone maintenance tasks.

### Maintenance Tasks

`PropertyMaintenanceTask` cards in the maintenance tracker show a "Try DIY" chip when the task category maps to a known `DiyProjectCategory` and at least one template exists for that category. Tapping routes to the template detail page with `maintenanceTaskId` in the query string, which is persisted on project creation.

On `DiyCompletionService.onComplete()`, the linked `PropertyMaintenanceTask` is marked `COMPLETED` so the maintenance tracker reflects the DIY resolution without requiring a separate update.

### Incidents

Open `Incident` rows show a "Resolve with DIY" secondary action for incident categories that map to DIY-eligible tasks (water leak → plumbing templates; HVAC failure → HVAC templates). This sets `incidentId` on the created project. On completion, the incident is transitioned to `RESOLVED`.

### Provider Booking

Two surfaces route to provider booking:
1. Template detail page — "Book a Pro Instead" CTA with category pre-filled
2. Project abandon flow with `hireOut: true` — routes to `/providers` with the project's category as a pre-filter

The existing booking flow already supports a `sourceCategory` query param for this purpose.

### Home Events (Property Timeline)

`DiyCompletionService.onComplete()` calls the existing `HomeEventService` to create a `HomeEvent`. The event appears in the home timeline with a "DIY" badge and the actual cost and duration reported by the homeowner. This is the primary mechanism by which DIY activity enters the permanent property record.

### Energy Auditor

Completed HVAC DIY projects (filter replacement, duct sealing) trigger a note in the Energy Auditor: "HVAC filter replaced on [date] — consider re-running your energy estimate." This is a lightweight signal surfaced via the `homeEventId` created on completion; no direct data model linkage is needed.

---

## Mobile Navigation

DIY Project Center is registered in the mobile tool catalog under **Home Tools**:

```typescript
{
  key: 'diy',
  name: 'DIY Project Center',
  description: 'Step-by-step guides for projects you can do yourself',
  hrefSuffix: 'tools/diy',
  navTarget: 'tool:diy',
  icon: resolveToolIcon('home', 'diy'),
  isActive: (pathname) =>
    /^\/dashboard\/(properties\/[^/]+\/tools\/diy|diy)(\/|$)/.test(pathname),
}
```

**Source file:** `frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`

---

## Data Flow

```
User sees a seasonal task / maintenance task / incident
  └─ "Try DIY" CTA → Template detail page
        │
OR user opens /dashboard/diy
  └─ Browse template library or describe custom project
        │
        ▼
Template detail page
  └─ POST /api/properties/:id/diy/decision (template data + user skill profile)
  └─ DiyDecisionService scores and returns verdict
  └─ DiyDecisionCard renders verdict, factors, savings
        │
        ▼ (if DIY_RECOMMENDED or BORDERLINE)
"Start Project" → POST /api/properties/:id/diy/projects
  ├─ DiyService copies steps, resolves material quantities, sets tool actions
  └─ Returns created DiyProject
        │
        ▼
Project tracker /diy/projects/:id
  ├─ User works through ProjectStepList
  │    └─ PATCH .../steps/:stepId updates status + notes
  ├─ User ticks off materials in MaterialsChecklist
  └─ User selects tool actions in ToolsList
        │
        ▼ (all required steps complete)
"Complete Project" → ProjectCompleteSheet
  └─ User enters actual cost + time
  └─ POST .../complete
        ├─ DiyCompletionService.onComplete()
        │    ├─ HomeEventService.create() → HomeEvent created
        │    ├─ PropertyMaintenanceTask marked COMPLETED (if linked)
        │    └─ Incident transitioned to RESOLVED (if linked)
        └─ Success screen with link to Home Timeline
        │
OR user taps "I'll hire a pro instead"
  └─ POST .../abandon { hireOut: true }
  └─ Navigate to /providers?category=<category>

---

Custom project path (no template):
"Describe your project" → AiGuideSheet
  └─ User types free-text description
  └─ POST /api/properties/:id/diy/ai-guide
  └─ DiyAiGuideService.initiateGeneration() → enqueues BullMQ job → returns guideId
        │
        ▼ (background)
generateDiyAiGuide.job.ts
  └─ Gemini generates structured guide
  └─ DiyAiGuide updated with COMPLETED status + stepsJson, materialsJson, toolsJson
        │
        ▼ (frontend polls GET /diy/ai-guide/:guideId)
Guide ready → "Start Project from AI Guide"
  └─ POST .../diy/projects { aiGuideId: ... }
  └─ Same project tracker flow as template-based projects
```

---

## Current Limitations

- Template library is admin-curated and has no self-service homeowner submission path. Phase 2 can add community-submitted templates with admin review.
- Material quantity formulas referencing room dimensions only resolve accurately if the homeowner has added rooms and dimensions to their inventory. If not, default fixed quantities are used with a "verify quantity before purchasing" note.
- AI guide generation is asynchronous. The UI polls every 3 seconds for up to 60 seconds; if generation is not complete, the user is shown a "We're still generating your guide — check back in a moment" message and the guide appears on the hub page when ready.
- The DIY decision engine does not access local building codes or jurisdiction-specific permit rules. It uses conservative heuristics. Homeowners should verify permit requirements for their municipality independently for any project in the ELECTRICAL or PLUMBING categories.
- Photo uploads on the project tracker use existing document upload infrastructure (S3 + pre-signed URLs). There is no in-app camera or annotation tool in Phase 1.
- No provider integration for tool rental recommendations — rental price estimates are admin-set averages and do not reflect local Home Depot / Lowe's pricing.

---

## Phase 2 Roadmap

| Item | Description |
|---|---|
| Community template submissions | Homeowners can submit templates; admin reviews and publishes |
| Tool rental price lookup | Integrate Home Depot / Menards tool rental API for live local pricing |
| Jurisdiction permit check | Call local building department APIs to confirm permit status per task and ZIP code |
| Step photo attachments | Per-step photo capture for progress documentation |
| AI step clarification chat | In-project Gemini chat for "I'm stuck on step 4" questions |
| Time-tracking timer | In-app stopwatch per step for accurate time reporting |
| DIY cost vs hire cost history | Aggregate completed DIY project savings over time on the financial dashboard |
| Shared household projects | Allow co-owner to see and update a project created by the primary homeowner |

---

## File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/diy.routes.ts` | Route definitions + middleware |
| `apps/backend/src/controllers/diy.controller.ts` | Request handlers |
| `apps/backend/src/services/diy.service.ts` | Core business logic |
| `apps/backend/src/services/diyDecision.service.ts` | DIY vs hire scoring engine |
| `apps/backend/src/services/diyCompletion.service.ts` | Post-completion HomeEvent + task hooks |
| `apps/backend/src/services/diyAiGuide.service.ts` | Gemini guide generation |
| `apps/backend/src/validators/diy.validators.ts` | Zod v4 input schemas |
| `apps/backend/prisma/schema.prisma` | DB models and enums |

### Frontend

| Path | Role |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/diy/page.tsx` | Main DIY hub |
| `apps/frontend/src/app/(dashboard)/dashboard/diy/assess/page.tsx` | Skill assessment quiz |
| `apps/frontend/src/app/(dashboard)/dashboard/diy/templates/page.tsx` | Template library browser |
| `apps/frontend/src/app/(dashboard)/dashboard/diy/templates/[id]/page.tsx` | Template detail + decision + start |
| `apps/frontend/src/app/(dashboard)/dashboard/diy/projects/[id]/page.tsx` | Project tracker |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/diy/page.tsx` | Property-scoped entry |
| `apps/frontend/src/components/features/diy/DiyDecisionCard.tsx` | Verdict card |
| `apps/frontend/src/components/features/diy/SkillProfileCard.tsx` | Skill summary card |
| `apps/frontend/src/components/features/diy/TemplateCard.tsx` | Template tile |
| `apps/frontend/src/components/features/diy/ProjectStepList.tsx` | Step-by-step checklist |
| `apps/frontend/src/components/features/diy/MaterialsChecklist.tsx` | Materials list |
| `apps/frontend/src/components/features/diy/ToolsList.tsx` | Tools list with action selector |
| `apps/frontend/src/components/features/diy/SafetyWarningBanner.tsx` | Safety callout |
| `apps/frontend/src/components/features/diy/AiGuideSheet.tsx` | Custom guide input sheet |
| `apps/frontend/src/components/features/diy/ProjectCompleteSheet.tsx` | Completion flow sheet |
| `apps/frontend/src/components/features/diy/DiyUtils.ts` | UI helpers, icons, label maps |
| `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts` | Mobile nav registration |
| `apps/frontend/src/lib/api/client.ts` | Typed API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |

### Workers

| Path | Role |
|---|---|
| `apps/workers/src/jobs/generateDiyAiGuide.job.ts` | Gemini guide generation worker |
| `apps/workers/src/worker.ts` | Queue registration |
| `apps/workers/prisma/schema.prisma` | Synced mirror of backend Prisma schema |
