# ContractToCozy — Strategic Transformation Plan
## Principal Architecture + UX + Product + Pre-Launch Execution

> **Scope:** Transform existing CtC product into a premium Home Command Center using the existing codebase, routes, backend systems, and design system. No greenfield rebuild.

---

## SECTION 1 — Current State Mapping

### Route Migration Table

| Existing Route / Tool | New Surface | Action | Notes |
|---|---|---|---|
| `/dashboard` | Today (Command Center) | **Refactor** | Rebuild as Home Command Center |
| `/dashboard/daily-snapshot` | Today | **Merge → hide** | Feed into Command Center hero |
| `/dashboard/vault` | Vault | **Promote** | Elevate to primary nav |
| `/dashboard/inventory` | Vault › Assets | **Merge** | Merge into Vault/Assets tab |
| `/dashboard/documents` | Vault › Documents | **Merge** | Vault/Documents tab |
| `/dashboard/warranties` | Vault › Coverage | **Merge** | Vault/Coverage tab |
| `/dashboard/properties/[id]/inventory` | Vault | **Merge** | Consolidate under Vault |
| `/dashboard/properties/[id]/inventory/coverage` | Vault › Coverage | **Merge** | |
| `/dashboard/properties/[id]/vault` | Vault | **Merge** | |
| `/dashboard/actions` | Resolution Center | **Refactor** | Rename + upgrade |
| `/dashboard/maintenance` | Resolution Center › Preventive | **Merge** | Sub-flow |
| `/dashboard/seasonal` | Resolution Center › Preventive | **Merge** | Seasonal as a filter |
| `/dashboard/checklist` | Resolution Center | **Merge** | |
| `/dashboard/maintenance-setup` | Resolution Center / Vault onboarding | **Merge** | |
| `/dashboard/replace-repair` | Resolution Center › Repair vs Replace | **Refactor** | Deterministic journey |
| `/dashboard/fix` | Resolution Center › Urgent | **Refactor** | |
| `/dashboard/emergency` | Resolution Center › Urgent | **Merge** | |
| `/dashboard/protect` | Protect | **Refactor** | Top-level nav |
| `/dashboard/insurance` | Protect | **Merge** | |
| `/dashboard/coverage-intelligence` | Protect | **Merge** | |
| `/dashboard/risk-radar` | Protect | **Merge** | |
| `/dashboard/claims` | Protect › Claims | **Merge** | |
| `/dashboard/properties/[id]/claims` | Protect › Claims | **Merge** | |
| `/dashboard/properties/[id]/incidents` | Protect › Incidents | **Merge** | |
| `/dashboard/properties/[id]/recalls` | Protect › Recalls | **Merge** | |
| `/dashboard/properties/[id]/risk-assessment` | Protect | **Merge** | |
| `/dashboard/save` | Save | **Refactor** | Top-level nav |
| `/dashboard/home-savings` | Save | **Merge** | |
| `/dashboard/budget` | Save | **Merge** | |
| `/dashboard/appreciation` | Save | **Merge** | |
| `/dashboard/properties/[id]/financial-efficiency` | Save | **Merge** | |
| `/dashboard/properties/[id]/save` | Save | **Merge** | |
| `/dashboard/properties/[id]/tools/mortgage-refinance-radar` | Save › Refinance | **Merge** | |
| `/dashboard/tax-appeal` | Save › Tax | **Merge** | |
| `/dashboard/properties/[id]/tools/home-savings` | Save | **Merge** | |
| `/dashboard/providers` | Fix | **Refactor** | Top-level nav |
| `/dashboard/bookings` | Fix | **Merge** | |
| `/dashboard/providers/[id]` | Fix › Provider | **Keep** | |
| `/dashboard/providers/[id]/book` | Fix › Book | **Keep** | |
| `/dashboard/properties/[id]/status-board` | Today | **Merge** | Feed into Command Center |
| `/dashboard/properties/[id]/health-score` | My Home | **Merge** | |
| `/dashboard/properties/[id]/home-score` | My Home | **Merge** | |
| `/dashboard/properties/[id]/timeline` | My Home / Vault | **Merge** | |
| `/dashboard/properties/[id]/seller-prep` | My Home › Sell | **Keep** | Contextual CTA |
| `/dashboard/oracle` | My Home / Vault | **Refactor** | AI assistant surface |
| `/dashboard/visual-inspector` | Vault / Camera Loop | **Integrate** | Flagship capture flow |
| `/dashboard/inspection-report` | My Home / Vault | **Merge** | |
| `/dashboard/properties/[id]/tools/quote-comparison` | Fix / Resolution Center | **Keep** | Deep link |
| `/dashboard/properties/[id]/tools/home-digital-twin` | My Home | **Keep** | Advanced feature |
| `/dashboard/properties/[id]/tools/home-gazette` | Today | **Integrate** | Feed into Command Center |
| `/dashboard/properties/[id]/tools/home-event-radar` | Today / Protect | **Integrate** | |
| `/dashboard/energy` | My Home / Save | **Merge** | |
| `/dashboard/climate` | Protect | **Merge** | |
| `/dashboard/home-renovation-risk-advisor` | Fix / My Home | **Merge** | |
| `/dashboard/modifications` | My Home | **Merge** | |
| `/dashboard/expenses` | Save | **Merge** | |
| `/dashboard/moving-concierge` | My Home | **Keep** | Contextual |
| `/dashboard/properties/[id]/tools/plant-advisor` | My Home | **Keep** | Keep in nav always |
| `/dashboard/properties/[id]/tools/hidden-asset-finder` | Save | **Merge** | |
| `/dashboard/properties/[id]/tools/negotiation-shield` | Fix | **Merge** | |
| `/dashboard/properties/[id]/tools/service-price-radar` | Fix | **Merge** | |
| All 30+ deep tools (`/tools/*`) | Resolution Center / Save / Protect / Fix | **Deep-link only** | Remove from primary nav |
| `/dashboard/ai-tools` | Remove from nav | **Hide** | Tool directory feel — kill it |
| `/dashboard/home-tools` | Remove from nav | **Hide** | Same |
| `/dashboard/worker-jobs` | Admin-only | **Hide** | |
| `/dashboard/knowledge-admin` | Admin-only | **Hide** | |
| `/dashboard/analytics-admin` | Admin-only | **Hide** | |
| `/dashboard/community-events` | Today | **Integrate** | Feed into Command Center |
| `/dashboard/home-event-radar` | Today | **Integrate** | |
| `/knowledge` | Global footer / contextual | **Keep** | Not primary nav |
| `/marketplace` | Fix / contextual | **Integrate** | |
| `/aha-mock` | Delete | **Remove** | |

**Routes removed from primary nav** (still exist, accessed via context/deep-links):
`/ai-tools`, `/home-tools`, `/do-nothing-simulator`, `/risk-premium-optimizer`, `/home-renovation-risk-advisor`, `/capital-timeline`, all `/tools/*` sub-routes, `/worker-jobs`, `/knowledge-admin`, `/analytics-admin`

---

## SECTION 2 — New Information Architecture

### Top-Level Navigation: 6 Sections

```
Today  |  My Home  |  Protect  |  Save  |  Fix  |  Vault
```

---

### TODAY (Home Command Center)

**Purpose:** Active daily intelligence — answer *what matters now* at a glance.

**Key Widgets:**
- Hero: greeting + home status summary + primary CTA + savings/risk highlight
- Priority Feed: top 3 recommended actions with reasoning
- Quick Wins: immediate low-effort opportunities
- Home Memory Snapshot: recent uploads, expiring warranties
- Progress/Outcomes: money saved this month, tasks completed

**Routes surfaced:**
- `/dashboard` (rebuilt)
- Integrates: `daily-snapshot`, `home-gazette`, `community-events`, `home-event-radar`, `status-board`, `notifications`

**Desktop nav:** Persistent left sidebar, Today is the landing after login
**Mobile nav:** Bottom tab bar, Today = center home button
**Empty state:** "Let's learn about your home" → trigger Vault onboarding + camera capture
**CTA model:** One primary action per session (contextual: upload photo / review risk / book provider)

---

### MY HOME

**Purpose:** Living record of the property — structure, history, health, improvements.

**Key Widgets:**
- Property Card (address, year built, sq ft, type)
- Home Health Score (from `HomeScoreReport`)
- Timeline of events (moves, improvements, incidents)
- Rooms + systems map
- Digital Twin access
- Seller Prep CTA (contextual)

**Routes surfaced:**
- `/dashboard/properties/[id]`
- `/dashboard/properties/[id]/health-score`
- `/dashboard/properties/[id]/home-score`
- `/dashboard/properties/[id]/timeline`
- `/dashboard/properties/[id]/rooms/[roomId]`
- `/dashboard/properties/[id]/seller-prep` (contextual CTA)
- `/dashboard/oracle` (AI assistant)
- `/dashboard/properties/[id]/tools/home-digital-twin`

**Desktop:** Tabs within My Home: Overview / Rooms / Timeline / Reports
**Mobile:** Scrollable with sticky property selector
**Empty state:** Property creation flow → onboarding
**CTA model:** "Add to your home memory" → Vault capture

---

### PROTECT

**Purpose:** Insurance, risk, incidents, recalls — keep the home safe.

**Key Widgets:**
- Coverage status (policies, gaps, expirations)
- Active incidents / open claims
- Risk score + top 3 risks
- Recall alerts (matched to inventory)
- Climate risk summary

**Routes surfaced:**
- `/dashboard/protect` (rebuilt)
- `/dashboard/insurance`
- `/dashboard/coverage-intelligence`
- `/dashboard/risk-radar`
- `/dashboard/properties/[id]/claims/[claimId]`
- `/dashboard/properties/[id]/incidents/[incidentId]`
- `/dashboard/properties/[id]/recalls`
- `/dashboard/properties/[id]/risk-assessment`
- `/dashboard/climate`

**Desktop:** Left sidebar with sub-sections: Coverage / Claims / Risks / Recalls
**Mobile:** Cards stacked, critical items float to top
**Empty state:** "Upload your insurance policy to get started" → Vault document capture
**CTA model:** Primary: "Review Coverage" or "File Claim" depending on context

---

### SAVE

**Purpose:** Surface financial opportunities — refinance, tax savings, energy, insurance optimization.

**Key Widgets:**
- Total savings surfaced YTD
- Top opportunities (refinance, tax appeal, insurance switch)
- Expense trend
- Budget vs actuals
- Hidden assets found
- Home appreciation value

**Routes surfaced:**
- `/dashboard/save` (rebuilt)
- `/dashboard/home-savings`
- `/dashboard/budget`
- `/dashboard/appreciation`
- `/dashboard/tax-appeal`
- `/dashboard/expenses`
- `/dashboard/properties/[id]/financial-efficiency`
- `/dashboard/properties/[id]/tools/mortgage-refinance-radar`
- `/dashboard/properties/[id]/tools/hidden-asset-finder`

**Desktop:** Tabs: Opportunities / Budget / Expenses / Appreciation
**Mobile:** Swipeable cards for each opportunity
**Empty state:** "Connect your home details to start finding savings" → property data collection
**CTA model:** Per-opportunity: "Explore" or "Act Now" based on urgency

---

### FIX

**Purpose:** Find, book, and track service providers. Get work done.

**Key Widgets:**
- Active bookings
- Recommended providers (from Resolution Center context)
- Quote comparison workspace
- Negotiation Shield access
- Service price benchmarks

**Routes surfaced:**
- `/dashboard/providers` (rebuilt)
- `/dashboard/bookings`
- `/dashboard/bookings/[id]`
- `/dashboard/providers/[id]`
- `/dashboard/providers/[id]/book`
- `/dashboard/properties/[id]/tools/quote-comparison`
- `/dashboard/properties/[id]/tools/negotiation-shield`
- `/dashboard/properties/[id]/tools/service-price-radar`
- `/marketplace`

**Desktop:** Split-panel: provider list left / booking detail right
**Mobile:** Search + category filter + list
**Empty state:** "What do you need fixed?" → category selection → provider search
**CTA model:** "Book Provider" or "Get Quotes"

---

### VAULT

**Purpose:** Unified memory layer — all appliances, documents, warranties, photos, service history.

**Key Widgets:**
- Quick Capture bar (Photo / Document / Item)
- Assets grid (appliances, systems, items)
- Documents list (policies, manuals, receipts)
- Coverage map (warranties + insurance)
- Timeline view
- Search

**Routes surfaced:**
- `/dashboard/vault` (rebuilt as unified surface)
- `/dashboard/inventory` (merged in)
- `/dashboard/documents` (merged in)
- `/dashboard/warranties` (merged in)
- `/dashboard/visual-inspector` (camera entry point)
- `/dashboard/properties/[id]/inventory/rooms/[roomId]`
- `/dashboard/properties/[id]/inventory/items/[itemId]/coverage`
- `/dashboard/properties/[id]/inventory/items/[itemId]/replace-repair`

**Desktop:** Sidebar tabs: Assets / Documents / Coverage / Timeline / Search
**Mobile:** Tab bar within Vault, camera FAB always visible
**Empty state:** Full camera onboarding prompt — flagship first experience
**CTA model:** "Add to Vault" is always accessible, camera as primary

---

## SECTION 3 — Home Command Center

### Architecture: Replace `/dashboard` Page

**File:** `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`

**Page Layout:**

```
┌─────────────────────────────────────────────────────┐
│  HERO SECTION                                        │
│  "Good morning, Sarah"                               │
│  "Your home is in good shape — one item needs        │
│   attention."                                        │
│  [Review Water Heater Risk →]     $247 saved / month │
├─────────────────────────────────────────────────────┤
│  PRIORITY FEED (3 items max, ranked by engine)       │
│  ┌─────────────────────────────────┐                │
│  │ ⚠ Furnace filter overdue        │                │
│  │  Due 14 days ago · $23 risk     │                │
│  │  [Schedule Replacement →]       │                │
│  └─────────────────────────────────┘                │
│  ┌─────────────────────────────────┐                │
│  │ 💰 Refinance opportunity        │                │
│  │  Save ~$340/mo · Rate dropped   │                │
│  │  [See Numbers →]                │                │
│  └─────────────────────────────────┘                │
├─────────────────────────────────────────────────────┤
│  QUICK WINS                                          │
│  ○ Test smoke detectors  ○ Warranty expires in 12d  │
├─────────────────────────────────────────────────────┤
│  HOME MEMORY SNAPSHOT                                │
│  Recent: HVAC photo · Dishwasher manual added        │
│  Watch: Roof warranty expires Jun 2026               │
├─────────────────────────────────────────────────────┤
│  PROGRESS                                            │
│  $1,240 saved · 7 tasks done · Home score: 84/100   │
└─────────────────────────────────────────────────────┘
```

**Component Structure:**

```tsx
// apps/frontend/src/app/(dashboard)/dashboard/page.tsx

<CommandCenter>
  <HeroSection />           // greeting + home status + 1 primary CTA
  <PriorityFeed />          // top 3 from orchestration engine, ranked
  <QuickWins />             // 2-3 zero-friction items
  <HomeMemorySnapshot />    // recent vault activity + expiring warranties
  <ProgressOutcomes />      // savings/tasks/score trend
</CommandCenter>
```

**Data Sources (existing APIs to wire):**
- `OrchestrationActionEvent` → Priority Feed (already built, re-skin)
- `HomeSavingsOpportunity` → Quick Wins + Hero savings number
- `InventoryItem` + `Warranty` → Home Memory Snapshot
- `OrchestrationActionCompletion` → Progress/Outcomes
- `GazetteEdition` → background digest, surface top story in Hero
- `HomeScoreReport` → Home status summary
- `PropertyDailySnapshot` → savings/tasks/score trend

**Hero CTA Logic (deterministic):**
```
IF open urgent incident      → "Review [Incident Name]"
ELSE IF savings > $200/mo    → "See Your Savings"
ELSE IF vault < 3 items      → "Add Your First Appliance"
ELSE IF maintenance overdue  → "Schedule [Task Name]"
ELSE                         → "Review Home Health"
```

**States:**
- **Loading:** skeleton cards, no layout shift
- **First visit / empty:** onboarding prompt with camera CTA, no ghost widgets
- **Returning:** full widget set, last-visit delta shown ("3 new items since Monday")
- **Error:** graceful degradation per widget, never full-page error

---

## SECTION 4 — Vault (Memory Layer)

### Unified Vault Architecture

**Consolidation:** Merge `inventory`, `documents`, `warranties`, `vault` into one surface at `/dashboard/vault`.

**Four Tabs:**

```
Vault
├── Assets     (InventoryItem + HomeAsset)
├── Documents  (Document model)
├── Coverage   (Warranty + InsurancePolicy + CoverageAnalysis)
└── Timeline   (HomeEvent + BookingTimeline + MaintenanceTask history)
```

Plus: Global search across all four tabs.

---

### Quick Capture (Always Visible)

**Placement:** Sticky FAB on mobile, top-right action bar on desktop.

```
[ 📷 Take Photo ]  [ 📄 Upload Doc ]  [ + Add Item ]
```

- **Take Photo** → camera → visual inspector → AI extraction → draft review → Vault
- **Upload Doc** → file picker → OCR → categorize → Vault
- **Add Item** → manual entry form → Vault

---

### AI Extraction Flow

**Existing tools to wire:** `VisualInspector` + `InventoryOcrSession` + `InventoryOcrField` + `InventoryDraftItem`

**Flow:**
```
1. Photo captured (camera or upload)
2. Send to /api/visual-inspector or OCR endpoint
3. Loading state: "Reading your [appliance]..."
4. Extraction result:
   - Make / Model / Serial
   - Category (appliance / system / fixture)
   - Install date (if visible)
   - Warranty period (if detectable)
5. Draft review UI:
   - Pre-filled fields from extraction
   - Confidence indicators per field (FieldNudgeChip)
   - Editable corrections
   - "Looks good, Save to Vault" primary CTA
6. On confirm → InventoryItem created → Resolution Center generates next actions
7. Celebration: "Added to your Vault ✓"
```

**Confidence UI:**
```tsx
<FieldNudgeChip confidence={0.92}>Make: Carrier</FieldNudgeChip>
// Green = high confidence, Yellow = medium, Red = needs correction
// Uses existing FieldNudgeChip component
```

---

### Vault Asset Detail Drawer

Each asset opens a side drawer (desktop) or full sheet (mobile):

```
┌─────────────────────────────┐
│ 🔧 Carrier HVAC             │
│ Installed: Sep 2019          │
├─────────────────────────────┤
│ COVERAGE                    │
│ Warranty: Expires Mar 2027  │
│ Insurance: Covered           │
├─────────────────────────────┤
│ HISTORY                     │
│ Apr 2024 — Filter replaced  │
│ Jan 2023 — Annual service   │
├─────────────────────────────┤
│ DOCUMENTS                   │
│ Manual.pdf  · Receipt.jpg   │
├─────────────────────────────┤
│ RECOMMENDATIONS             │
│ Schedule filter change (due) │
└─────────────────────────────┘
```

**Data models:** `InventoryItem` → linked `Document`, `Warranty`, `PropertyMaintenanceTask`, `OrchestrationActionEvent`

---

### Coverage Tab

Visually shows:
- Each appliance/system → warranty status (green/yellow/red expiry)
- Insurance policies → coverage type + renewal date
- Gaps in coverage (items without warranty or insurance)

**Existing APIs:** `CoverageAnalysis`, `Warranty`, `InsurancePolicy`, `coverageAnalysis.routes.ts`

---

## SECTION 5 — Resolution Center (Intelligence Layer)

### Upgrade: `/dashboard/actions` → `/dashboard/resolution-center`

Not a list of tasks. A set of complete solutions.

---

### Item Structure (every recommendation)

```typescript
interface ResolutionItem {
  id: string
  category: 'preventive' | 'cost-savings' | 'urgent' | 'repair-vs-replace' | 'coverage' | 'provider'

  // Headline
  title: string              // "Replace furnace filter"
  summary: string            // "Overdue by 14 days. Continued delay risks HVAC damage."

  // Trust layer
  confidence: number         // 0-1
  source: string             // "Your maintenance history + manufacturer specs"
  lastUpdated: Date

  // Value
  estimatedSavings?: number  // $23
  riskIfIgnored: string      // "HVAC efficiency drops 15%, possible motor failure"
  downside: string           // "~$800 repair vs $12 filter"

  // Next step
  primaryCTA: {
    label: string            // "Schedule Replacement"
    action: CTAAction
  }

  // Journey
  flowType: FlowType         // determines which deterministic journey to launch
}
```

---

### Five Deterministic Journeys

**1. Preventive (Maintenance / Seasonal)**
```
Trigger → Why This Matters → Confirm Schedule → Book Provider or Mark DIY → Complete + Log
```
Sources: `MaintenancePrediction`, `SeasonalChecklist`, `PropertyHabit`

**2. Cost Savings (Refinance / Insurance / Tax / Energy)**
```
Trigger → Estimated Savings → See Numbers → Take Action / Schedule Later
```
Sources: `HomeSavingsOpportunity`, `RefinanceOpportunity`, `HiddenAssetProgram`

**3. Urgent Issue (Emergency / Incident)**
```
Alert → Immediate Action Steps → Contact Provider → Track → Resolve
```
Sources: `Incident`, `HomeEvent`, recall matches, `emergency.routes.ts`

**4. Repair vs Replace**
```
Item Detail → Cost Analysis → Recommendation → Book Provider or Order Replacement
```
Sources: `ReplaceRepairAnalysis`, `InventoryItem` age + condition, `ServicePriceBenchmark`

**5. Provider Execution**
```
Need Identified → Provider Match → Quote Comparison → Book → Track → Complete + Review
```
Sources: `ProviderProfile`, `QuoteComparisonWorkspace`, `Booking`

---

### Filters / Views

```
All  |  Urgent  |  Save Money  |  Preventive  |  Coverage  |  Completed
```

Completed items move to history — users see outcomes (money saved, tasks done, risks avoided).

---

### Completion Loop

1. Celebrate briefly (existing `MilestoneCelebration.tsx`)
2. Log outcome to `OrchestrationActionCompletion`
3. Update `PropertyMaintenanceTask` or relevant model
4. Update Progress widget on Command Center
5. Optionally prompt: "Add a photo of the completed work?" → Vault

---

## SECTION 6 — Camera → Vault → Action Loop

### Flagship Flow: Onboarding + Engagement

**Entry Points:**
- Command Center empty state (first visit)
- Vault FAB (recurring)
- Resolution Center item "Take Photo" CTA
- Push notification "Capture your new appliance"

---

### Full Journey (Happy Path)

```
STEP 1: Capture
  User taps [📷 Take Photo]
  Camera opens (native or web camera API)
  Viewfinder hint: "Point at label/receipt/issue"

STEP 2: Upload + Processing
  Image sent to /api/v1/visual-inspector (existing route)
  Loading state:
    "Reading your appliance..."
    [brand animation]
    2-4 second perceived wait

STEP 3: Extraction Result
  HIGH confidence (>85%):
    Pre-filled card, green confidence chips
    "We found: Carrier HVAC · Serial: 1234 · 2019"
    [Save to Vault →]  [Edit Details]

  MEDIUM confidence (60-85%):
    Card with yellow chips on uncertain fields
    "We think this is a furnace — does this look right?"
    Editable fields inline
    [Confirm & Save →]

  LOW confidence (<60%):
    "Help us get this right" mode
    Category selector + manual entry
    AI-extracted fields as suggestions only

STEP 4: Correction UI (if needed)
  Tap any field to edit
  Category selector with icons
  Manual override for any field

STEP 5: Save to Vault
  Item created in InventoryItem
  Linked docs attached

STEP 6: Success + Next Actions (the magic moment)
  [Animated card drop] "HVAC added to your Vault"

  Immediately below:
  "Based on your HVAC, here's what we recommend:"

  ┌─────────────────────────────────────┐
  │ 📅 Schedule annual maintenance      │
  │ Your unit is 5 years old             │
  │ [Add to Resolution Center →]        │
  └─────────────────────────────────────┘
  ┌─────────────────────────────────────┐
  │ 📄 Find your warranty               │
  │ Upload the manual to track coverage  │
  │ [Upload Manual →]                   │
  └─────────────────────────────────────┘

  Primary: [Done — View in Vault]
  Secondary: [Add Another Appliance]
```

---

### Specific Flow Examples

| Photo Input | AI Action | Vault Output | Resolution Center Output |
|---|---|---|---|
| Furnace nameplate | Extract make/model/serial/age | HVAC Asset + age data | Filter reminder + annual service |
| Dishwasher receipt | Extract purchase date + price | Purchase record + warranty start | Warranty tracking + extended warranty CTA |
| Roof damage photo | Detect damage category + severity | Incident photo + tagged event | Claim guidance + roofer booking |
| AC label | Extract BTU/model/SEER | AC Asset | Manual fetch + maintenance schedule |
| Water heater data plate | Extract capacity/install year | Asset + expected lifespan | Replace timeline + plumber match |
| Insurance declaration page | OCR → policy/coverage/dates | Insurance Document | Coverage gap analysis |

---

### State Reference

| State | Behavior |
|---|---|
| `idle` | Camera FAB visible |
| `capturing` | Camera open, hint overlay |
| `processing` | "Reading..." animation (1.5-3s) |
| `result-high` | Green confidence card, minimal friction |
| `result-medium` | Yellow chips, inline editable |
| `result-low` | Manual entry with AI suggestions |
| `saving` | Brief optimistic update |
| `success` | Celebration + next actions |
| `error` | "We couldn't read this" + manual fallback — never a dead end |

---

## SECTION 7 — Universal Trust Layer

### Every Recommendation Must Show

```typescript
interface TrustMetadata {
  confidence: 'high' | 'medium' | 'low'       // ConfidenceBadge
  source: string                               // SourceChip
  lastUpdated: Date                            // freshness indicator
  estimatedUpside: number | null              // EstimatedSavingsBadge
  riskIfIgnored: string                        // RiskOfDelayBadge
  whyThisMatters: string                       // WhyThisMattersCard
  userVerifiableAssumptions: string[]          // expandable list
}
```

---

### Reusable Trust Components

**New folder:** `apps/frontend/src/components/trust/`

```
apps/frontend/src/components/trust/
├── ConfidenceBadge.tsx        // High / Medium / Low visual indicator
├── SourceChip.tsx             // "Your maintenance history + manufacturer specs"
├── WhyThisMattersCard.tsx     // Expandable human-language explanation
├── EstimatedSavingsBadge.tsx  // "$247/mo · based on current rate vs 30yr avg"
├── RiskOfDelayBadge.tsx       // "Delay 30+ days → ~$400-800 repair risk"
└── TrustMetadataBar.tsx       // Composite: confidence + source + freshness inline
```

**Shared type:**
```typescript
// apps/frontend/src/lib/types/trust.ts
export interface TrustMetadata {
  confidence: 'high' | 'medium' | 'low'
  confidenceScore?: number
  source: string
  lastUpdated: string
  estimatedUpside?: { amount: number; period: string; basis: string }
  riskIfIgnored?: string
  whyThisMatters?: string
  userVerifiableAssumptions?: string[]
}
```

---

### Language Rewrites (Global Pass Required)

| Technical Jargon | Human Language |
|---|---|
| "Orchestration action event" | "What to do next" |
| "Coverage analysis initiated" | "Checking your coverage..." |
| "Risk premium optimization" | "Lower your insurance cost" |
| "HomeScoreReport generated" | "Your home health report is ready" |
| "InventoryOcrSession" | "Reading your appliance..." |
| "Guidance journey step" | "Next step" |
| "Signal provenance" | (never show to users) |
| "Do-nothing simulator" | "See what happens if you wait" |
| "Refinance radar match" | "You may be able to lower your mortgage rate" |
| "Hidden asset program" | "Savings you might be missing" |

---

### Trust Layer Integration Points

Apply `TrustMetadata` to all outputs from:
- `OrchestrationActionEvent` (Resolution Center items)
- `HomeSavingsOpportunity` (Save section)
- `RiskAssessmentReport` (Protect section)
- `MaintenancePrediction` (Preventive flows)
- `RefinanceOpportunity` (Save section)
- `HomeScoreReport` sections (My Home)
- Any AI/Gemini output (oracle, visual inspector, extraction)

---

## SECTION 8 — Pre-Launch Hardening + Metrics

### Hardening Checklist

#### Auth & Access
- [ ] JWT refresh token rotation working correctly
- [ ] Session expiry handled gracefully (redirect to login, not crash)
- [ ] Password reset flow end-to-end tested
- [ ] MFA enroll + verify + recovery codes working
- [ ] HOMEOWNER / PROVIDER role separation enforced on all routes
- [ ] Property scope enforced — users cannot access other users' property data

#### Routing & Navigation
- [ ] All 6 primary nav items accessible from mobile bottom nav
- [ ] All 6 primary nav items accessible from desktop sidebar
- [ ] Breadcrumbs correct on all deep routes
- [ ] 404 page exists and is branded
- [ ] Back navigation works correctly on mobile (no broken history)
- [ ] Property context preserved across nav (no context loss mid-flow)

#### Empty States
- [ ] Every primary section has a designed empty state (no blank white screens)
- [ ] New user journey: Today → Vault → first capture flow is unbroken
- [ ] Property-less state: prompt to add property, not broken dashboard
- [ ] Empty Vault prompts camera capture (not blank)
- [ ] Empty Resolution Center shows "You're all caught up" + proactive prompt

#### API & Loading
- [ ] Every API call has loading state (skeleton, not spinner where possible)
- [ ] Every API call has error state (graceful, not raw error object)
- [ ] Stale data shown while revalidating (no flash of empty on refocus)
- [ ] React Query error boundaries in place at route level
- [ ] Offline banner shows when network lost
- [ ] Critical data cached in IndexedDB for offline reading

#### Mobile
- [ ] Bottom nav renders correctly on iOS Safari (safe area insets)
- [ ] Camera capture works on iOS + Android mobile browsers
- [ ] Touch targets ≥ 44px on all interactive elements
- [ ] No horizontal scroll on any mobile page
- [ ] Modals/sheets dismiss correctly on mobile (tap outside, swipe down)
- [ ] Form inputs don't cause zoom on iOS (font-size ≥ 16px)

#### Performance
- [ ] LCP < 2.5s on dashboard (measured on 3G throttle)
- [ ] No layout shift (CLS < 0.1) on Command Center
- [ ] Images lazy-loaded with proper aspect ratios
- [ ] Code-split at route level (Next.js default, verify)
- [ ] No console errors in production build

#### Data & Privacy
- [ ] User can delete their account + data
- [ ] Document uploads are private (no public URLs without auth)
- [ ] Shared report tokens expire correctly
- [ ] CSP headers configured
- [ ] No sensitive data in client-side logs

#### Provider Portal
- [ ] Provider login/signup separate from homeowner
- [ ] Booking notifications reach providers
- [ ] Provider profile editable and complete
- [ ] Calendar integration functional

---

### Analytics Schema

**Core Events:**

```typescript
// apps/frontend/src/lib/analytics/events.ts

// Acquisition
landing_viewed              // { source, medium, campaign }
address_entered             // { address_valid: boolean }
signup_started              // { method: 'email' | 'google' }
signup_completed            // { method, time_to_complete_ms }
login_completed             // { method }

// Onboarding / Activation
property_claimed            // { property_id, address_zip }
onboarding_step_viewed      // { step: 'address' | 'confirm' | 'reveal' }
onboarding_completed        // { steps_completed, time_ms }

// Vault / Memory
vault_opened                // { tab: 'assets' | 'documents' | 'coverage' | 'timeline' }
camera_capture_started      // { entry_point: 'fab' | 'empty_state' | 'resolution_cta' }
photo_uploaded              // { item_type, extraction_confidence }
item_extracted              // { category, confidence_level, edited: boolean }
item_saved_to_vault         // { category, source: 'camera' | 'manual' | 'upload' }
document_uploaded           // { doc_type: 'policy' | 'manual' | 'receipt' | 'other' }
warranty_added              // { item_category, days_remaining }

// Resolution Center
resolution_center_opened    // { filter_active }
resolution_item_viewed      // { category, confidence_level }
resolution_item_expanded    // { category, item_id }
resolution_cta_clicked      // { category, cta_label, item_id }
resolution_item_completed   // { category, outcome, savings_captured }
resolution_item_snoozed     // { category, item_id }

// Save / Protect
savings_opportunity_viewed  // { type: 'refinance' | 'insurance' | 'tax' | 'energy' | 'hidden_asset' }
savings_action_taken        // { type, estimated_amount }
risk_reviewed               // { risk_type, severity }
claim_started               // { claim_type }
coverage_gap_viewed         // { gap_type }

// Fix / Providers
provider_searched           // { category, zip }
provider_profile_viewed     // { provider_id, category }
booking_started             // { category, provider_id }
booking_completed           // { category, booking_id }
quote_requested             // { category, provider_count }

// Engagement
command_center_viewed       // { priority_feed_count, widget_load_ms }
repeat_visit                // { days_since_last, session_count }
notification_opened         // { type, age_days }
home_score_viewed           // { score, section }
first_action_completed      // { category, time_since_signup_days }
```

**Session Properties (set once per session):**
```typescript
{
  user_id: string
  property_id: string
  vault_item_count: number
  days_since_signup: number
  platform: 'web-desktop' | 'web-mobile' | 'pwa'
  has_completed_onboarding: boolean
}
```

---

### North Star Metrics

| Metric | Definition | Target (90 days) |
|---|---|---|
| **Time to First Value** | Signup → first vault item saved | < 5 minutes |
| **Photo Activation Rate** | % users who upload first photo within 7 days | > 40% |
| **First Action Rate** | % users who complete first Resolution Center action | > 30% |
| **D7 Retention** | % users active on day 7 post-signup | > 25% |
| **Monthly Savings Surfaced** | Total $ shown in Save section across all users | Growing MoM |
| **Vault Depth** | Avg items per active user | > 5 at D30 |
| **Provider Booking Rate** | % active users who book at least one provider | > 10% at D30 |

---

## DELIVERABLES

### A. Route Migration Plan

**Redirects to configure in `next.config.js`:**
```javascript
{
  source: '/dashboard/inventory',
  destination: '/dashboard/vault?tab=assets'
},
{
  source: '/dashboard/documents',
  destination: '/dashboard/vault?tab=documents'
},
{
  source: '/dashboard/warranties',
  destination: '/dashboard/vault?tab=coverage'
},
{
  source: '/dashboard/actions',
  destination: '/dashboard/resolution-center'
},
{
  source: '/dashboard/maintenance',
  destination: '/dashboard/resolution-center?filter=preventive'
},
{
  source: '/dashboard/seasonal',
  destination: '/dashboard/resolution-center?filter=preventive'
},
{
  source: '/dashboard/fix',
  destination: '/dashboard/resolution-center?filter=urgent'
},
```

---

### B. New IA + Navigation Spec

**Desktop Sidebar:**
```
[Logo]
─────────────────
Today             (home icon)
My Home           (house icon)
─────────────────
Protect           (shield icon)
Save              (dollar/savings icon)
Fix               (wrench icon)
─────────────────
Vault             (lock/archive icon)
─────────────────
[Profile / Settings]  (bottom)
```

**Mobile Bottom Nav (5 items):**
```
Today | Vault | [📷 Camera FAB — center] | Fix | More
```

More drawer: My Home / Protect / Save / Profile

The camera FAB is center-bottom, always visible — capture is the primary engagement verb.

---

### C. Dashboard / Command Center Spec

**Route:** `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`

**Data hooks:**
```typescript
function useCommandCenter() {
  const actions    = useOrchestrationActions()      // Priority Feed
  const savings    = useHomeSavingsSummary()        // Hero + Quick Wins
  const vault      = useRecentVaultItems()          // Memory Snapshot
  const outcomes   = useCompletionSummary()         // Progress
  const homeScore  = useLatestHomeScore()           // Status summary
  const alerts     = useActiveIncidents()           // Urgent override
}
```

---

### D. Vault PRD

**Route:** `/dashboard/vault`

**Phase 1 (weeks 1-4):**
- Merge inventory + documents + warranties into tabbed interface
- Implement Quick Capture bar
- Wire camera to existing `visual-inspector` route

**Phase 2 (weeks 5-8):**
- Asset detail drawer with full history
- Coverage tab with gap visualization
- Timeline view with linked events

**Phase 3 (weeks 9-12):**
- Search across all items
- Bulk upload support
- Sharing via existing `homeReportExport` + share tokens

---

### E. Resolution Center PRD

**Route:** `/dashboard/resolution-center` (rename from `/dashboard/actions`)

**Phase 1 (weeks 1-4):**
- Rebuild action card UI with full trust metadata
- Implement 5 journey flow templates
- Wire completion loop with celebration

**Phase 2 (weeks 5-8):**
- Repair vs Replace journey (wire `ReplaceRepairAnalysis`)
- Provider Execution journey (wire `Booking` + `QuoteComparisonWorkspace`)
- Snooze + dismiss functionality

**Phase 3 (weeks 9-12):**
- Outcome tracking visible to user
- Completed history with outcomes logged
- Savings attribution shown per completed item

---

### F. Camera Loop Flow Spec

**Components to build/modify:**
- `CameraCapture.tsx` — wrapper for native camera + file upload
- `ExtractionLoader.tsx` — branded loading state (2-4s)
- `ExtractionResult.tsx` — confidence-aware review card (uses existing `FieldNudgeChip`)
- `VaultSuccessCard.tsx` — celebration + next actions
- Wire into existing `VisualInspector` API + `InventoryOcrSession` models

---

### G. Trust System Component Spec

```
apps/frontend/src/components/trust/
├── ConfidenceBadge.tsx
├── SourceChip.tsx
├── WhyThisMattersCard.tsx
├── EstimatedSavingsBadge.tsx
├── RiskOfDelayBadge.tsx
└── TrustMetadataBar.tsx
```

---

### H. Hardening Checklist

See Section 8 — 35 items across Auth, Routing, Empty States, API, Mobile, Performance, Data/Privacy, Provider Portal.

---

### I. Analytics Schema

See Section 8 — 38 events + session properties, firing through existing `ProductAnalyticsEvent` model.

---

### J. 90-Day Execution Plan

#### Days 1-14: Foundation
- [ ] Implement new navigation structure (sidebar + mobile bottom nav)
- [ ] Build all 5 trust components (`ConfidenceBadge`, `SourceChip`, `WhyThisMattersCard`, `EstimatedSavingsBadge`, `RiskOfDelayBadge`)
- [ ] Set up route redirects for merged surfaces
- [ ] Rebuild Command Center page with real data (replace passive dashboard)
- [ ] Language audit: rewrite all jargon-facing strings to human language
- [ ] Fix all broken routes / dead CTAs

#### Days 15-30: Vault
- [ ] Merge inventory + documents + warranties into `/dashboard/vault` with tabs
- [ ] Implement Quick Capture bar (camera + upload + manual)
- [ ] Wire camera to existing visual inspector + OCR pipeline
- [ ] Build extraction result UI with confidence states
- [ ] Build asset detail drawer (history + docs + warranty + recommendations)
- [ ] Implement Vault empty state with camera onboarding

#### Days 31-45: Resolution Center
- [ ] Rename `/actions` → `/resolution-center`
- [ ] Rebuild item card with full trust metadata
- [ ] Implement 5 journey flow templates
- [ ] Build completion loop with celebration + outcome logging
- [ ] Wire `ReplaceRepairAnalysis` into Repair vs Replace journey
- [ ] Connect provider booking from Resolution Center items

#### Days 46-60: Save + Protect
- [ ] Rebuild `/save` as opportunities dashboard (savings surfaced, ranked)
- [ ] Integrate `HomeSavingsOpportunity`, `RefinanceOpportunity`, `HiddenAssetProgram` into Save
- [ ] Rebuild `/protect` with coverage map, active incidents, risk score, recalls
- [ ] Wire `CoverageAnalysis` + `Warranty` into Vault Coverage tab + Protect
- [ ] Implement coverage gap visualization

#### Days 61-75: Fix + My Home
- [ ] Rebuild `/providers` as Fix section with booking context from Resolution Center
- [ ] Wire quote comparison accessible from Fix
- [ ] Build My Home section with health score, rooms, timeline, digital twin access
- [ ] Connect seller prep as contextual CTA in My Home
- [ ] Build property switcher for multi-property users

#### Days 76-90: Hardening + Launch Readiness
- [ ] Full mobile QA pass (iOS Safari + Android Chrome)
- [ ] Implement full analytics schema (38 events)
- [ ] Auth edge cases: expired tokens, concurrent sessions, MFA flows
- [ ] Performance: LCP measurement, optimize critical path
- [ ] Empty state audit: every section has designed empty state
- [ ] Error handling: every API call has graceful error state
- [ ] External user testing: 5 non-technical homeowners, fix top 3 confusion points
- [ ] Provider portal smoke test
- [ ] Set up north star metric dashboards
- [ ] Final broken-flow audit: click every CTA in the product

---

## Design Standards — Quick Reference

### Visual Language
- **Primary:** Teal `#0d9488` — trust, calm, premium
- **Cards:** soft shadow (`shadow-sm`), `rounded-xl`, breathing room
- **Typography:** Fraunces for hero/display, Poppins for headings, Inter for body
- **Gradients:** subtle teal-to-white in hero sections — calm, not loud
- **Status:** existing risk color system (`risk.low` / `.medium` / `.high` / `.critical`)

### UX Rules
1. One primary CTA per screen — always clear what to do next
2. Never show a spinner where a skeleton can go
3. Empty states are invitation states — never dead ends
4. Every recommendation shows why and shows the cost of delay
5. Celebrate completion — `MilestoneCelebration.tsx` exists, use it
6. Zero jargon in any user-facing string
7. Camera FAB always visible on mobile — it is the product's heartbeat

### Engineering Constraints
- Reuse existing API clients in `src/lib/api/client.ts`
- Trust components go in `src/components/trust/` (new folder)
- Route redirects in `next.config.js` redirects array
- Analytics via existing `ProductAnalyticsEvent` model + analytics hook
- All new flows use React Query patterns (`useQuery` / `useMutation`)
- DB changes: `npx prisma db push` only — no migration scripts

---

*This plan transforms existing CtC depth into a simple, magical product users immediately understand and trust. The backend engines are built. The data models are rich. The work is surfacing that intelligence simply and making every homeowner feel their home is in good hands.*
