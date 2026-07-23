# Environment Report — Functional Requirements Document

**Version:** 1.1
**Last Updated:** 2026-07-12  
**Status:** Implemented baseline with documented future enhancements  
**Audience:** Product, design, frontend engineering, backend engineering, data engineering, QA, support

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals and Success Outcomes](#3-goals-and-success-outcomes)
4. [Scope and Non-Goals](#4-scope-and-non-goals)
5. [Users and Primary Use Cases](#5-users-and-primary-use-cases)
6. [Experience Architecture](#6-experience-architecture)
7. [Functional Requirements](#7-functional-requirements)
8. [Insight and Personalization Rules](#8-insight-and-personalization-rules)
9. [Incremental Data Capture](#9-incremental-data-capture)
10. [Weather Incident and Notification Integration](#10-weather-incident-and-notification-integration)
11. [Visualization Requirements](#11-visualization-requirements)
12. [Data Sources and Freshness](#12-data-sources-and-freshness)
13. [API and Data Contracts](#13-api-and-data-contracts)
14. [Persistence and Data Ownership](#14-persistence-and-data-ownership)
15. [Failure, Empty, and Degraded States](#15-failure-empty-and-degraded-states)
16. [Security, Privacy, and Trust](#16-security-privacy-and-trust)
17. [Accessibility and Responsive Requirements](#17-accessibility-and-responsive-requirements)
18. [Non-Functional Requirements](#18-non-functional-requirements)
19. [Analytics and Measurement](#19-analytics-and-measurement)
20. [Acceptance Criteria](#20-acceptance-criteria)
21. [Testing Strategy](#21-testing-strategy)
22. [Assumptions and Product Decisions](#22-assumptions-and-product-decisions)
23. [Known Limitations and Risks](#23-known-limitations-and-risks)
24. [Future Enhancements](#24-future-enhancements)
25. [Rollout and Operational Considerations](#25-rollout-and-operational-considerations)
26. [File and Dependency Reference](#26-file-and-dependency-reference)

---

## 1. Overview

The Environment Report is a property-scoped homeowner experience that combines current and historical environmental data with known information about the home. Its purpose is not to replicate a general weather application. Its purpose is to help the homeowner understand:

1. What environmental conditions are changing?
2. What could those changes mean for this particular home?
3. What action, if any, should be taken?
4. What additional home information would materially improve the recommendation?
5. Is the condition a forecast-based preparation signal or an official active Incident?

The report is available at:

```text
/dashboard/properties/:propertyId/environment-report
```

It is also discoverable from the property dashboard and the Climate experience.

### 1.1 Product Positioning

The report must behave as a **home protection advisor supported by environmental data**, not as a standalone collection of tables. Raw measurements remain available, but the primary hierarchy is:

```text
Environmental signal
  → Home-specific implication
  → Recommended preparation
  → Contextual CTA
  → Follow-up / maintenance record
```

### 1.2 Design Principles

- **Homeowner first:** Explain implications before exposing raw measurements.
- **Property scoped:** Every report is tied to one authorized property.
- **Deterministic before generative:** Insight triggers and severity are rule-based and explainable.
- **Ask on need:** Request missing home information only when it can change the active recommendation.
- **Persist once, reuse everywhere:** Confirmed homeowner answers update canonical property or maintenance records.
- **Official alerts stay authoritative:** Home context may increase action priority but must not downgrade an official safety alert.
- **Visual first, tabular second:** Charts and cards communicate trends; tables remain as expandable detail.
- **Graceful degradation:** Failure of one environmental provider must not sink the entire report.

---

## 2. Problem Statement

Environmental information was previously presented as seven largely independent data sections. Weather forecasts, AQI history, drought history, flood zone, radon zone, nearby EPA facilities, and climate normals were technically available but did not answer what the homeowner should do.

Primary problems addressed by this feature:

| Problem | Consequence |
|---|---|
| Weather and environmental data shown without interpretation | Homeowner must infer risk and action independently |
| Generic advice does not account for property vulnerability | Recommendations can be repetitive, irrelevant, or misleading |
| Missing home details prevent personalization | System either guesses or remains generic |
| Weather Incident pipeline and report were disconnected | Same hazard could appear twice without explanation |
| Tabular history obscures trends | Users cannot quickly identify worsening, unusual, or time-sensitive conditions |
| Maintenance history was not consulted | System could recommend an HVAC filter replacement immediately after completion |

---

## 3. Goals and Success Outcomes

### 3.1 Goals

- G1: Surface the highest-priority environmental conditions affecting the selected property.
- G2: Explain why each condition matters to this home using known property and maintenance facts.
- G3: Provide concise, safe preparation actions and one primary CTA.
- G4: Connect forecast insights to matching active weather Incidents.
- G5: Collect one or two missing, high-value home facts inline when needed.
- G6: Persist confirmed answers and avoid asking for the same known fact again.
- G7: Use visual trends for weather, AQI, drought, climate, flood exposure, and facility proximity.
- G8: Continue serving useful sections when one or more external providers are unavailable.

### 3.2 Desired Outcomes

- Homeowners can identify the top environmental concern within five seconds.
- Every active insight explains both timing and home impact.
- Every actionable insight has a valid next step.
- Known maintenance completion prevents redundant recommendations.
- A homeowner can improve personalization without leaving the insight card.
- Forecast preparation and official alerts are visibly distinguishable.

---

## 4. Scope and Non-Goals

### 4.1 Current Scope

- Current weather conditions
- Forty-eight-hour hourly forecast, with a 24-hour primary chart
- Ten-day forecast, with a seven-day primary visual summary
- Thirty-day weather history
- Current AQI, PM2.5, and PM10
- Fourteen-day primary AQI trend
- Drought classification and twelve-week progression
- FEMA flood-zone point classification and USGS elevation
- EPA county radon zone
- EPA ECHO regulated-facility proximity
- NOAA climate normals and plant hardiness zone
- Deterministic environmental insights
- Property-aware personalization
- Inline incremental data capture
- HVAC filter maintenance-history personalization
- Active weather Incident correlation
- Bounded property-vulnerability contribution to Incident scoring

### 4.2 Non-Goals

- Replacing the National Weather Service or emergency-management instructions
- Predicting whether a particular home will definitely experience damage
- Treating regional/county classifications as property measurements
- Providing medical diagnosis from AQI or radon data
- Providing binding insurance-coverage determinations
- Creating bookings directly from Incidents
- Fabricating floodplain boundary maps from point-only FEMA responses
- Generating arbitrary AI advice without deterministic trigger and evidence data
- Persisting every generated insight as a separate database entity in the current phase

---

## 5. Users and Primary Use Cases

### 5.1 Primary User

An authenticated homeowner or authorized household member viewing a property they can access.

### 5.2 Primary Use Cases

| Use case | User intent |
|---|---|
| Heat preparation | Determine whether the cooling system needs attention before high heat |
| Heavy-rain preparation | Reduce drainage, basement, and water-intrusion exposure |
| Snow/freeze preparation | Protect plumbing, roof, vents, and walkways |
| Storm preparation | Protect roof, exterior items, trees, and electrical readiness |
| Poor-air-quality response | Reduce outdoor-particle entry and check filtration readiness |
| Drought monitoring | Understand soil, foundation-perimeter, irrigation, and landscaping implications |
| Long-term exposure review | Understand flood, radon, regulated-facility, and climate context |
| Home-profile enrichment | Supply relevant missing facts without completing a large profile form |

---

## 6. Experience Architecture

The page hierarchy is:

1. Property-aware report header
2. Saved-answer confirmation, when applicable
3. “What needs your attention” insight cards
4. Inline questions inside the affected insight
5. Home Systems Outlook
6. Current weather hero
7. Seven-day forecast
8. Hourly temperature/precipitation chart
9. Thirty-day history versus climate normals
10. AQI gauge and trend
11. Flood, drought, radon, EPA hazards, and climate sections
12. Expandable raw data tables

### 6.1 Insight Card Anatomy

Every insight must support:

- Severity/action-priority label
- Official-alert or forecast-preparation label
- Effective timeframe
- Title and concise summary
- “Why this matters to your home” explanation
- Affected systems
- Zero to two inline profile questions
- Recommended preparation actions
- Primary and optional secondary CTA
- Source attribution
- Related Incident reference, when applicable

---

## 7. Functional Requirements

### FR-1: Property Scope and Authorization

- FR-1.1: The report must require authentication.
- FR-1.2: Property authorization must be enforced by `propertyAuthMiddleware`.
- FR-1.3: The report must display the property name/address and generation timestamp.
- FR-1.4: Data from one property must never influence or appear in another property’s report.

### FR-2: Independent Section Aggregation

- FR-2.1: Weather, air quality, drought, flood/elevation, radon, hazards, and climate providers must execute independently.
- FR-2.2: A failed provider must return a section-level `unavailable` state.
- FR-2.3: The API must return other successful sections even if one provider fails.
- FR-2.4: An ungeocoded property must receive explicit unavailable reasons rather than fabricated values.

### FR-3: Insight Generation

- FR-3.1: Insights must be generated from structured environmental and home context.
- FR-3.2: Insight rules must be deterministic and unit-testable.
- FR-3.3: The report may return a maximum of five active insights.
- FR-3.4: `action` insights must sort before `watch`, and `watch` before `info`.
- FR-3.5: Each insight must include category, severity, timing, affected systems, recommended actions, CTA, and source.
- FR-3.6: Missing data must not prevent baseline safety guidance.

### FR-4: Property Personalization

- FR-4.1: Heavy-rain guidance must consider drainage issues, sump-pump backup, and FEMA flood-zone context.
- FR-4.2: Heat guidance must consider cooling type, HVAC installation year, and HVAC-filter maintenance history.
- FR-4.3: Snow/storm guidance must consider roof type and replacement year.
- FR-4.4: Freeze guidance must consider heating type and backup heat.
- FR-4.5: Drought guidance must consider foundation type and irrigation.
- FR-4.6: The explanation must say when context is unknown instead of claiming the home lacks a feature.

### FR-5: Contextual Actions

- FR-5.1: Every actionable insight must expose one primary CTA.
- FR-5.2: Supported destinations include Incidents, Maintenance, Coverage Intelligence, and Providers.
- FR-5.3: When a matching active Incident exists, “Review active incident” must become the primary CTA.
- FR-5.4: A preparation CTA may remain secondary.
- FR-5.5: CTAs must preserve the property ID.

### FR-6: Incremental Capture

- FR-6.1: The API must return no more than two questions at a time.
- FR-6.2: Questions must be associated with a specific `insightId`.
- FR-6.3: The frontend must render each question inside its associated insight card.
- FR-6.4: Confirmed answers must be persisted immediately.
- FR-6.5: The report must refetch and recalculate after a successful answer.
- FR-6.6: A confirmed known value must not be requested again.
- FR-6.7: Supported enum “Not sure” values must persist as `UNKNOWN` where the canonical model supports it.
- FR-6.8: Foundation type must use the canonical `FoundationType` enum across property editing and inline capture: `BASEMENT`, `CRAWL_SPACE`, `SLAB`, `PIER_AND_BEAM`, `RAISED`, `MIXED`, `OTHER`, or `UNKNOWN`.

### FR-7: HVAC Filter Maintenance Awareness

- FR-7.1: Heat insights must query completed HVAC-filter maintenance tasks before recommending filter work.
- FR-7.2: Matching must recognize canonical HVAC filter asset types and filter-specific task titles.
- FR-7.3: General HVAC tune-up tasks must not be treated as proof of filter replacement.
- FR-7.4: The latest `lastCompletedDate` must control recommendation wording.
- FR-7.5: If completed within 30 days, routine replacement must not be recommended unless dirty or airflow is reduced.
- FR-7.6: If completed 31–90 days ago, guidance must reference filter thickness/manufacturer interval.
- FR-7.7: If older than 90 days, guidance must recommend inspection and conditional replacement.
- FR-7.8: If no history exists, an inline date question must be presented.
- FR-7.9: The captured date must create/update a recurring HVAC-filter maintenance task and calculate the next due date.

### FR-8: Visual Detail and Raw Data

- FR-8.1: Primary weather and environment information must use visual summaries.
- FR-8.2: Raw tables must remain available behind expandable detail controls.
- FR-8.3: Visual summaries must not hide source units or exact values needed for verification.

### FR-9: Contextual Plant Advisor Cross-Sell

- FR-9.1: Heat, freeze, thunderstorm, and poor-air-quality insights must support a secondary Plant Advisor module.
- FR-9.2: Current outdoor humidity at or below 30% must support a standalone low-humidity plant-care module without increasing the home-risk insight count.
- FR-9.3: Personalization must prefer plants added to the home, then saved recommendations, then room profiles.
- FR-9.4: Plant guidance must use available plant humidity, light, maintenance, watering-cadence, room-type, cooling, heating, and backup-heat context.
- FR-9.5: Saved recommendations must not be presented as confirmed plant ownership.
- FR-9.6: When no Plant Advisor data exists, the module must provide a clearly optional, contextual setup CTA rather than plant-specific guidance. Setup copy must not imply that the property already has plants.
- FR-9.7: The CTA must preserve property, weather trigger, launch surface, and relevant room context.
- FR-9.8: Poor-air-quality guidance must explicitly avoid presenting houseplants as a substitute for indoor-air filtration.
- FR-9.9: A Plant Advisor query failure must degrade only the cross-sell module and must not fail the Environment Report.

### FR-10: Individual Weather-Aware Plant Care

- FR-10.1: Plants added to the home must persist as canonical `HomePlant` records.
- FR-10.2: Heat may shorten the recommended soil-check cadence, but must not prescribe automatic watering.
- FR-10.3: Freeze, storm, low-humidity, drought, and poor-air conditions must produce species-metadata-aware guidance when relevant.
- FR-10.4: Placement warnings must distinguish indoor rooms from outdoor garden zones.
- FR-10.5: Homeowners must be able to record inspection and watering timestamps inline.
- FR-10.6: Existing Plant Advisor “added to home” events must be migrated into `HomePlant` records.

### FR-11: Outdoor Garden Planning

- FR-11.1: Homeowners must be able to define garden zones with sun, drainage, irrigation, and frost-pocket context.
- FR-11.2: Homeowners must be able to add outdoor plants to a garden zone.
- FR-11.3: Garden guidance must combine current forecast, drought status, property irrigation, hardiness zone, and garden-zone facts.
- FR-11.4: Frost protection, drought planning, heavy-rain drainage warnings, and seasonal planting actions must be deterministic.
- FR-11.5: Seasonal guidance must remain conditional and direct homeowners to verify species suitability locally.
- FR-11.6: Outdoor Resilience landscaping design remains future scope.

---

## 8. Insight and Personalization Rules

### 8.1 Current Trigger Rules

| Category | Trigger | Default priority | Home-context modifiers |
|---|---|---|---|
| Heavy rain | Daily precipitation ≥ 1.0 inch | Watch | Action when ≥ 2.0 inches, drainage issue, or mapped high-exposure FEMA zone |
| Snow | WMO snow code | Watch | Action for heavy snow, flat roof, or roof ≥ 20 years since replacement |
| Freeze | Daily low ≤ 28°F without snow code | Watch | Action at ≤ 20°F or heat pump with no backup heat |
| Heat | Daily high ≥ 95°F | Watch | Action for multi-day heat, ≥ 100°F, or HVAC ≥ 15 years old |
| Storm | Thunderstorm WMO code | Watch | Action for severe thunderstorm code; roof context personalizes implication |
| Air quality | AQI > 100 | Watch | Action when AQI > 150 |
| Drought | D2, D3, or D4 | Watch | D4 is Action; foundation/irrigation personalize implication |

### 8.2 Severity Semantics

- `info`: Context worth knowing; no immediate preparation required.
- `watch`: Preparation may be helpful before the effective window.
- `action`: The forecast or property vulnerability justifies a stronger, time-bound recommendation.

Insight severity is not identical to Incident severity. Incident severity uses `INFO`, `WARNING`, and `CRITICAL` and includes authoritative alert inputs, exposure, likelihood, time sensitivity, coverage clarity, mitigation, and a bounded home-vulnerability adjustment.

### 8.3 Explainability

Recommendations must be reconstructable from:

- Environmental threshold crossed
- Effective date/window
- Property facts used
- Maintenance facts used
- Active Incident, when present
- Rule version in code/tests

Future API versions should expose a structured `propertyReasons[]` trace; current behavior exposes the conclusion in `homeImplication` and Incident score breakdown.

---

## 9. Incremental Data Capture

### 9.1 Question Priority

Questions are chosen from active insights in priority order and capped globally at two. Once an answer is persisted and the report refetches, the next relevant question may surface.

Current question routing:

| Active insight | Candidate missing facts, in priority order |
|---|---|
| Heavy rain | Drainage issues; sump-pump backup |
| Heat | Cooling type; HVAC-filter maintenance date; HVAC installation year |
| Snow/storm | Roof type; roof replacement year |
| Freeze | Heating type; backup heat |
| Drought | Irrigation; foundation type |

### 9.2 Canonical Persistence

- Property facts are saved to the existing `Property` record.
- HVAC-filter maintenance is saved to `PropertyMaintenanceTask`.
- Captured data must not be stored only in frontend state or inside an insight payload.
- Successful saves invalidate/refetch Environment Report and active-Incident queries.

### 9.3 HVAC Filter Capture Record

The environment capture uses a deterministic action key:

```text
:propertyId:ENVIRONMENT_CAPTURE:HVAC_FILTER
```

The canonical task is:

- Title: `Inspect or replace HVAC air filter`
- Status: `COMPLETED`
- Source: `USER_CREATED`
- Asset type: `HVAC_FILTER`
- Category: `HVAC`
- Recurring: yes
- Frequency: quarterly
- Last completed: homeowner-entered date
- Next due: entered date + 90 days

### 9.4 Data Quality Rules

- Dates cannot be in the future.
- HVAC filter capture dates earlier than 2000 are rejected by the current endpoint.
- Year inputs must be within supported validation bounds.
- Unknown enum answers must use canonical enum values rather than arbitrary strings.
- User-entered facts are treated as confirmed unless a future provenance model distinguishes verification levels.

---

## 10. Weather Incident and Notification Integration

### 10.1 Existing Incident Sources

- NWS severe-weather alerts create `SEVERE_WEATHER_ALERT` Incidents.
- Open-Meteo minimum-temperature forecasts create `FREEZE_RISK` Incidents.
- Workers deduplicate, refresh, resolve, and expire Incidents independently of report views.

### 10.2 Correlation

Environment insights correlate to open weather Incidents by type/hazard family:

| Insight | Incident match |
|---|---|
| Rain | FLOOD or HURRICANE |
| Storm | STORM or HURRICANE |
| Snow | SNOW |
| Heat | HEATWAVE |
| Freeze | `FREEZE_RISK` or SNOW |

### 10.3 User Presentation

- Matching `SEVERE_WEATHER_ALERT`: label “Official alert in effect.”
- No matching official Incident: label “Forecast-based preparation.”
- Related Incident title and severity must be shown.
- Primary CTA routes to the Incident detail.

### 10.4 Personalized Incident Scoring

Weather Incident scoring may add 0–10 property-vulnerability points based on relevant known facts. This adjustment:

- Can raise priority.
- Cannot reduce official/safety inputs.
- Is capped at 10.
- Stores contributing reasons in the score breakdown.
- Triggers reevaluation when relevant property fields are updated.
- Must not reactivate already mitigated Incidents from profile capture alone.

### 10.5 Notification Impact

The Environment Report does not independently send weather notifications. Notifications remain owned by Incident activation. Reevaluating an already active Incident must not send a duplicate activation notification.

---

## 11. Visualization Requirements

### 11.1 Weather

- Current-condition hero with icon, temperature, feels-like, humidity, wind, and current precipitation.
- Seven-day responsive forecast grid with condition icon, high/low, precipitation, and watch treatment.
- Twenty-four-hour chart combining temperature line and precipitation-probability bars.
- Thirty-day high/low chart with rainfall bars and current-month climate-normal overlays.
- Ten-day/hourly/history tables available in expandable detail.

### 11.2 Air Quality

- AQI categorical gauge.
- Plain-language AQI category.
- PM2.5 and PM10 supporting values.
- Fourteen-day AQI trend.
- Detailed history table available on expansion.

### 11.3 Drought and Climate

- Current drought category with homeowner explanation.
- Twelve-week drought progression.
- Monthly climate-normal high/low chart.
- Heating/cooling degree-day metrics.
- Plant hardiness zone.

### 11.4 Flood and Environmental Facilities

- FEMA flood-zone designation and exposure category.
- USGS elevation context.
- Explicit disclaimer that zone classification does not predict storm-specific flooding.
- EPA facility proximity plot based on returned coordinates and calculated distance.
- Significant noncompliance visually distinguished.
- Facility name, address, programs, compliance status, and approximate distance available.

### 11.5 Home Systems Outlook

- Aggregate `affectedSystems` across active insights.
- Show up to eight system tiles.
- Action-priority systems must be visually distinct from watch-level systems.
- Each tile must identify the hazard(s) driving the status.

---

## 12. Data Sources and Freshness

| Section | Source | Scope | Cache/freshness assumption |
|---|---|---|---|
| Weather | Open-Meteo forecast/archive | Point forecast/history | Report query stale time 5 minutes; backend weather cache 30 minutes |
| Air quality | Open-Meteo air-quality APIs | Point/regional model | Provider-specific cache applies |
| Drought | US Drought Monitor | County/area | Weekly publication |
| Flood zone | FEMA NFHL ArcGIS | Property point intersection | Cached 30 days |
| Elevation | USGS EPQS | Property point | Cached 30 days |
| Radon | EPA radon zone data | County/point-derived lookup | Long-lived reference data |
| Facilities | EPA ECHO | One-mile radius | Cached 24 hours |
| Climate normals | NOAA 1991–2020 normals | Nearest station | Long-lived reference data |
| Hardiness | ZIP/reference mapping | ZIP | Long-lived reference data |
| Official alerts | NWS | Alert polygon/area mapped to property | Worker polling and alert expiry |

Every section must identify its source and must not represent regional/model data as an on-property measurement.

---

## 13. API and Data Contracts

### 13.1 Get Report

```http
GET /api/environment/report/:propertyId
```

Response shape:

```ts
interface EnvironmentReportDTO {
  propertyId: string;
  property: {
    name: string | null;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    countyFips: string | null;
    zipCode: string | null;
  };
  generatedAt: string;
  insights: EnvironmentInsight[];
  questions: EnvironmentQuestion[];
  sections: {
    weather: SectionResult<WeatherReportData>;
    airQuality: SectionResult<AirQualityData>;
    drought: SectionResult<DroughtData>;
    floodElevation: SectionResult<FloodElevationData>;
    radon: SectionResult<RadonData>;
    hazards: SectionResult<EnvironmentalHazardsData>;
    climate: SectionResult<ClimateSectionData>;
  };
}
```

### 13.2 Record Environment Maintenance Context

```http
POST /api/environment/report/:propertyId/maintenance-context
```

Current supported payload:

```json
{
  "field": "hvacFilterLastCompletedDate",
  "completedDate": "2026-06-15"
}
```

The endpoint is authenticated and property-authorized.

### 13.3 Property Capture

Property answers use the existing property update endpoint:

```http
PATCH or PUT /api/properties/:propertyId
```

The Environment Report currently uses the typed frontend `updateProperty` client.

---

## 14. Persistence and Data Ownership

| Data | Canonical owner |
|---|---|
| Address, structure, systems, resilience markers | `Property`, including canonical `FoundationType` |
| HVAC filter completion and next due date | `PropertyMaintenanceTask` |
| Severe weather lifecycle | `Incident` and `IncidentSignal` |
| Weather guidance journey | Guidance Engine models |
| Environmental provider data | Cached service response; not persisted as property facts |
| Generated report insights | Computed on read; not currently persisted |
| Plant Advisor weather context | Existing `RoomPlantProfile`, `RoomPlantRecommendation`, `PlantCatalog`, and Plant Advisor `HomeEvent` records |
| Confirmed indoor/outdoor plants and care history | `HomePlant` |
| Outdoor sun, drainage, irrigation, and frost context | `GardenZone` |

The original Environment Report baseline required no new schema. Plant-care Phases 2 and 3 add `HomePlant` and `GardenZone`; future insight lifecycle, snooze, and acknowledgement features may require additional persisted state.

---

## 15. Failure, Empty, and Degraded States

- Loading: show a stable skeleton/spinner surface.
- Whole-request failure: show a retry action.
- Section failure: show “Data temporarily unavailable” with a reason where safe.
- No active insights: show “No immediate environment concerns.”
- Missing history: retain current/forecast content and degrade only the chart/table requiring history.
- Missing geocode: report affected sections as unavailable; hardiness may still resolve from ZIP.
- Missing property detail: provide baseline guidance and an inline question when relevant.
- Missing facility coordinates: show list data and a coordinate-unavailable proximity state.
- Missing climate normal: render weather history without normal overlays.

---

## 16. Security, Privacy, and Trust

- All report and capture endpoints require authentication.
- Property ownership/access must be enforced server-side.
- Coordinates and address are sensitive property data and must not be exposed across properties.
- External provider payloads are untrusted input and must be normalized before display.
- User-entered profile facts must be validated before persistence.
- Source attribution must remain visible.
- Official-alert instructions must not be overwritten by lower-authority generated advice.
- Regional classifications must be labeled as regional/county/model data.
- Recommendations must use conditional language and avoid guarantees of safety, damage, or coverage.

---

## 17. Accessibility and Responsive Requirements

- All charts require `role="img"` and descriptive accessible labels.
- Color cannot be the sole severity or category indicator.
- Interactive controls must be keyboard accessible.
- Inline questions must use native inputs/buttons and visible labels.
- Tables remain available as an accessible exact-data fallback.
- Mobile layouts must reflow without required horizontal scrolling.
- Forecast tiles use a two-column mobile grid and scale to seven columns on large screens.
- Text and controls must meet application contrast and minimum target-size conventions.
- Motion, if added later, must honor reduced-motion preferences.

---

## 18. Non-Functional Requirements

### 18.1 Performance

- Independent external calls execute in parallel where possible.
- Provider calls must have timeouts.
- Static/slow-changing providers must use TTL caching.
- The frontend query uses a short stale window to avoid redundant navigation refetches.
- Chart rendering must use bounded arrays: 24 hourly, 7 forecast, 30 history, 14 AQI, and 12 drought points for primary views.

### 18.2 Reliability

- One provider outage must not fail the report.
- Incident correlation failure must not remove baseline insights.
- Maintenance capture must be idempotent for the deterministic action key.
- Worker-created weather Incidents retain independent expiry/resolution behavior.

### 18.3 Maintainability

- Thresholds and mappings must remain centralized and unit tested.
- Frontend and backend DTO definitions must remain synchronized until a shared contract package exists.
- New insight types must define trigger, severity, home context, actions, questions, and tests.
- Spatial views must use real coordinates; no randomized/fictional facility locations.

### 18.4 Observability

- External fetch failures must be logged with provider and section context.
- Weather worker creation/resolution metrics remain authoritative for Incident operations.
- Future analytics events should be added for insight views, questions, saves, and CTA traversal.

---

## 19. Analytics and Measurement

### 19.1 Recommended Events

| Event | Important properties |
|---|---|
| `environment_report_viewed` | propertyId, availableSections, activeInsightCount |
| `environment_insight_viewed` | insightCategory, severity, relatedIncidentId |
| `environment_insight_cta_clicked` | insightCategory, actionLabel, destinationTool |
| `environment_question_shown` | questionField, insightCategory |
| `environment_question_answered` | questionField, answerKind, persistedEntityType |
| `environment_question_failed` | questionField, errorCode |
| `environment_detail_expanded` | section, detailType |
| `environment_maintenance_context_recorded` | contextType, daysSinceCompletion |

### 19.2 Product Metrics

- Insight-to-CTA conversion
- Percentage of reports with at least one personalized implication
- Inline-question completion rate
- Repeat-question rate (target: zero for known canonical data)
- Maintenance task completion after weather insight
- Reduction in redundant HVAC-filter recommendations
- Related-Incident review rate
- Section availability and provider failure rates

Analytics listed here are future requirements unless already emitted by the underlying Property, Maintenance, or Incident services.

---

## 20. Acceptance Criteria

### 20.1 Report Loading

- [ ] Authorized user receives a property-scoped report.
- [ ] Unauthorized property access is rejected.
- [ ] One failed external provider does not suppress successful sections.
- [ ] Property address and freshness timestamp are visible.

### 20.2 Insights

- [ ] Trigger thresholds produce the expected category and priority.
- [ ] Insights sort action before watch.
- [ ] No more than five insights are returned.
- [ ] Every insight has implication, timing, affected systems, action, and source.
- [ ] Known home facts change wording or priority where specified.

### 20.3 Inline Capture

- [ ] No more than two questions are returned.
- [ ] Questions appear inside the associated insight.
- [ ] Answer saves to canonical Property or Maintenance data.
- [ ] Report refetches after save.
- [ ] Answered known fields are not asked again.
- [ ] Next relevant question may surface after the previous answer.

### 20.4 HVAC Filter

- [ ] Latest completed filter-specific maintenance is discovered.
- [ ] General HVAC tune-up does not count as filter completion.
- [ ] Recent completion suppresses routine replacement language.
- [ ] Older completion changes recommendation wording.
- [ ] Missing history produces a date question.
- [ ] Captured date creates/updates the recurring filter task.
- [ ] Future dates are rejected.

### 20.5 Incident Integration

- [ ] Matching open Incident is attached by hazard family.
- [ ] Official alert and forecast preparation labels are correct.
- [ ] Incident becomes the primary CTA when present.
- [ ] Home vulnerability adjustment is capped at 10.
- [ ] Relevant property update reevaluates open weather Incidents.
- [ ] Active Incident reevaluation does not duplicate activation notification.

### 20.6 Visualization

- [ ] Current hero and seven-day forecast render from live report data.
- [ ] Hourly chart contains temperature and precipitation.
- [ ] AQI gauge/category and trend render.
- [ ] Thirty-day chart renders normal overlays when available.
- [ ] Drought and climate charts degrade cleanly with missing data.
- [ ] Facility proximity uses actual coordinates and distances.
- [ ] Raw detail tables remain accessible.
- [ ] Mobile layout does not require horizontal scrolling.

---

## 21. Testing Strategy

### 21.1 Unit Tests

- Insight trigger thresholds
- Priority ordering
- Heavy-rain property modifiers
- Heat and HVAC-age modifiers
- Roof/snow modifiers
- Freeze/heating modifiers
- Question cap and ordering
- Unknown enum suppression
- HVAC-filter recent/old/missing behavior
- Incident correlation and primary CTA
- Weather property-vulnerability score and cap

### 21.2 Service Tests

- Provider parsing and unavailable behavior
- Environmental facility coordinate/distance mapping
- HVAC-filter maintenance upsert and date validation
- Property authorization on report and maintenance-context endpoints
- Incident reevaluation after relevant profile update

### 21.3 Frontend Tests

- Insight-scoped question rendering
- Save success, error, and refetch states
- Forecast and chart empty states
- Raw detail disclosure controls
- Mobile breakpoints
- Accessible chart names and keyboard navigation

### 21.4 End-to-End Scenarios

1. Heat forecast + no cooling data + no filter history.
2. Save cooling type, filter date, and HVAC year sequentially.
3. Verify questions disappear and recommendation changes.
4. Flood Watch + drainage issue + no sump backup.
5. Confirm Incident-first CTA and dashboard consistency.
6. Provider outage with remaining sections intact.
7. EPA facility with and without coordinate data.

---

## 22. Assumptions and Product Decisions

### 22.1 Implemented Assumptions

1. **Weather thresholds are product heuristics, not official alert thresholds.** One inch of daily rain, 95°F heat, 28°F freeze, AQI > 100, and D2 drought are used to initiate preparation guidance.
2. **Open-Meteo daily precipitation is sufficient for current heavy-rain detection.** Short-duration rainfall intensity is not yet available in the report contract.
3. **FEMA point-zone intersection represents mapped exposure at the supplied coordinate.** It does not prove the structure is inside a surveyed floodplain or predict damage.
4. **EPA radon zone is regional potential, not a property test result.** Testing remains the only way to confirm property radon.
5. **EPA ECHO facilities within one mile provide useful proximity context.** Presence does not by itself mean household exposure.
6. **HVAC filter maintenance is adequately represented by a completed filter-specific maintenance task.** Filter type/thickness is not currently captured.
7. **Quarterly is a reasonable default recurrence for environment-captured filter maintenance.** Actual replacement interval depends on filter thickness, manufacturer, occupancy, pets, smoke, and system usage.
8. **HVAC system age of 15 years increases heat-strain concern.** This is a prioritization heuristic, not a diagnosis.
9. **Roof age of 20 years increases storm/snow inspection priority.** Material-specific useful life is not fully modeled in the current rule.
10. **At most two questions protects the user from form fatigue.** Questions are sequential; lower-priority facts may appear only after higher-priority answers are saved.
11. **User-entered answers are treated as canonical.** A future provenance model may distinguish user-confirmed, document-derived, professional-verified, and inferred data.
12. **Generated insights are computed on read.** They are not yet persisted, acknowledged, snoozed, or audited as standalone records.
13. **Property vulnerability may only add Incident severity points.** It must not downgrade an official safety signal.
14. **Facility proximity SVG is contextual, not a navigational map.** Coordinates are real, but it does not provide streets, parcel boundaries, or exposure modeling.

### 22.2 Resolved Product Decisions

- Use a recommended hybrid visualization: familiar weather forecast + home impact + selective analysis.
- Keep raw tables behind expandable details.
- Place missing-data capture inside the affected insight.
- Persist captured facts and maintenance history.
- Keep water-heater capture out of heat/storm insights unless a future hazard genuinely depends on it.
- Use Incident notifications as the only weather-notification path; do not create a second notification system in the report.

---

## 23. Known Limitations and Risks

| Limitation/risk | Impact | Mitigation/future direction |
|---|---|---|
| Fixed national trigger thresholds | Local expectations vary | Regional/seasonal calibration |
| Daily rain total lacks intensity | Flash-flood risk may be understated | Add hourly precipitation amount and NWS alert context |
| Filter thickness/household sensitivity not modeled | 30/90-day guidance is approximate | Capture filter type, pets, allergies, smoke exposure |
| No persisted insight lifecycle | Cannot snooze/acknowledge insight itself | Add insight state model or reuse guidance lifecycle |
| Frontend/backend DTO duplication | Contract drift risk | Shared generated schema/package |
| Facility map lacks basemap/parcel geometry | Limited spatial interpretation | Add approved mapping provider and boundary data |
| FEMA response lacks returned geometry | Cannot render floodplain shape | Request geometry or consume FEMA tile service |
| User-entered dates may be approximate | Recommendation confidence unclear | Add provenance and “approximate” flag |
| Question cap can delay roof questions behind HVAC questions | Relevant data may not appear immediately | Priority scoring and “More ways to personalize” option |
| Repeated external calls across properties | Provider/rate-limit risk | Stronger shared caching and batch lookups |

---

## 24. Future Enhancements

### 24.1 Near-Term (P1)

- Persist insight acknowledgement, snooze, dismiss, and completion state.
- Add structured explanation trace (`propertyReasons[]`, rule ID, threshold, confidence).
- Add post-event follow-up: “Rain has passed—inspect basement and drainage.”
- Add filter thickness, pets, allergies/sensitivity, and smoke-exposure context.
- Add completed seasonal checklist and Habit Coach history to recommendations.
- Add analytics events defined in Section 19.
- Add automated visual regression coverage for charts and mobile layouts.
- Add empty-state CTA to complete property geocoding/address data.

### 24.2 Medium-Term (P2)

- Regional/seasonal weather thresholds based on climate normals.
- Forecast deviation insights: unusually hot, cold, wet, dry, or windy versus local normals.
- Hourly precipitation amount, wind gust, dew point, UV, heat index, and snowfall amount.
- AQI forecast and wildfire-smoke plume context.
- Material-aware roof vulnerability and age bands.
- Basement/crawlspace-specific flood recommendations.
- Insurance-policy and coverage-context integration with explicit non-binding wording.
- Maintenance-readiness score using overdue/completed tasks and asset service history.
- Household-specific health guidance using opt-in sensitivity preferences.

### 24.3 Long-Term (P3)

- FEMA floodplain geometry and true interactive map.
- EPA facility basemap, program filters, and direction/distance tooltips.
- Real-time sensor integration: indoor temperature, humidity, leak, sump operation, particulate levels, and HVAC runtime.
- Predictive equipment-strain model combining forecast, asset age, service history, and sensor behavior.
- Storm-specific cost exposure and mitigation-value estimates.
- Portfolio view for multi-property owners.
- Push/email digest personalization based on saved homeowner preferences.
- Explainable AI copy layer constrained by deterministic facts and approved action catalog.
- Professional verification workflow for roof, drainage, HVAC, radon, and resilience data.

### 24.4 Deferred Feature Specification — Outdoor Resilience Mode

#### 24.4.1 Status and Intent

**Status:** Deferred; not part of the currently implemented Plant Advisor garden-zone experience.

Outdoor Resilience mode will extend Plant Advisor from plant care and seasonal garden planning into longer-term, property-aware landscape resilience. It will recommend planting strategies that may reduce localized exposure to recurring heat, runoff, drought, wind, erosion, snow drifting, or coastal conditions.

The feature must be presented as decision support. Vegetation may reduce or redirect some localized environmental effects, but it cannot prevent structural flooding, hurricane damage, wildfire, landslides, or other severe events.

#### 24.4.2 Objectives

- Convert recurring Environment Report signals into longer-term landscape opportunities.
- Recommend a resilience function before recommending a specific plant.
- Use property layout, mature plant characteristics, climate suitability, and safety constraints to determine whether planting is appropriate.
- Explain expected benefit, time to maturity, confidence, tradeoffs, and required professional review.
- Create a contextual Plant Advisor journey rather than a generic retail promotion.
- Support future nursery, arborist, landscape designer, and installation CTAs without compromising recommendation independence.

#### 24.4.3 Non-Goals

Outdoor Resilience mode will not:

- Guarantee flood, wind, fire, erosion, snow, or heat protection.
- Replace engineered drainage, grading, retaining walls, defensible-space planning, or structural mitigation.
- Produce a planting plan when minimum site information is unavailable.
- Recommend excavation before utility, septic, easement, and local-code constraints are checked.
- Recommend invasive plants or species not suited to the property’s climate.
- Estimate immediate energy or insurance savings without a validated model.
- Treat an individual forecast event as sufficient evidence for a permanent landscape change.
- Automatically purchase plants, hire providers, or modify the property.

#### 24.4.4 Supported Resilience Opportunities

| Environmental pattern | Potential planting strategy | Intended localized benefit |
|---|---|---|
| Recurring extreme heat or high cooling demand | Appropriately sized deciduous shade tree, trellis vine, shrub layer, or vegetated surface | Shade windows, walls, roofs, equipment, or paving; reduce localized surface heat |
| Repeated heavy rain or runoff concentration | Rain garden, bioswale planting, deep-rooted native grasses, or suitable shrubs | Slow, spread, infiltrate, or filter runoff where site conditions allow |
| Persistent drought | Native and low-water-use planting palette, soil cover, and irrigation zoning | Reduce supplemental water demand and improve landscape survivability |
| Recurring strong wind | Professionally designed tree-and-shrub windbreak | Reduce wind velocity in a defined leeward area |
| Soil erosion | Deep-rooted native groundcover, grasses, shrubs, or buffer planting | Stabilize exposed soil and reduce surface erosion |
| Repeated snow drifting | Professionally designed living snow fence | Redirect snow accumulation away from selected access areas or structures |
| Coastal salt/wind exposure | Salt-tolerant native vegetation and layered buffers | Improve landscape durability and reduce localized surface erosion |
| Urban heat and extensive paving | Shade canopy, planting islands, groundcover, or green-infrastructure planting | Reduce localized heat around hard surfaces |

Recommendations must use wording such as “may help,” “can reduce localized exposure,” or “consider professional evaluation.” They must not state that plants will protect the home from a severe event.

#### 24.4.5 Entry Points and User Journey

Outdoor Resilience mode may be entered from:

1. An Environment Report insight showing a recurring rather than isolated pattern.
2. Plant Advisor’s Outdoor Planning area.
3. A property dashboard resilience opportunity card.
4. A post-event follow-up after repeated runoff, erosion, wind, or heat observations.

The intended journey is:

1. **Opportunity detected:** The system identifies a recurring environmental pattern.
2. **Eligibility check:** Existing property, garden-zone, hazard, and climate data are evaluated.
3. **Incremental capture:** One or two high-value missing facts are requested inline.
4. **Strategy recommendation:** The system recommends a resilience role, such as shade or runoff capture.
5. **Plant and placement screening:** Candidate plant forms/species and possible zones are evaluated.
6. **Safety review:** Conflicts and required professional review are surfaced.
7. **Action:** The homeowner may save the concept, continue planning, or contact an appropriate professional.
8. **Follow-through:** Future versions may record installation, establishment care, maturity, and observed outcomes.

#### 24.4.6 Minimum Required Inputs

The system must not generate a placement-specific recommendation until the relevant minimum inputs are known.

**Property and site inputs:**

- Property type and available outdoor area
- Candidate garden zone or yard side
- Orientation or cardinal direction
- Approximate distance from the home and other structures
- Sun exposure
- Soil drainage and known standing-water behavior
- Existing mature trees and major plantings
- Foundation, driveway, sidewalk, retaining wall, and fence proximity
- Overhead and known underground utility constraints
- Septic tank, drain-field, well, or easement presence where applicable
- HOA, municipal, historic-district, or visibility restrictions when known
- Irrigation availability
- Known wildlife/deer pressure where relevant
- Wildfire exposure or defensible-space restrictions where applicable

**Environmental inputs:**

- Hardiness zone
- Climate normals and seasonal extremes
- Multi-year heat, precipitation, drought, freeze, wind, or snow patterns
- FEMA and local flood context, with appropriate limitations
- Current garden-zone sun, drainage, irrigation, and frost-pocket facts
- Locally authoritative invasive-species and native-plant references

#### 24.4.7 Incremental Data Capture

- The experience must ask no more than two questions at a time.
- Questions must be selected by expected decision value, not by schema order.
- Answers must persist and must not be requested again unless the homeowner edits them or marks them uncertain.
- “Not sure” must be supported and must lower confidence rather than block all progress when safe generalized guidance remains possible.
- Questions must explain why the information matters.

Example questions:

- “Which side of the home receives the strongest afternoon sun?”
- “About how far is the planting area from the foundation?”
- “Where does water collect during heavy rain?”
- “Are there overhead lines or known underground utilities in this area?”
- “Is this area part of a septic drain field?”
- “Does your HOA restrict tree size or front-yard landscaping?”

#### 24.4.8 Recommendation Hierarchy

Recommendations must be generated in this order:

1. **Resilience need:** heat, runoff, drought, wind, erosion, snow, salt, or urban heat.
2. **Strategy:** shade canopy, rain garden, windbreak, buffer, groundcover, or another approved strategy.
3. **Eligible property zone:** zones that satisfy minimum site and safety constraints.
4. **Plant form:** canopy tree, small tree, shrub, grass, perennial, groundcover, or vine.
5. **Candidate species:** locally appropriate options meeting climate, mature-size, water, soil, safety, and invasive-status requirements.
6. **Placement concept:** conditional location and clearance guidance.
7. **Execution pathway:** DIY planning, utility marking, arborist, landscape designer, drainage specialist, or other professional.

The feature must not begin with a species recommendation and attempt to justify it afterward.

#### 24.4.9 Candidate Plant Requirements

The future outdoor catalog must support:

- Common and scientific name
- Native regions and authoritative source
- Hardiness-zone range
- Heat, drought, flood, salt, wind, ice, and pollution tolerance
- Sun and soil requirements
- Mature height, canopy spread, and root-behavior guidance
- Growth rate and estimated time to meaningful resilience benefit
- Deciduous/evergreen behavior
- Water needs during establishment and at maturity
- Invasive or prohibited status by jurisdiction
- Wildlife, pet, and human toxicity warnings
- Utility, foundation, septic, pavement, and structure clearance guidance
- Wildfire/defensible-space suitability
- Supported resilience roles
- Evidence source, confidence, and last-reviewed date

Species data must come from authoritative national, state, extension, botanical, municipal, or other approved sources. Generative AI must not invent plant tolerances or clearance requirements.

#### 24.4.10 Placement and Safety Rules

- Recommendations must evaluate mature size rather than nursery-container size.
- Large-tree placement must consider canopy, root area, foundation, roof, pavement, utilities, and neighboring property.
- Utility marking must be required before excavation-oriented actions.
- Septic drain fields and critical easements must be treated as restricted unless an authoritative rule allows the proposed planting.
- Rain gardens must not be placed solely because heavy rain is forecast; soil infiltration, drainage direction, setbacks, utilities, and overflow routing must be evaluated.
- Windbreak and living-snow-fence recommendations require prevailing-wind direction, target area, mature height, density, and setback logic.
- Wildfire-prone properties must use defensible-space rules that may override shade, privacy, or wind recommendations.
- Coastal recommendations must account for salt spray, wind, erosion, and applicable shoreline restrictions.
- Invasive or locally prohibited species must be excluded.
- Conflicting strategies must be surfaced—for example, dense vegetation for wind protection versus vegetation clearance for wildfire safety.
- High-consequence or low-confidence recommendations must require professional review.

#### 24.4.11 Scoring and Explainability

Each strategy and candidate must expose:

- Opportunity score
- Site-fit score
- Climate-fit score
- Safety/conflict score
- Data completeness
- Confidence band
- Expected time horizon
- Facts used
- Assumptions made
- Exclusion reasons
- Professional-review requirement

The ranking model must be deterministic and versioned. Property-specific facts may improve or reduce fit, but commercial availability or sponsorship must never increase a candidate’s resilience score.

#### 24.4.12 UX Requirements

The result should include:

- “Why this opportunity was identified”
- A simple property-zone visualization
- Recommended resilience strategy
- Candidate plant forms and, when eligible, species
- Expected benefit and maturity timeframe
- Placement constraints and conflicts
- Establishment-care expectations
- Confidence and missing information
- Primary CTA appropriate to risk and complexity

Example:

> **Explore west-side shade planting**
> This home experiences recurring summer heat, and the west garden zone receives strong afternoon sun. A correctly sized deciduous shade tree may reduce direct solar exposure as it matures. Foundation distance and overhead utility information are still needed before placement options can be evaluated.

Possible CTAs:

- Complete site details
- Compare suitable plant types
- Save resilience concept
- Review with an arborist
- Find a landscape professional
- Check utility-marking requirements

#### 24.4.13 Proposed APIs

Potential future endpoints:

```http
GET  /api/properties/:propertyId/plant-advisor/resilience/opportunities
POST /api/properties/:propertyId/plant-advisor/resilience/evaluate
POST /api/properties/:propertyId/plant-advisor/resilience/plans
PATCH /api/properties/:propertyId/plant-advisor/resilience/plans/:planId
POST /api/properties/:propertyId/plant-advisor/resilience/plans/:planId/verify
```

APIs must be property-authorized, return rule/confidence metadata, and degrade safely when environmental or plant-reference providers are unavailable.

#### 24.4.14 Proposed Data Models

Potential schema additions:

- `PropertyOutdoorProfile`: utilities, septic, easements, restrictions, wildfire/coastal context, and confidence.
- `OutdoorSiteZone`: geometry or relative position, orientation, dimensions, structure clearances, sun, soil, drainage, and constraints.
- `OutdoorPlantCatalog`: authoritative resilience traits, climate range, mature size, safety clearances, source, and review date.
- `OutdoorResilienceOpportunity`: detected environmental pattern, strategy, evidence window, confidence, and lifecycle.
- `OutdoorResiliencePlan`: selected strategy, zone, candidate plants, assumptions, conflicts, professional-review status, and outcome.
- `OutdoorPlantInstallation`: installed plant, location, installation date, establishment plan, provider, and verification.

Existing `GardenZone` and `HomePlant` data should be reused or migrated where compatible rather than duplicated.

#### 24.4.15 Analytics and Success Measures

Recommended events:

- `outdoor_resilience_opportunity_viewed`
- `outdoor_resilience_capture_answered`
- `outdoor_resilience_strategy_saved`
- `outdoor_resilience_candidate_compared`
- `outdoor_resilience_professional_cta_clicked`
- `outdoor_resilience_plan_verified`
- `outdoor_resilience_installation_recorded`

Success measures should include completion of high-value site facts, qualified plan saves, professional-review conversion, installation follow-through, recommendation correction rate, and absence of repeat questions. Plant purchases alone are not an adequate success measure.

#### 24.4.16 Acceptance Criteria

- [ ] A permanent landscape opportunity is generated only from a recurring pattern or explicit homeowner goal, not a single forecast event.
- [ ] The system recommends a resilience strategy before presenting plant species.
- [ ] Placement-specific results are withheld until minimum site and safety data are available.
- [ ] Mature plant dimensions and required clearances are visible.
- [ ] Invasive, prohibited, climate-incompatible, and safety-conflicting candidates are excluded with reasons.
- [ ] Wildfire, utility, septic, easement, foundation, and drainage constraints can block or redirect a recommendation.
- [ ] Low-confidence results clearly identify missing inputs and do not imply protection.
- [ ] Commercial sponsorship does not influence resilience ranking.
- [ ] Professional review is required for high-consequence strategies.
- [ ] Saved answers and plans persist and are reused.
- [ ] Provider failure does not break Environment Report or the existing Plant Advisor.
- [ ] Mobile and desktop experiences expose equivalent facts, warnings, confidence, and CTAs.

#### 24.4.17 Assumptions and Risks

- Vegetation benefits develop over time and depend on survival, maintenance, mature size, and placement.
- Address-level weather and public hazard data may not represent parcel-level microconditions.
- Hardiness zone alone is insufficient for species or placement selection.
- Root behavior and infrastructure conflicts cannot always be determined remotely.
- Local rules and invasive-species lists change and require source versioning.
- Homeowner-entered measurements may be approximate.
- Provider or catalog coverage may vary significantly by region.
- Recommendations may create liability if benefit language is overstated or site constraints are missed.

#### 24.4.18 Recommended Rollout

1. **Opportunity discovery:** Identify recurring heat, runoff, drought, wind, erosion, snow, or coastal patterns and explain eligible resilience strategies without species selection.
2. **Site qualification:** Add outdoor-profile and site-zone capture, safety blockers, data completeness, and professional-review routing.
3. **Plant-form and species screening:** Introduce authoritative regional catalog data, mature-size rules, exclusions, and explainable ranking.
4. **Placement concepts:** Add relative property mapping, clearances, conflicts, and conditional layouts.
5. **Execution and follow-through:** Add saved plans, provider handoff, installation records, establishment care, and outcome tracking.

### 24.5 Required Future Data Models

Potential schema additions, only when these capabilities are approved:

- `EnvironmentInsightState`: acknowledgement, snooze, dismissal, completion, expiry.
- `PropertyFactProvenance`: source, confidence, verification date, verified by.
- `EnvironmentNotificationPreference`: hazard/category thresholds and channels.
- `HomeAirQualityPreference`: opt-in household sensitivity context.

These models are not required for the current report.

---

## 25. Rollout and Operational Considerations

### 25.1 Current Rollout

- Report and insight behavior ship as ordinary authenticated property functionality.
- No database migration was required for the baseline.
- Existing worker schedules and Incident notifications remain unchanged except for bounded personalization during reevaluation.

### 25.2 Monitoring

- Section provider error rates
- Report API latency
- NWS/Open-Meteo/EPA/FEMA rate-limit or timeout patterns
- Incident activation/notification volume before and after scoring changes
- Question save failure rate
- Duplicate HVAC-filter task rate
- Facility coordinate availability

### 25.3 Support Guidance

Support must be able to explain:

- Forecast insight versus official Incident
- Regional classification versus property measurement
- Why the report asks a particular home question
- Where captured information is stored
- How to correct a property or maintenance value
- Why an insight may change after a saved answer or provider refresh

---

## 26. File and Dependency Reference

| File | Responsibility |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/environment-report/page.tsx` | Report page, insight cards, inline capture, charts, tables, section UI |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/EnvironmentReportDashboardCard.tsx` | Property-dashboard entry card and top insight summary |
| `apps/frontend/src/lib/api/client.ts` | Environment and property API client methods |
| `apps/frontend/src/types/index.ts` | Frontend report, insight, question, and environmental DTOs |
| `apps/backend/src/routes/environmentReport.routes.ts` | Authenticated report and maintenance-context routes |
| `apps/backend/src/controllers/environmentReport.controller.ts` | Property lookup, report controller, maintenance-context capture |
| `apps/backend/src/services/environmentReport.service.ts` | Section aggregation, maintenance-history lookup, Incident correlation, DTO assembly |
| `apps/backend/src/services/environment/environmentInsights.service.ts` | Insight rules, personalization, questions, Incident attachment |
| `apps/backend/src/services/environment/weatherReport.service.ts` | Current/hourly/daily/history weather provider |
| `apps/backend/src/services/environment/airQuality.service.ts` | AQI and particulate data |
| `apps/backend/src/services/environment/drought.service.ts` | Drought data |
| `apps/backend/src/services/environment/floodElevation.service.ts` | FEMA zone and USGS elevation |
| `apps/backend/src/services/environment/radonZone.service.ts` | EPA radon zone |
| `apps/backend/src/services/environment/environmentalHazards.service.ts` | EPA ECHO facilities, coordinates, and distance |
| `apps/backend/src/services/environment/climateNormals.service.ts` | NOAA climate normals |
| `apps/backend/src/services/environment/hardinessZone.service.ts` | Plant hardiness zone |
| `apps/backend/src/services/environment/plantAdvisorWeather.service.ts` | Weather-triggered Plant Advisor context, personalization, and CTA derivation |
| `apps/backend/src/services/plantCarePlanner.service.ts` | Individual weather-aware care plans and outdoor seasonal garden guidance |
| `apps/backend/src/services/incidents/incident.evaluator.ts` | Weather Incident reevaluation and notification activation logic |
| `apps/backend/src/services/incidents/incident.scoring.ts` | Incident score and bounded property-vulnerability calculation |
| `apps/workers/src/jobs/severeWeatherAlerts.job.ts` | NWS severe-weather Incident ingestion |
| `apps/workers/src/jobs/freezeRiskIncidents.job.ts` | Freeze-risk Incident ingestion |
| `apps/backend/tests/unit/environmentInsights.test.js` | Insight, question, maintenance, and Incident-correlation rules |
| `apps/backend/tests/unit/weatherIncidentVulnerability.test.js` | Property-vulnerability scoring behavior |

---

*This FRD documents the Environment Report behavior implemented on `main` as of 2026-07-12 and distinguishes implemented functionality from proposed future enhancements.*
