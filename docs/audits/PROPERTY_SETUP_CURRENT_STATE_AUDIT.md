# Property Setup Current-State Audit

**Date:** 2026-09-06

**Scope:** Existing homeowner Property Setup, Add Property, trigger-first activation, setup resumption, and the Property Details editor

**Method:** Read-only repository audit using the current implementation, Prisma schema, related requirements, Graphify, and existing tests. No runtime environment was started and no product code, schema, migrations, or tests were changed.

## 1. Executive Summary

ContractToCozy does not have one Property Setup flow. It currently has three overlapping experiences:

1. **Trigger-first activation** at `/onboarding/address` and `/onboarding/confirm`. It asks why the homeowner is here, captures a structured US address and a compact home profile, creates the Property on confirmation, saves entry/buyer context in a second API call, and then presents a first action.
2. **Manual Add Property** at `/dashboard/properties/new`. It is a single, large client-side form with a required basic section and a collapsed “Advanced Details” section. Despite the “optional” label, ownership form, property use, and occupancy status inside Advanced Details are required by client validation. The Property is created only after the entire form is submitted; no draft is saved.
3. **Post-create setup checklist** at `/dashboard/properties/:id/onboarding`. It tracks five activities—details, rooms, inventory, protection, and insights—and links to separate feature pages. Its progress is stored server-side in `PropertyOnboarding`, but it is not a staged Property creation form.

The strongest finding is that the **backend and database are already sparse-property capable**. Prisma requires a homeowner profile and four structured address fields (`address`, `city`, `state`, `zipCode`). `POST /api/properties` requires the same four address fields; nearly all property facts are optional and become `UNKNOWN` or `null`. The long manual form—not the core data model—creates most of the current upfront burden.

The current address capture is a useful starting component, but it is not a durable property-identity layer. Google Places autocomplete is available and manual fallback works, yet the resolved `placeId`, formatted/canonical address, unit/subpremise, county, ZIP+4, and provider coordinates are discarded. Duplicate detection is a same-owner, case-insensitive comparison of the four stored strings. Later “geocoding” resolves only a ZIP centroid through Open-Meteo and labels it `VERIFIED`.

Progressive enrichment is therefore likely an **incremental evolution**, not a Property subsystem rewrite. The existing create schema, `PATCH`/`PUT` endpoint, nullable/`UNKNOWN` model, Property Context platform, `PropertyFactEvidence`, and Property Details editor are reusable. The principal work would be in orchestration, durable address identity, source-aware writes, safe side-effect timing, and consolidating frontend validation—not replacing the Property model.

Important current-state risks are:

- create can commit a Property and later return an error if an awaited post-create operation fails;
- trigger-first creation and entry-context capture are separate requests, so retry can encounter a duplicate after partial success;
- the manual form sends untouched exterior/irrigation/drainage booleans as `false` and the service records them as verified homeowner reports;
- provider-derived lookup values are written through the ordinary create API and recorded as `USER_REPORTED`;
- address identity is insufficient for reliable unit/parcel matching;
- the risk worker persists a `HIGH` “Data Missing” detail when year built or size is absent, even though it suppresses automatic maintenance-task creation;
- setup Step 1 is automatically complete for every valid Property because a complete address satisfies it.

## 2. Current User Journey

### 2.1 Entry points

| Intent | Entry point | Destination | Notes |
|---|---|---|---|
| First Property from dashboard chrome | `PropertySetupBanner` in `apps/frontend/src/components/PropertySetupBanner.tsx` | `/dashboard/properties/new` | Shown outside the dashboard root/new page when the account has zero properties and local `propertySetupSkipped` is not set. Banner dismissal uses a separate local key, `propertyBannerDismissed`. |
| Add another Property | Properties list, `MyPropertiesCard`, property switcher, top command bar, maintenance setup, provider booking fallback | `/dashboard/properties/new` | All use the same long form. |
| Trigger-first/purchase start | `WelcomeModal` and dashboard purchase card | `/onboarding/address` | This is the compact address-first path. It is not the destination used by the ordinary “Add property” controls. |
| Continue setup | `SetupChecklistPanel` / `SetupGuideButton` | `/dashboard/properties/:id/onboarding` | Loads server-side status and current step. |
| Correct details during setup | Checklist Step 1 | `/dashboard/properties/:id/edit?fromOnboarding=1&returnTo=...` | Uses the full Property Details editor. |
| Revisit trigger-first action | `ActivationHandoffBanner` | `/onboarding/first-value?propertyId=...` | Requires persisted entry context. |

No feature flag gates the three primary routes. Worker execution policies can suppress background intelligence jobs, but they do not hide Property creation.

### 2.2 Trigger-first activation journey

#### Screen 1 — `/onboarding/address`

**What the homeowner sees:** situation selection, trigger or buyer context, address autocomplete/manual entry, and “Help us tailor your first checklist” home basics.

**Required:**

- situation: own, buying, new build, or exploring;
- for non-buying paths, an active trigger;
- for buying, purchase stage and inspection status;
- street address, city, two-letter state, five-digit ZIP;
- home type.

**Optional:** trigger detail; target closing date; move-in date; buyer concern; approximate year built; bedrooms; bathrooms; basement; pool/spa. Explicit “I’m not sure” choices preserve unknown for several home facts.

**Defaults:** buyer-stage and inspection defaults are set in local state; basement and pool/spa begin unknown. Address suggestions are debounced for 300 ms and fall back to manual entry when unavailable.

**Validation:** address/city nonempty; state must be two letters; ZIP must be five digits; year built, if supplied, must be an integer from 1700 through current year + 1; bedrooms must be an integer greater than 0 and at most 99; bathrooms must be greater than 0 and at most 99; trigger/buyer branch requirements are enforced before navigation.

**Save/persistence:** no Property is created. The page calls `GET /api/properties/lookup`, reconciles lookup facts only when state and ZIP match the submitted address, then stores the normalized form, lookup result, entry context, and analytics timestamps in the HTTP-only `ctc_onboarding_lookup` cookie through `/api/onboarding-lookup-session`. The cookie is base64url-encoded JSON, `SameSite=Lax`, secure in production, and expires after 15 minutes; it is not signed or encrypted by this route.

**Navigation:** Next pushes `/onboarding/confirm`. Refresh before Next loses ordinary React state. Browser history may retain a browser cache snapshot, but there is no application persistence before the cookie write.

#### Screen 2 — `/onboarding/confirm`

**What the homeowner sees:** resolved address, editable address controls, the compact home profile, lookup-supported facts, and the “Add home and see first action” action.

**Edit:** correcting the address replaces the lookup payload with `addressOnlyPropertyData`, clearing previously resolved property facts rather than carrying them across an address change.

**Refresh/incomplete state:** the page reloads the cookie. Missing or expired session data redirects to `/onboarding/address`.

**Save:**

1. `POST /api/properties` creates the Property with the structured address, home basics, `isPrimary: true`, lookup size, and lookup last-sale data when present.
2. `PUT /api/properties/:id/onboarding/entry-context` saves activation/buyer context.
3. The cookie is deleted, activation analytics are emitted, and the UI redirects after about 1.2 seconds to `/onboarding/first-value?propertyId=...`.

The two writes are not one transaction. If Property creation succeeds but entry-context capture fails, the Property remains. The page reports failure and retains the cookie; retrying the create can then hit duplicate detection. Inside entry-context capture, the `PropertyOnboarding` row is updated before buyer-plan initialization, so buyer initialization failure can likewise leave captured context behind.

#### Screen 3 — `/onboarding/first-value`

The backend returns a bounded action derived from the active trigger, a baseline of supported and missing facts, confidence, and a NOW/SOON/PLAN/CONSIDER plan. Missing year built, size, trigger detail, or affected entity explicitly lowers confidence. Buyer entries also return the initialized Buyer Plan, deadlines, home snapshot, and tailored guidance. This screen marks first-value delivery but does not determine general setup-checklist completion.

`/onboarding/reveal` is a compatibility redirect to `/onboarding/confirm`, not an independent step.

### 2.3 Manual Add Property journey — `/dashboard/properties/new`

This is one page and one in-memory form, visually divided into:

- **Basic Information:** property label, address, home type, year built, primary-home flag, and optional photo.
- **Advanced Details:** ownership/use/occupancy, responsibility, systems, exterior, safety, and appliances.

The page says Advanced Details are optional, but `validateBasicFields()` requires ownership form, property use, and occupancy status. Those controls exist only inside the collapsed Advanced Details section. This makes the visual hierarchy and actual submit contract inconsistent.

**Required by UI:** street address, city, two-character state, five-digit ZIP, home type, ownership form, property use, occupancy status, and a four-digit year built.

**Optional:** everything else. System/appliance years must be four digits when present; system years cannot predate year built. There is no frontend range check for year built and no future-year check for system years. State length is checked but alphabetic content is not. A selected appliance type requires a year.

**Defaults:** `isPrimary=false`; the 12 responsibility scopes are `UNKNOWN`; safety booleans are `null`; irrigation, drainage, and the four exterior-presence booleans are `false`; lists are empty. The “original” system timing helper copies year built into the corresponding install/replacement year; “not sure” leaves no year. These timing answers themselves are local UI state and are not persisted.

**Save:** one `POST /api/properties` occurs after validation. No draft or partial progress is saved. If a photo was selected, document upload and `PATCH` of `coverPhotoDocumentId` occur after successful creation. Photo failure is explicitly treated as partial success and the homeowner is told the Property was saved.

**Skip:** sets browser-local `propertySetupSkipped=true` and navigates to `/dashboard`; no server record or draft is created. **Cancel/back:** returns to the properties area through ordinary navigation. **Refresh/browser back:** unsaved form state is lost. **Incomplete setup:** it remains only in the current browser component until navigation or refresh.

### 2.4 Five-step post-create checklist — `/dashboard/properties/:id/onboarding`

| Step | UI action | Data-based completion rule | Persistence/navigation |
|---|---|---|---|
| 1. Add Property Details | Open full Property editor | `name` exists **or** the complete address tuple exists | Every API-created Property already has the address tuple, so this step starts complete. |
| 2. Create Rooms | Open rooms | At least one `InventoryRoom` | Return query parameters route back to onboarding. |
| 3. Add Inventory | Open inventory | At least one `InventoryItem` | Same. |
| 4. Activate Protection | Open incidents | Climate notifications enabled or at least one maintenance task | Same. |
| 5. Generate Insights | Open risk assessment | At least one `HomeReportExport` | The Step 5 “mark complete” control can manually complete the step; it does not itself generate a report. |

Next, Back, and timeline clicks call `POST .../set-step`, so current position survives refresh. `POST .../complete-step` sets a manual flag; `POST .../skip` persists `SKIPPED` and returns to the Property; `POST .../finish` force-sets all five manual flags, although the UI normally enables Finish only after all steps appear complete. Status is calculated each time and score is `20 × completed steps`.

The checklist also contains a separately editable journey ownership state. It is context for Ask/feature routing, not a household permission or legal-ownership change.

The service-level checklist access query only accepts the owning homeowner profile, even though route middleware recognizes household access. That can produce a route/service authorization mismatch for contributors or viewers.

## 3. Architecture Flow

```text
Homeowner
  |
  +-- trigger-first: /onboarding/address -> /onboarding/confirm
  |      | AddressAutocomplete + local state + 15-minute HTTP-only cookie
  |      | api.createProperty() + api.captureEntryContext()
  |
  +-- manual add: /dashboard/properties/new
  |      | one React useState form
  |      | api.createProperty()
  |
  +-- post-create: /dashboard/properties/:id/onboarding
         | React Query + onboardingApi.ts
         | edit/rooms/inventory/incidents/risk-assessment feature pages
         v
POST /api/properties
  property.routes.ts -> validateBody(createPropertySchema)
  -> property.controller.ts:createProperty
  -> property.service.ts:createProperty (direct Prisma; no repository layer)
         |
         +-- Property + HouseholdMember + PropertyFactEvidence
         +-- optional PropertyExteriorProfile / PropertyResponsibility rows
         +-- optional PropertyFinancingProfile / appliance inventory sync
         v
  habit generation, seasonal reconciliation, radar reconciliation,
  property-intelligence queue, health-score projection, analytics

PUT /api/properties/:id/onboarding/entry-context
  propertyOnboarding.routes.ts -> entryContext.service.ts:captureEntryContext
  -> PropertyOnboarding -> optional HomeBuyerChecklist initialization

PUT/PATCH /api/properties/:id
  validateBody(updatePropertySchema = createPropertySchema.partial())
  -> property.service.ts:updateProperty -> typed Property domains + evidence
  -> downstream reconciliations/jobs
```

Primary implementation references:

- Frontend: `apps/frontend/src/app/onboarding/address/page.tsx`, `confirm/page.tsx`, `first-value/page.tsx`, `app/(dashboard)/dashboard/properties/new/page.tsx`, `[id]/onboarding/*`, `[id]/edit/page.tsx`.
- Shared frontend: `components/property/AddressAutocomplete.tsx`, `PropertyOwnershipResponsibilitySection.tsx`, `lib/property/propertyContextForm.ts`, `lib/api/client.ts`, `lib/api/onboardingApi.ts`.
- Backend: `routes/property.routes.ts`, `controllers/property.controller.ts`, `services/property.service.ts`, `utils/validators.ts`, `routes/propertyOnboarding.routes.ts`, `services/propertyOnboarding.service.ts`, `services/entryContext.service.ts`.
- Data: `apps/backend/prisma/schema.prisma` models `Property`, `PropertyExteriorProfile`, `PropertyResponsibility`, `PropertyFactEvidence`, `PropertyContextCaptureReceipt`, `PropertyOnboarding`, `PropertyFinancingProfile`, and inventory models.
- Jobs/consumers: `services/JobQueue.service.ts`, `services/RiskAssessment.service.ts`, `services/homeHabitCoach/*`, `services/seasonalChecklist.service.ts`, Home Event Radar reconciliation, and `apps/workers/src/lib/propertyGeo.ts`.

## 4. Property Input Inventory

Legend: **T** = trigger-first activation; **M** = manual Add Property; **E** = edit screen reachable from onboarding. “Required” describes the surface, not the backend.

### 4.1 Activation and identity inputs

| Field | UI label | Surface / required | DB field | API field | Validation | Used by |
|---|---|---|---|---|---|---|
| situation | “What brings you here?” | T / yes | Derived into `PropertyOnboarding.entryPath`, `ownershipState`, `propertyOrigin` | entry-context fields | Enum branch | First-value policy; Buyer Plan/new-home branch; analytics |
| active trigger type | Trigger choice | T non-buyer / yes | `activeTriggerType` | `activeTrigger.type` | Allowed trigger enum and entry-path rules | First action, CTA destination, materiality/safety tier, analytics |
| trigger detail | “Tell us a little more” | T / no | `activeTriggerDetail` | `activeTrigger.detail` | Trim, max 2,000 | First-value evidence, assumptions, confidence |
| purchase stage | Buyer stage | T buyer / yes | Buyer stage in `entrySourceMetadata`; initialized Buyer Plan stage | `buyer.purchaseStage` | Exploring/offer made/under contract; must agree with ownership state | Buyer checklist initialization and first-value plan |
| target close date | Target closing date | T buyer / no | Buyer checklist milestone/plan | `buyer.targetCloseDate` | ISO datetime server-side | Buyer deadlines and prioritization |
| move-in date | Move-in date | T buyer / no | Buyer checklist/plan | `buyer.moveInDate` | ISO datetime server-side | Buyer deadlines and handoff |
| inspection status | Inspection status | T buyer / yes | Buyer milestone; also entry metadata | `buyer.inspectionStatus` | Enum | Buyer evidence readiness |
| immediate concern | “What concerns you most?” | T buyer / no | Entry metadata / initialized plan context | `buyer.immediateConcern` | Max 2,000 | Buyer initialization and context |
| property label/name | “Property Label” / “Home nickname” | M,E / no | `Property.name` | `name` | Backend max 100 | Display/navigation; checklist Step 1 alternative |
| street address | “Street Address” | T,M,E / yes | `Property.address` | `address` | Nonempty; autocomplete or manual | Core identity, display, permits/tax/provider queries, duplicate check |
| city | City | T,M,E / yes | `Property.city` | `city` | Nonempty | Identity, jurisdiction, environment, assessor/permit/provider queries |
| state | State | T,M,E / yes | `Property.state` | `state` | Backend exactly two characters; trigger-first requires two letters | Identity, jurisdiction and state policy |
| ZIP | ZIP / ZIP Code | T,M,E / yes | `Property.zipCode`, `normalizedZipCode` | `zipCode` | Five digits | Identity, ZIP geocoding, weather/radar, duplicate check |
| primary home | “This is my primary residence” / “Set as main home” | M,E / no | `Property.isPrimary` | `isPrimary` | Boolean | Default property selection/navigation; create unsets other primary rows |
| property photo | Property Photo | M,E / no | `coverPhotoDocumentId` -> `Document` | separate upload then `coverPhotoDocumentId` update | JPEG/PNG/WebP/HEIC/HEIF; max 10 MB | Property cards/record presentation |

### 4.2 Core, structure, and system inputs

| Field | UI label | Surface / required | DB field | API field | Validation | Used by |
|---|---|---|---|---|---|---|
| dwelling type | Home type | T,M,E / T+M yes | `Property.dwellingType` | `dwellingType` | Enum incl. `UNKNOWN` | Applicability, health/risk, property context, buyer guidance, personalization |
| ownership form | “How is this home owned?” | M yes (inside “optional” Advanced), E | `ownershipForm` | `ownershipForm` | Enum incl. `UNKNOWN` | Responsibility/applicability and context |
| property use | “How do you use this home?” | M yes (inside Advanced), E | `propertyUse` | `propertyUse` | Enum incl. `UNKNOWN` | Applicability, financial/seller/buyer context |
| occupancy status | “Who lives here now?” | M yes (inside Advanced), E | `occupancyStatus` | `occupancyStatus` | Enum incl. `UNKNOWN` | Applicability, planning, household-facing guidance |
| year built | Approximate Year Built / Year Built | T no; M yes; E no | `yearBuilt` | `yearBuilt` | Backend integer >=1700; T max current+1; M only 4 digits | Risk full-calculation gate, health score, lifecycle age, buyer guidance, many reports |
| property size | Approx. size / Property Size | M,E / no | `propertySize` | `propertySize` | Positive integer | Risk full-calculation gate, score and cost/usage assumptions |
| bedrooms | Bedrooms | T,E / no | `bedrooms` | `bedrooms` | Backend integer >=0; T 1–99 | Buyer snapshot, context/personalization and record display |
| bathrooms | Bathrooms | T,E / no | `bathrooms` | `bathrooms` | Backend number >=0; T >0–99 | Buyer snapshot, context/personalization and record display |
| foundation | Foundation | E / no | `foundationType` | `foundationType` | Enum | Structure/risk/context and renovation logic |
| basement | Basement | T,E / no | `basementConfiguration` | `basementConfiguration` | Enum incl. `UNKNOWN` | Foundation inference, buyer inspection guidance, context |
| siding/exterior | Siding / exterior | E / no | `sidingType` | `sidingType` | Max 100 | Structure record and context; limited direct decision use found |
| electrical panel age | Electrical panel age | E / no | `electricalPanelAge` | `electricalPanelAge` | Nonnegative frontend; positive backend | Property context/structure and risk-adjacent display |
| heating type | Heating Type / Heating | M,E / M no, E effectively required | `heatingType` | `heatingType` | Enum; edit rejects empty | Health score, risk/applicability, energy/weather/personalization |
| cooling type | Cooling Type / Cooling | M,E / M no, E effectively required | `coolingType` | `coolingType` | Enum; edit rejects empty | Health score, heat/weather/environment guidance |
| water-heater type | Water Heater Type / Type | M,E / M no, E effectively required | `waterHeaterType` | `waterHeaterType` | Enum; edit rejects empty | Health/risk, energy, maintenance, savings |
| roof type | Roof Type / Material | M,E / M no, E effectively required | `roofType` | `roofType` | Enum; edit rejects empty | Health/risk, weather, maintenance, insurance/renovation |
| HVAC timing answer | Original / replaced / not sure | M / no | Not stored directly | Not sent directly | Original copies year built; replaced exposes year | UI helper only; resulting year is consumed |
| HVAC install year | Installed | M,E / no | `hvacInstallYear` | `hvacInstallYear` | Backend >=1700; M 4 digits and >= year built; E >=1900 | Health/risk lifecycle, weather, maintenance |
| water-heater timing answer | Original / replaced / not sure | M / no | Not stored directly | Not sent directly | Same | UI helper only |
| water-heater install year | Installed | M,E / no | `waterHeaterInstallYear` | `waterHeaterInstallYear` | Same divergence as HVAC | Health/risk lifecycle, maintenance, savings |
| roof timing answer | Original / replaced / not sure | M / no | Not stored directly | Not sent directly | Same | UI helper only |
| roof install/replacement year | Installed | M,E / no | `roofReplacementYear` | `roofReplacementYear` | Same divergence as HVAC | Health/risk lifecycle, weather, maintenance, savings |
| appliance type | Appliance | M,E / no | Canonical appliance `InventoryItem.assetType` projection | `majorAppliances[].type` | Allowlisted UI choices; backend nonempty string | Inventory, health score, risk and maintenance |
| appliance purchase/install year | Purchase Year | M,E / required if type chosen | Inventory installation year | `majorAppliances[].installYear` | M four digits; backend integer >=1900 | Appliance age, health/risk/lifecycle |

### 4.3 Responsibility, exterior, safety, and location-context inputs

| Field | UI label | Surface / required | DB field | API field | Validation/default | Used by |
|---|---|---|---|---|---|---|
| responsibility preset | “Who takes care of most maintenance?” | M,E / no | Expands to 12 `PropertyResponsibility` rows | `responsibilities[]` | OWNER/ASSOCIATION/LANDLORD/SHARED; M begins all UNKNOWN | Convenience input; applicability and owner-action suppression |
| responsibility exceptions | Roof; building exterior; landscaping; trees & shrubs; driveway & walkways; deck/patio/balcony; plumbing; central HVAC; common-area safety; snow & ice; pest control; shared systems | M,E / no | One row per scope | `{scope, party, notes?}` | Five parties incl. UNKNOWN; max 12 | Seasonal, risk, coverage/guidance, maintenance and feature applicability |
| private outdoor space | Private outdoor space | M,E / no | `PropertyExteriorProfile.hasPrivateOutdoorSpace` | `exteriorProfile.hasPrivateOutdoorSpace` | M default false; E tri-state | Exterior/gardening/seasonal applicability |
| outdoor space types | Outdoor-space choices | M,E / no | `outdoorSpaceTypes[]` | same | Cleared unless private space true | Exterior/gardening applicability and context |
| lawn | Lawn | M,E / no | `hasLawn` | same | M default false; E tri-state | Lawn/seasonal applicability |
| trees/shrubs | Trees or shrubs | M,E / no | `hasTreesOrShrubs` | same | M default false; E tri-state | Tree/yard/seasonal applicability |
| driveway | Driveway | M,E / no | `hasDriveway` | same | M default false; E tri-state | Snow/ice and exterior applicability |
| fence | Fence | E / no | `hasFence` | same | Tri-state | Exterior/property context; limited direct usage |
| pool/spa | Pool or spa | T,E / no | `hasPoolOrSpa` | same | T explicit unknown/yes/no; E tri-state | Buyer inspection personalization and exterior applicability |
| outdoor faucets | Outdoor faucets | E / no | `hasOutdoorFaucets` | same | Tri-state | Freeze/seasonal applicability |
| lot size | Lot size | E / no | `PropertyExteriorProfile.lotSizeSqFt` | `exteriorProfile.lotSizeSqFt` | Positive | Exterior/yard context; potential records enrichment |
| irrigation | Has Irrigation System | M,E / no | Property and exterior profile fields | `hasIrrigation` and exterior copy | M default false; E tri-state | Health score, seasonal/exterior and savings applicability |
| drainage issues | Has Drainage Issues | M,E / no | Property and exterior profile fields | `hasDrainageIssues` and exterior copy | M default false; E tri-state | Health score, weather/risk/incident logic |
| smoke detectors | Smoke detectors | M,E / no | `hasSmokeDetectors` | same | Yes/no/not sure | Health score, safety context |
| CO detectors | CO detectors | M,E / no | `hasCoDetectors` | same | Yes/no/not sure | Health score, safety context |
| security system | Security system | M,E / no | `hasSecuritySystem` | same | Yes/no/not sure | Health score and protection context |
| fire extinguisher | Fire extinguisher | M,E / no | `hasFireExtinguisher` | same | Yes/no/not sure | Health score and safety context |
| timezone | Property timezone | E / no | `timezone` | `timezone` | Valid IANA timezone or null | Scheduled/local-time experiences and context |
| electric utility provider | Electric utility provider | E / no | `utilityProvider` | same | Optional string | Hidden Savings/Benefits and utility context |
| gas provider | Gas utility provider | E / no | `gasProvider` | same | Optional string | Savings/utility context |
| historic district | Historic district question | E / no | `inHistoricDistrict` | same | Tri-state | Permits, renovation/compliance, hidden benefits |
| historic registry status | Registry status | E / no | `historicRegistryStatus` | same | Optional string | Compliance and benefits evidence/context |
| hurricane zone | Hurricane-zone question | E / no | `inHurricaneZone` | same | Tri-state | Hazard/protection/savings context |
| flood zone | Flood-zone question | E / no | `inFloodZone` | same | Tri-state | Hazard/protection/savings context |
| wildfire zone | Wildfire-zone question | E / no | `inWildfireZone` | same | Tri-state | Hazard/protection/savings context |
| coastal | Coastal question | E / no | `isCoastal` | same | Tri-state | Hazard/protection/savings context |

### 4.4 Financial inputs available during onboarding-linked editing

| Field | UI label | Surface / required | DB field | API field | Validation | Used by |
|---|---|---|---|---|---|---|
| purchase price | Purchase price (USD) | E; T may auto-fill from lookup / no | `PropertyFinancingProfile.purchasePriceCents` | `purchasePriceCents` | Nonnegative | Equity, ownership-cost and financial tools |
| purchase date | Purchase date | E; T may auto-fill from lookup / no | `PropertyFinancingProfile.purchaseDate` | `purchaseDate` | Date | Equity and lifecycle timing |
| latest appraisal | Latest appraisal (USD) | E / no | `Property.lastAppraisedValue` | `lastAppraisedValue` | Nonnegative | Equity/financial tools |
| appraisal date | Appraisal date | E / no | `lastAppraisalDate` | same | Date | Freshness of valuation context |

Insurance, warranty, HOA, mortgage terms, rooms, and inventory details are not fields in either create form. They are collected in their own downstream workspaces/checklist steps.

## 5. Field Classification

| Category | Current inputs |
|---|---|
| **A — Identity** | Street address, city, state, ZIP. `isPrimary` affects account selection but not physical identity. |
| **B — Potentially auto-discoverable** | Dwelling type, year built, property size, bedrooms, bathrooms, basement/foundation, lot size, siding, pool, last sale price/date, some appraisal/assessment facts, and sometimes parcel-level exterior facts. Availability and reliability vary by jurisdiction and unit. |
| **C — Homeowner knowledge** | Ownership form, current property use, occupancy, responsibility parties, system replacement/install years, actual installed equipment, appliance inventory and purchase/install years, safety equipment, drainage condition, outdoor features that records cannot reliably prove current, utility providers, and correction/confirmation of provider facts. Trigger, concern, purchase stage, inspection status, and journey state are also homeowner context. |
| **D — Derived** | Entry path/property origin/ownership state derived from situation; system age and property age derived from years; normalized ZIP; health/completeness scores; the manual form’s “original system” helper derives install year from year built. A future source should not ask for ages when an authoritative date/year exists. |
| **E — Administrative** | Property nickname, primary-home selection, photo, timezone, entry source/analytics metadata. They are useful but not prerequisites for physical identification. |
| **F — Questionable at initial setup** | Siding type, electrical panel age, fence, security system, fire extinguisher, all 12 responsibility exceptions, and a full major-appliance list have downstream representation but weak evidence that they must be asked before initial value. The three system timing helper answers are not persisted independently. Historic registry free text is specialized. This classification concerns placement in setup, not whether the fields should exist. |

The highest-confidence candidates for automated lookup are the standard assessor/listing facts: dwelling type, year built, square footage, bedrooms, bathrooms, lot size, last sale price/date, and some foundation/basement attributes. C2C should still treat provider availability and unit/parcel ambiguity as unresolved current-state constraints; this audit does not select a provider.

## 6. Field Usage Analysis

### 6.1 Critical

- **Address tuple:** Property identity, display, duplicate detection, jurisdiction/provider queries, and geographic features.
- **Dwelling type, ownership form, property use, occupancy, responsibilities:** determine applicability and prevent association/landlord work from becoming homeowner action.
- **Year built and property size:** required for the full risk calculation and heavily used by health/lifecycle/cost logic.
- **System types and install/replacement years:** health score, risk, maintenance, energy, weather, savings, and lifecycle calculations.
- **Drainage/irrigation and selected exterior applicability facts:** suppress or enable weather, yard, seasonal, and exterior guidance.
- **Appliance identity/year:** canonical inventory projection, appliance health, risk, and maintenance.
- **Trigger/buyer context and dates:** materially determine first value and Buyer Plan initialization.
- **Purchase/appraisal facts:** material for equity and financial workflows, though not for Property creation.

### 6.2 Useful

- Name/photo/primary designation improve navigation and presentation.
- Bedrooms, bathrooms, basement, pool/spa tailor buyer guidance and property context.
- Safety booleans affect score/protection guidance.
- Timezone, utility providers, historic/hazard flags, foundation and siding enrich specialized scheduling, compliance, risk, and benefits workflows.
- Exterior types, lawn, trees, driveway, fence, faucets, and lot size improve applicability.

### 6.3 Stored only or weakly consumed

- The **system timing answer** (`ORIGINAL`, `REPLACED`, `UNKNOWN`) is not stored; only the resulting year is sent.
- `sidingType` and `electricalPanelAge` participate in the canonical context/record but have relatively little direct downstream decision use compared with their capture cost.
- `hasFence`, `hasSecuritySystem`, `hasFireExtinguisher`, and historic-registry free text have narrower use than core risk/applicability facts.
- The frontend’s `addressSource` (autocomplete/manual/lookup) is stored only in the short-lived onboarding session/source metadata and analytics, not as provenance on the address fact.

No create-form field was proven wholly unused: even low-value fields tend to appear in Property Context, record display, health scoring, or specialized features. The more important finding is **timing**: several useful fields do not justify blocking initial creation.

## 7. Address Architecture

### Capture and autocomplete

Both create surfaces reuse `AddressAutocomplete`. After three characters it calls authenticated backend routes:

- `GET /api/properties/address-suggestions`
- `GET /api/properties/address-details`

The backend uses Google Places v1 when `GOOGLE_MAPS_API_KEY` is configured, restricts suggestions to US street address/premise/subpremise types, and uses a Places session token. If configuration or a request fails, manual entry remains enabled.

The details resolver requests only `addressComponents` and returns:

```ts
{ address: streetNumber + route, city, state, zipCode }
```

It discards `placeId`, formatted address, subpremise/unit, county, country, provider coordinates, and all other components. It accepts only a five-digit ZIP.

### Validation and normalization

- Backend: nonempty address/city, state length two, ZIP exactly five digits.
- Trigger-first frontend is stricter on alphabetic state and normalizes case/trim.
- Manual frontend checks state length but not letters.
- Service uppercases state and normalizes ZIP; it does not trim the stored street/city strings even though duplicate lookup uses trimmed input.
- There is no canonical-address column, address-line/unit model, or durable provider identifier.

### Geocoding and geographic identity

`Property` contains latitude, longitude, normalized/geocoded ZIP, county/FIPS, geocoding status/provider/version/time, and a PostGIS point. The active worker path in `apps/workers/src/lib/propertyGeo.ts` geocodes **the ZIP**, not the street address, through Open-Meteo and stores the ZIP centroid. The result is marked `VERIFIED`, which means the provider call succeeded—not that the coordinates identify the parcel.

County/FIPS fields exist but are not populated by Places resolution or Property creation. Parcel/APN identity exists in the separate Property Tax subsystem (`PropertyTaxParcelMatch`) with reviewed source/match/confidence concepts, but it is not part of core Property identity or onboarding.

### Duplicate detection

Create checks the same owner for case-insensitive trimmed address/city/state plus exact trimmed ZIP. There is no database unique constraint, unit identifier, place ID, parcel ID, or canonicalization. Concurrent creates, abbreviations (`Street` vs `St`), punctuation, whitespace already stored, and multi-unit addresses can evade or falsely trigger the check. Address update does not repeat duplicate detection.

### Explicit answer

**No. The existing captured address cannot yet be passed reliably to a future property-data provider without extending address handling.** It can support a best-effort lookup today, but reliable enrichment requires at least preserving provider identity/components, handling unit/subpremise and ZIP variants, clarifying canonical versus homeowner display address, and applying a stronger match strategy. The current four strings need not be removed, but they are not sufficient as the sole durable identity.

## 8. Property Creation Requirements

### Database constraints

`Property` requires:

- generated `id`;
- `homeownerProfileId` relation;
- `address`;
- `city`;
- `state`;
- `zipCode`.

Core classification defaults are `UNKNOWN`; geocoding defaults to `PENDING`; almost all structural, systems, safety, exterior, financial, and location-enrichment fields are nullable. Raw Prisma default for `isPrimary` is `true`, but the service explicitly writes `data.isPrimary || false`, so API omission produces `false`.

### API constraints

`createPropertySchema` requires only `address`, `city`, `state`, and a five-digit `zipCode`. Authentication and an existing `HomeownerProfile` are also operational prerequisites. Every other property field is optional. The service creates an owner `HouseholdMember` atomically with the Property.

### Service/business rules

- reject a same-owner duplicate matching the four normalized-ish address strings;
- if `isPrimary=true`, unset other primaries before create (not in the create transaction);
- normalize ZIP, uppercase state, default classifications to `UNKNOWN`, and set missing facts to null;
- enqueue/reconcile downstream behavior after the row exists.

### UI-only requirements

- Trigger-first also requires home type plus situation/trigger or buyer context.
- Manual Add Property additionally requires home type, ownership form, property use, occupancy status, and four-digit year built.
- The Property Details editor requires nonempty heating, cooling, water-heater, and roof types even though backend update and database fields permit null.

### Can C2C create a valid Property using only a normalized address?

If “normalized address” means the current structured tuple—street, city, two-letter state, five-digit ZIP—**yes**. The present POST endpoint and schema can create it with all other property facts unknown. If it means one free-form address string, **no**: the API and database require the four separate fields. The main blockers to an address-only UI are frontend requirements and side-effect quality, not Prisma nullability.

## 9. Downstream Dependencies

| Side effect | Timing/failure behavior | Property facts expected | Sparse-property behavior |
|---|---|---|---|
| Property, owner ACL, exterior/responsibility rows, fact evidence | Core Prisma create | Address required; all other inputs optional | Safe at database level |
| Financing profile upsert | Awaited after Property commit | Purchase price/date if present | Omitted when unknown; failure can leave Property committed |
| Cover-photo resolution | Awaited after commit | Photo document | Optional; failure can leave Property committed |
| `PROPERTY_CREATED` analytics | Synchronous emitter call | State, dwelling type, year built metadata | Unknown/null represented |
| Initial habit generation | Fire-and-forget | CORE/LOCATION/STRUCTURE/EXTERIOR/RESPONSIBILITY/SYSTEMS/SAFETY context | Context policies generally fail closed on unknown; errors logged |
| Appliance inventory sync | Awaited when payload supplied | Appliance type/year | Omitted safely; failure occurs after Property commit |
| Current seasonal checklist reconciliation | Awaited wrapper, internally catches/logs | location, dwelling, exterior, responsibility, systems | Unknown applicability is designed to fail closed/defer |
| Home Event Radar reconciliation request | Awaited | location/geography and relevant facts | Can proceed from address/ZIP; downstream precision limited to ZIP centroid until better data |
| Property-intelligence queue | Awaited enqueue, policy can skip without error | risk, hidden assets, existing digital twin | Risk/hidden-assets jobs queued; twin refresh is no-op if no twin |
| Risk report worker | Background | full calculation requires year built and property size; also systems/inventory/responsibility | Persists zero-score report with `HIGH` “Data Missing”; suppresses automatic maintenance tasks while basics missing |
| Health-score attachment | Awaited before API response and on reads | many property/system/safety/exterior/appliance/document facts | Missing facts become missing-data/zero unlocks; calculation errors fall back to “CRASHED” zero score |
| Neighborhood radar recompute | Controller fire-and-forget | usable geography | Deferred/limited without coordinates |
| Trigger entry context and buyer initialization | Separate request after create | Property id plus activation context | Missing call leaves a normal Property without activation context; first-value GET returns 409 |

There are no automatic warranties, insurance policies, HOA records, rooms, or generic inventory records created merely because a Property was created. The post-create checklist measures these separate domains.

## 10. Partial Data Readiness

### What is safe today

- Prisma explicitly models most unknowns as `null` and core classification unknowns as `UNKNOWN`.
- `updatePropertySchema` is partial, and Property Context represents `KNOWN`, `UNKNOWN`, `CONFLICTED`, and `STALE` states.
- Feature applicability policies in seasonal, maintenance, environment, protection, planning, home habits, and related modules are designed to return unknown/fail closed rather than infer presence.
- Health scoring exposes missing factors instead of filling arbitrary ages or sizes.
- Trigger-first value reports missing facts and lowers confidence.
- Property Details can fill most missing fields later, and updates trigger targeted recalculation/reconciliation.

### Current risks

1. **Manual false defaults:** untouched `hasIrrigation`, `hasDrainageIssues`, `hasPrivateOutdoorSpace`, `hasLawn`, `hasTreesOrShrubs`, and `hasDriveway` are submitted as `false`. This converts “not answered” into “confirmed absent” and creates `USER_REPORTED` evidence for the exterior payload.
2. **Risk severity semantics:** missing year built/size creates a persisted `HIGH` detail with probability 1 and a “complete property details” CTA. No maintenance task is created, but dashboards/aggregators can still misread the high-severity record.
3. **Edit-page blockers:** an address-first Property can be valid with null system types, but the current editor refuses save until heating, cooling, water-heater, and roof type are selected.
4. **Inconsistent validation:** create UI, edit UI, backend Zod, and Prisma use different year/state rules.
5. **Post-commit failures:** API failure does not reliably mean the Property was not created, complicating retries and progressive orchestration.
6. **ZIP-centroid confidence:** geography is useful for regional weather but not parcel-level conclusions; `VERIFIED` can be over-interpreted.
7. **Checklist semantics:** a sparse address-only Property immediately satisfies “Add Property Details,” so setup completion does not measure fact readiness.

Overall, the model is **structurally ready for partial data**, but current write defaults, a few consumer semantics, and UI validation are not fully trust-safe for a deliberately sparse onboarding strategy.

## 11. Data Provenance Readiness

### Existing foundations

`PropertyFactEvidence` records:

- fact key;
- source type;
- observation state;
- source entity type/id;
- confidence;
- observed/valid/verified/superseded timestamps.

The Property Context module combines typed canonical values with evidence and supports known/unknown/conflicted/stale semantics. `PropertyContextCaptureReceipt` adds idempotency and audit receipts for just-in-time fact capture. Tax, radar, document-intake, and other specialist domains also contain provider/source/version/match-confidence patterns.

### Gaps in current create/update paths

- `property.service.ts` marks every captured create/update fact as `USER_REPORTED`, confidence `0.9`, immediately verified—even when trigger-first obtained it from the lookup response.
- Street address itself is not in `capturedFactKeys`; city/state/ZIP are. Thus address-source provenance is incomplete.
- `hvacInstallYear` and `waterHeaterInstallYear` are not included in `capturedFactKeys`; roof replacement year is. Utility, hazard, finance, and appliance writes also do not receive equivalent core fact evidence through this helper.
- Core typed fields do not carry source metadata on the column; consumers must use the context/evidence layer.
- The onboarding cookie’s `addressSource` and lookup metadata do not become durable fact-level provenance.
- There is no current generic external-enrichment write path with source-specific conflict/confirmation behavior.

Therefore: **C2C has meaningful provenance infrastructure, but current Property creation does not preserve correct source attribution for an external property-data flow.** This is an extension gap, not an absence of foundations.

## 12. Existing Reusable Infrastructure

| Capability | Current state | Reuse relevance |
|---|---|---|
| Google Places autocomplete | Live adapter with authenticated suggestion/detail routes and manual fallback | Reusable UI/API boundary, but resolved contract must retain identity/components |
| External Property Data service | Interface and `/lookup` route exist | Useful seam; RentCast method is a placeholder that always returns null |
| Sparse Property create | Four address fields required; remaining facts optional | Strong reuse candidate |
| Partial Property update | PUT/PATCH with `createPropertySchema.partial()` | Strong progressive-enrichment foundation |
| Property Context platform | Typed scopes, fact catalog, evidence, unknown/conflict/stale states, JIT capture | Strong trust/applicability foundation |
| Property Details editor | Broad correction surface and update wiring | Reusable correction destination after validation decoupling |
| Exterior/responsibility typed domains | One-to-one exterior profile and per-scope responsibilities | Reusable; no need to flatten into Property |
| Background recalculation | Update service queues intelligence and reconciles seasonal/radar/weather/savings | Reusable, but batching/idempotency/failure semantics matter |
| ZIP geocoding/Open-Meteo | Regional coordinates for weather jobs | Reusable only for regional geography, not address/parcel identity |
| Property Tax parcel matching | Source, parcel, confidence, match method, homeowner-confirmation concepts | Potentially reusable patterns; currently isolated from core identity |
| Socrata assessor/permit adapters | Reviewed jurisdiction-specific open-data infrastructure | Reusable for covered jurisdictions, not a universal onboarding lookup |
| Seller public comps provider | Safe empty-state adapter | Present but currently returns unavailable/no public comps |
| Analytics/entry context | Trigger lineage and first-value measurement | Reusable; analytics definitions will need to distinguish creation from enrichment readiness |

No working ATTOM, Zillow, Redfin, Regrid, MLS, or RentCast property-profile integration was found. Mentions outside the adapters above are comments, prompts, provider-neutral interfaces, or specialized feature logic—not a reusable live enrichment provider.

## 13. Frontend Coupling

The manual Add Property page is a large one-component form whose state closely mirrors backend fields. It uses local `useState`, performs bespoke validation, builds the service payload directly, and sequences photo upload itself. Basic and Advanced are presentation sections, not independently persisted steps.

Coupling findings:

- requiredness is largely client-side and diverges from backend/Prisma;
- default UI values become payload facts, especially false booleans;
- the frontend `api.createProperty` TypeScript input advertises a narrower shape than the object actually sent;
- create and edit use different form libraries and different validation rules;
- `AddressAutocomplete`, dwelling constants, ownership/responsibility component, responsibility mappings, and outdoor normalization are shared;
- edit does not reuse autocomplete;
- trigger-first duplicates compact home-profile fields in both address and confirmation pages;
- setup checklist steps are decoupled links, not reusable form sections;
- hiding long-form fields would generally not require backend or schema changes, but the page’s progress/validation/payload code is centralized and must be changed together.

The smallest future frontend change surface is the two create-route experiences, shared address contract, and create API typing/validation. The post-create checklist and editor can remain destinations if their completion/requiredness semantics are corrected. No evidence supports rewriting every Property Details section.

## 14. Backend Coupling

### Endpoints

- `POST /api/properties`: create via `createPropertySchema` and `property.service.createProperty`.
- `PUT /api/properties/:id` and `PATCH /api/properties/:id`: both use `updatePropertySchema = createPropertySchema.partial()` and the same update service.
- `GET /api/properties/lookup`: provider-neutral lookup boundary, currently no real result.
- `GET /api/properties/address-suggestions` and `/address-details`: Google Places boundary.
- `/api/properties/:id/onboarding/*`: checklist and trigger/buyer context.

### Coupling assessment

The API does **not** fundamentally assume one-time complete creation. It already supports sparse create and broad partial update. Service logic also has targeted relevant-field sets to trigger radar, weather, savings, seasonal, risk, and digital-twin work after correction.

The coupling is primarily operational:

- direct Prisma access in a large service; there is no repository abstraction;
- creation bundles core insert with multiple post-commit operations;
- source attribution is hard-coded to user-reported;
- repeated enrichment updates can enqueue expensive/redundant work;
- duplicate identity is string-based;
- primary-switch and create are not one transaction;
- controller maps most create failures to HTTP 400, including downstream failures after commit.

**Conclusion:** progressive enrichment is supportable with minor-to-moderate backend extensions. It does not require a new Property API or complete-object rewrite, but safe orchestration and source-aware updates are necessary.

## 15. Property Setup vs Property Details

Today the concepts overlap:

- the long Add Property form attempts to populate a large part of the Property model up front;
- checklist Step 1 delegates to the same full editor used later;
- Property Details owns many facts that Add Property does not ask (timezone, hazards, utilities, finance, foundation, broader exterior data);
- both create and edit call the same backend field schema/service family;
- shared ownership/responsibility and property-context helpers exist, but validation and form state are duplicated.

The architecture can support conceptual separation without splitting the database model:

- **Setup** can remain creation plus entry context;
- **continuous intelligence** can write typed canonical Property/exterior/responsibility/inventory domains through partial updates and context capture;
- **Details** can remain the inspection/correction surface.

Difficulty is moderate. The major work is clarifying front-end ownership and requiredness, provenance-aware writes, and readiness semantics. The typed backend domains already support the separation.

## 16. Minimal-Change Assessment

| Classification | Current element | Evidence-based assessment |
|---|---|---|
| **REUSE** | `POST /api/properties` sparse core; Prisma `UNKNOWN`/nullable fields | Already accepts address tuple plus unknowns |
| **REUSE** | `PATCH`/`PUT /api/properties/:id` | Already partial and triggers downstream re-evaluation |
| **REUSE** | Property Context and fact catalog | Already models unknown/conflict/stale and feature requirements |
| **REUSE** | Exterior/responsibility/inventory typed models | Preserve domain ownership |
| **REUSE** | Manual address fallback and Google suggestion UX | Good resilience and accessible combobox behavior |
| **EXTEND** | Resolved address DTO/storage | Preserve place ID, units, canonical/display address, county and coordinates/match metadata |
| **EXTEND** | `ExternalPropertyDataService` and lookup route | Implement a provider-neutral, source-aware result later; current method is stubbed |
| **EXTEND** | Fact evidence writes | Accept real source/confidence/verification and cover missing fact keys |
| **EXTEND** | Creation idempotency/response | Make retries distinguish an already-created Property from failure after commit |
| **EXTEND** | Background job scheduling | Defer/batch field-dependent intelligence until prerequisites change |
| **REFACTOR** | `/dashboard/properties/new` component | Separate minimum create state from optional details; remove hidden requiredness and false defaults |
| **REFACTOR** | Duplicated create/edit/trigger validation | Align common contracts without rebuilding the editor |
| **REFACTOR** | Setup completion rules | Replace address-equals-details semantics with truthful readiness/activity semantics in a future requirements phase |
| **NEW** | Durable enrichment orchestration/status | No current job/state coordinates provider lookup, review, conflicts, and retries |
| **NEW** | Reliable core property identity | No durable place/unit/parcel/canonical address strategy today |
| **AVOID** | Replacing the Property schema or all downstream consumers | Existing nullable typed domains and context platform are adequate foundations |
| **AVOID** | Treating tax parcel subsystem as a universal lookup without adaptation | It is jurisdiction-governed and feature-specific |

## 17. Risk Register

| Rank | Risk | Evidence/current impact | Mitigation direction (not a design) |
|---|---|---|---|
| **HIGH** | False facts from untouched defaults | Manual create sends several unchecked booleans as false and records evidence | Preserve unknown unless explicitly answered |
| **HIGH** | Wrong property/unit match | Place ID/unit/canonical address are discarded; duplicate logic is strings | Strengthen durable address identity and explicit match confidence |
| **HIGH** | Misattributed provider facts | Lookup values are stored as `USER_REPORTED`/verified | Use existing evidence model with actual source and confirmation state |
| **HIGH** | Partial-success retry creates confusing duplicate | Core insert precedes several awaited operations; activation context is a second request | Make creation/idempotency and post-commit status observable |
| **HIGH** | Premature or misleading risk output | Sparse property queues risk; missing basics create HIGH “Data Missing” report | Gate interpretation/output on prerequisites while retaining explicit missing state |
| **HIGH** | External fact conflicts overwrite trusted corrections | Update path supersedes current evidence and assumes user report | Apply existing context conflict/precedence semantics to enrichment writes |
| **MEDIUM** | Recalculation storm during enrichment | Every relevant PATCH can enqueue risk/hidden/twin and reconcile other domains | Batch or coordinate updates using existing job/idempotency patterns |
| **MEDIUM** | Editor blocks sparse Properties | Four system types required only by edit schema | Align editor requiredness with canonical/backend rules |
| **MEDIUM** | Setup analytics/completion become misleading | creation, trigger context, checklist completeness, and record completeness are separate but overlapping | Preserve separate lifecycle events and define readiness explicitly later |
| **MEDIUM** | Provider outage leaves flow stalled | Lookup service currently returns null; UI already tolerates address suggestions failing | Keep manual address creation and explicit unavailable/pending state |
| **MEDIUM** | Stale provider data | Evidence supports `validUntil`/superseded but create path does not use it | Use existing freshness fields in future provider writes |
| **MEDIUM** | Geographic overconfidence | ZIP centroid marked VERIFIED | Keep precision and provider purpose explicit |
| **MEDIUM** | Household collaborator inconsistency | Checklist service owner-only query conflicts with household-aware middleware | Align service authorization before relying on collaborative setup |
| **LOW** | Photo upload failure | Already isolated and clearly reported after successful Property save | Preserve partial-success message |
| **LOW** | Removing optional form controls breaks consumers | Most consumers already accept null/UNKNOWN | Verify field-specific policies; keep Details/JIT capture available |

## 18. Test Coverage

### Existing relevant coverage

- `apps/frontend/src/lib/onboarding/__tests__/addressIntegrity.test.ts`: complete US address validation, lookup state/ZIP mismatch rejection, homeowner address authority, and clearing lookup facts after address correction.
- `apps/frontend/src/lib/onboarding/__tests__/buyerProfileCapture.test.ts`: source-level assertions that compact buyer facts appear on both pages, enter the create payload, and tailor first value.
- `apps/frontend/src/app/onboarding/reveal/__tests__/page.test.tsx`: compatibility redirect.
- `apps/frontend/src/components/property/__tests__/propertyEditPriority.test.ts`: responsibility completeness/nudge targeting.
- `apps/frontend/src/lib/property/__tests__/propertyContextForm.test.ts`: shared property-context form mappings.
- `apps/backend/tests/unit/externalPropertyDataIntegrity.test.js`: ensures lookup does not emit synthetic facts and returns null without a real provider.
- `apps/backend/tests/unit/propertyRoutesAuthGuards.test.js`: selected property subroute authorization; it is not create-flow coverage.
- `apps/backend/tests/unit/propertyScoreAppliances.test.js`: missing household-size behavior and appliance score completeness.
- Extensive Property Context, applicability, seasonal, risk, Home Event Radar, habit, intelligence-source, and worker unit tests exercise downstream unknown/context behavior.
- `docs/functional/Testing_Property_Onboarding.md` is a manual checklist for skip/resume/completion, but some statements are stale relative to current code (for example, it expects automatic redirect behavior not present in the audited Property page).

### Important gaps

- no end-to-end or service-level test of `POST /api/properties` with only the minimum address tuple;
- no atomicity/idempotency test for failures after Property commit;
- no duplicate test covering abbreviations, units, concurrency, or later address edit;
- no test proving primary reassignment and create are atomic;
- no test of the long manual form’s hidden Advanced required fields or refresh/data loss;
- no test preventing untouched booleans from becoming confirmed false;
- no contract test aligning create page, edit page, backend Zod, and Prisma requiredness/ranges;
- no test that external lookup source/confidence survives persistence (it currently cannot);
- no full trigger-first test spanning cookie -> create -> entry context -> first value and retry failure;
- limited tests for PropertyOnboarding completion semantics, force-finish behavior, and collaborator authorization;
- no explicit test that sparse creation does not surface a misleading high-risk homeowner result;
- no test for unit/subpremise retention because the contract discards it.

No tests were added or run for this read-only audit.

## 19. Key Findings

1. **C2C already has a sparse Property backend.** Only the structured address tuple is required by POST/Prisma; the long form’s extra requirements are predominantly UI policy.
2. **There are three setup concepts, not one:** trigger-first creation, manual full-form creation, and a post-create activity checklist.
3. **The ordinary Add Property entry points still choose the long manual form**, while the newer trigger-first route demonstrates the intended compact pattern but is not the universal creation path.
4. **Address autocomplete is reusable but address identity is not provider-ready.** Critical provider/unit/canonical components are discarded and ZIP-centroid geocoding is not parcel geocoding.
5. **Partial data is first-class in the schema and Property Context**, but not consistently honored by frontend requiredness or write defaults.
6. **Current provenance foundations are substantial**, yet the create/update service hard-codes homeowner-reported verified evidence and therefore cannot faithfully store provider-derived facts.
7. **Creation has post-commit failure windows.** A client-visible error can coexist with an already-created Property and trigger duplicate errors on retry.
8. **Several form fields matter downstream, but few need to block creation.** Year/size/system facts materially affect intelligence; responsibilities and applicability facts matter before corresponding actions; many others can arrive later.
9. **Setup completeness is not property-fact readiness.** Step 1 is automatically complete from the required address, and manual flags can override activity signals.
10. **Incremental evolution is feasible.** Existing partial update, context/evidence, editor, job reconciliation, and typed domains remove the need for a Property subsystem rewrite.

## 20. Redesign Constraints

Any later redesign should respect these current technical facts:

1. Preserve the structured address tuple because it is required across schema, API, display, and many feature queries.
2. Do not equate a successful suggestion selection with parcel/unit identity; current Places data is lossy.
3. Preserve `UNKNOWN`/`null` semantics; do not send false/zero for unanswered facts.
4. Use typed canonical owners (`Property`, exterior profile, responsibilities, financing, inventory), not a parallel generic property blob.
5. Use `PropertyFactEvidence`/Property Context semantics for source, confidence, freshness, verification, conflict, and correction.
6. Maintain homeowner correction as authoritative evidence without silently overwriting conflicts.
7. Account for post-create side effects and make success/failure retry-safe.
8. Prevent sparse data from producing confident risk, cost, safety, or applicability conclusions.
9. Keep regional ZIP geography distinct from precise address/parcel geography.
10. Preserve downstream update reconciliation, but avoid triggering it redundantly for each enrichment field.
11. Align frontend validation with backend and database rules; UI completeness must not masquerade as technical validity.
12. Treat trigger entry context, Property creation, record completeness, and five-step onboarding status as separate lifecycle concepts.
13. Preserve manual fallback when address or property-data providers are unavailable.
14. Do not require a Prisma rewrite merely to remove current UI-required fields; the current schema already permits sparse records.
15. Update analytics and tests when creation and enrichment become temporally separate.

## Explicit Answers

### Q1. What is the minimum information technically required today to create a Property?

An authenticated homeowner with an existing `HomeownerProfile`, plus `address`, `city`, two-character `state`, and five-digit `zipCode`. The service also creates the owner household membership. All other Property facts may be omitted.

### Q2. Which requirements come from the database, backend, and current UI?

- **Database:** `homeownerProfileId`, address, city, state, ZIP; generated/default fields fill the rest.
- **Backend POST:** address, city, state length two, ZIP five digits; valid authenticated homeowner profile; duplicate business rule.
- **Trigger-first UI:** adds situation/trigger or buyer context and home type.
- **Manual UI:** adds home type, ownership form, property use, occupancy status, and four-digit year built.
- **Edit UI:** further requires four system types to save, despite backend/database nullability.

### Q3. Could C2C create a Property from address alone with the current architecture?

Yes if “address” is the current four-part structured postal address. No if it is one unparsed string. The backend architecture supports the sparse record now; frontend flow and downstream timing/trust behavior require adjustment.

### Q4. Which requested fields could potentially be populated automatically?

Dwelling type, year built, square footage, bedrooms, bathrooms, lot size, last sale price/date, some foundation/basement/siding/exterior facts, and parcel/assessment-derived location context. Reliability varies by source, jurisdiction, and unit, so these are candidates—not guaranteed truths.

### Q5. Which fields genuinely need homeowner input?

Why they are here/active trigger; buyer stage, dates and concern; current use and occupancy; actual responsibility allocation; corrections/confirmation; system replacement/install history when records are absent; installed appliances/equipment; current safety and condition facts; and current features/providers that public records cannot reliably observe.

### Q6. Which manually requested fields are important for C2C intelligence?

Year built and size; dwelling/use/occupancy/ownership; responsibilities; roof/HVAC/water-heater types and ages; appliance identity/age; drainage and relevant exterior applicability; safety facts; buyer/trigger context; and financial facts for financial tools. Importance is feature-specific and does not imply initial requiredness.

### Q7. Which fields provide little/no current downstream value?

No persisted field is conclusively unused. The nonpersisted system timing answers have no independent downstream value. Siding, panel age, fence, security/fire-extinguisher status, and historic-registry free text have narrower current use than their capture cost. Property label/photo are presentation rather than intelligence inputs. These are candidates to defer, not delete.

### Q8. What can be reused for an address-first flow?

The shared autocomplete/manual fallback, sparse `POST /api/properties`, partial update endpoint/schema, nullable/UNKNOWN Property model, Property Context and evidence models, typed exterior/responsibility/financing/inventory domains, Property Details editor, background reconciliation hooks, lookup-service interface, and trigger-first session/first-value concepts.

### Q9. What would break if facts arrived progressively?

Core storage would not break. Current problems would be edit-page required system types, misleading risk “Data Missing” output, checklist Step 1 semantics, repeated job/reconciliation enqueues, wrong evidence source, and retry ambiguity after post-commit failures. Some features would remain unknown/deferred as intended until facts arrive.

### Q10. Does the existing property model support unknown/null safely?

Mostly yes: classifications use `UNKNOWN`, optional facts use null, and many feature policies fail closed. It is not uniformly safe because the manual form turns untouched fields into false, risk persists a high-severity missing-data detail, and frontend validators sometimes require nullable backend facts.

### Q11. Does C2C support provenance, confidence, or user verification?

Yes through `PropertyFactEvidence`, Property Context envelopes, capture receipts, and specialized source models. However, current create/update writes are incomplete and hard-coded as verified `USER_REPORTED`; provider-source persistence is not ready without extension.

### Q12. What is the smallest likely change surface for Address -> Create -> Auto-Enrich -> Confirm -> Critical Questions -> Insights?

The smallest likely surface is: consolidate the two create-route experiences around the shared address component; extend the address/result contract and durable identity; keep the existing sparse POST; add source-aware orchestration that writes through existing partial update/canonical domains; correct editor/setup requiredness; and gate/batch existing side effects until relevant facts are available. The broad Property schema and downstream feature pages need not be replaced.

### Q13. Incremental evolution or architectural blockers?

**Incremental evolution is likely.** Evidence: the database and POST already accept sparse Properties; PATCH is already broad and partial; unknown/conflict/provenance infrastructure exists; downstream updates already trigger recalculation; and a comprehensive correction editor exists. The blockers are localized but material—lossy address identity, incorrect source attribution, post-commit failure semantics, frontend duplication/defaults, and a few premature consumer outputs. None requires a Property subsystem rewrite, but each must be resolved before an address-only path can be considered reliable.

## Audit Evidence Index

- `docs/wiki/features/01-onboarding-and-property-setup.md`
- `docs/property-context/PROPERTY_CONTEXT_FRD.md`
- `docs/functional/Testing_Property_Onboarding.md`
- `apps/frontend/src/app/onboarding/address/page.tsx`
- `apps/frontend/src/app/onboarding/confirm/page.tsx`
- `apps/frontend/src/app/onboarding/first-value/page.tsx`
- `apps/frontend/src/app/api/onboarding-lookup-session/route.ts`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/new/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/onboarding/OnboardingClient.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx`
- `apps/frontend/src/components/property/AddressAutocomplete.tsx`
- `apps/frontend/src/components/property/PropertyOwnershipResponsibilitySection.tsx`
- `apps/frontend/src/lib/property/propertyContextForm.ts`
- `apps/frontend/src/lib/api/client.ts`
- `apps/frontend/src/lib/api/onboardingApi.ts`
- `apps/backend/src/routes/property.routes.ts`
- `apps/backend/src/controllers/property.controller.ts`
- `apps/backend/src/services/property.service.ts`
- `apps/backend/src/utils/validators.ts`
- `apps/backend/src/services/addressAutocomplete.service.ts`
- `apps/backend/src/services/externalPropertyData.service.ts`
- `apps/backend/src/routes/propertyOnboarding.routes.ts`
- `apps/backend/src/services/propertyOnboarding.service.ts`
- `apps/backend/src/services/entryContext.service.ts`
- `apps/backend/src/modules/propertyContext/*`
- `apps/backend/src/services/JobQueue.service.ts`
- `apps/backend/src/services/RiskAssessment.service.ts`
- `apps/backend/src/utils/propertyScore.util.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/workers/src/lib/propertyGeo.ts`
