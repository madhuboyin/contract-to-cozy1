# Contract-to-Cozy  
# Home Digital Twin  
Comprehensive Feature Documentation

---

# 1. Overview

## What is Home Digital Twin?

**Home Digital Twin** is a structured model of a property and its major systems that allows Contract-to-Cozy users to simulate **home upgrade and replacement scenarios**.

Examples:

- Replace HVAC
- Replace roof
- Replace water heater
- Upgrade insulation
- Install solar
- Resilience improvements

The system evaluates impacts such as:

- upfront cost
- annual savings
- maintenance changes
- payback period
- risk reduction
- property value impact

---

## What Digital Twin is NOT

It is **not**:

- a 3D model
- a CAD model
- a news feed
- a manual data entry tool
- a scorecard report

Instead it is a **decision engine** built on:


property profile
inventory
system age
maintenance
risk signals
cost estimates


---

# 2. Feature Objectives

Digital Twin exists to answer homeowner questions like:


Should I replace HVAC now or later?
Will insulation upgrades save money?
What happens if the roof is replaced now?
Is replacing the water heater early worth it?


Instead of spreadsheets or guesswork.

---

# 3. Feature Principles

The feature follows these design principles.

### Minimal manual input

The system relies primarily on:


property data
inventory
maintenance signals
existing CtC modules


---

### Explainable estimates

All outputs must be:


transparent
confidence-aware
non-misleading


---

### Integrated into CtC ecosystem

Digital Twin must reuse existing logic from:


Risk Module
Service Price Radar
Seller Prep
Inventory
Maintenance
Hidden Asset Finder


---

### UI consistency

Mandatory rules:


Desktop → existing Desktop pattern
Mobile → existing Home Tools mobile pattern


---

# 4. System Architecture


Property
│
▼
HomeDigitalTwin
│
├── Components
│ ├ HVAC
│ ├ Roof
│ ├ Water Heater
│ └ Electrical
│
├── Scenarios
│ ├ Replace HVAC
│ ├ Replace Roof
│ └ Upgrade Insulation
│
├── Impacts
│ ├ Cost
│ ├ Savings
│ ├ Payback
│ └ Risk
│
└── Data Quality


---

# 5. Database Schema

## Table: HomeDigitalTwin

Represents the twin model for a property.

### Fields


id
propertyId
status
version
completenessScore
confidenceScore
lastComputedAt
lastSyncedAt
createdAt
updatedAt


### Relationships


Property 1 — 1 HomeDigitalTwin
HomeDigitalTwin 1 — N HomeTwinComponent
HomeDigitalTwin 1 — N HomeTwinScenario
HomeDigitalTwin 1 — N HomeTwinDataQuality


---

## Table: HomeTwinComponent

Represents major systems of the home.

### Example Components


Roof
HVAC
Water Heater
Electrical
Plumbing
Windows
Insulation
Solar
Appliances


### Fields


id
digitalTwinId
propertyId
componentType
label
status
sourceType
sourceReferenceId
installYear
estimatedAgeYears
usefulLifeYears
conditionScore
failureRiskScore
replacementCostEstimate
annualOperatingCostEstimate
annualMaintenanceCostEstimate
energyImpactScore
resilienceImpactScore
confidenceScore
metadata
lastModeledAt
createdAt
updatedAt


---

## Table: HomeTwinScenario

Represents a simulated scenario.

### Fields


id
digitalTwinId
propertyId
createdByUserId
name
scenarioType
description
inputPayload
baselineSnapshot
status
isPinned
isArchived
lastComputedAt
createdAt
updatedAt


---

## Table: HomeTwinScenarioImpact

Stores normalized scenario results.

### Fields


id
scenarioId
impactType
valueNumeric
valueText
valueJson
unit
direction
confidenceScore
sortOrder
createdAt
updatedAt


---

## Table: HomeTwinDataQuality

Tracks twin data completeness.

### Fields


id
digitalTwinId
dimension
status
score
missingFields
notes
lastEvaluatedAt
createdAt
updatedAt


---

# 6. Enums

## HomeDigitalTwinStatus


DRAFT
ACTIVE
STALE
ARCHIVED


---

## HomeTwinComponentType


ROOF
HVAC
WATER_HEATER
PLUMBING
ELECTRICAL
INSULATION
WINDOWS
SOLAR
FLOORING
FOUNDATION
APPLIANCE
OTHER


---

## HomeTwinComponentStatus


KNOWN
ESTIMATED
NEEDS_REVIEW
RETIRED


---

## HomeTwinSourceType


PROPERTY_PROFILE
INVENTORY
DOCUMENT
RISK_ENGINE
MANUAL
SYSTEM_DERIVED
IMPORT
OTHER


---

## HomeTwinScenarioType


REPLACE_COMPONENT
UPGRADE_COMPONENT
ADD_FEATURE
ENERGY_IMPROVEMENT
RESILIENCE_IMPROVEMENT
RENOVATION
CUSTOM


---

## HomeTwinScenarioStatus


DRAFT
READY
COMPUTED
FAILED
ARCHIVED


---

## HomeTwinImpactType


UPFRONT_COST
ANNUAL_SAVINGS
PAYBACK_PERIOD
PROPERTY_VALUE_CHANGE
RISK_REDUCTION
ENERGY_USE_CHANGE
MAINTENANCE_COST_CHANGE
INSURANCE_IMPACT
COMFORT_IMPACT
CUSTOM


---

## HomeTwinImpactDirection


POSITIVE
NEGATIVE
NEUTRAL
UNKNOWN


---

## HomeTwinDataQualityDimension


PROPERTY_PROFILE
SYSTEMS
APPLIANCES
DOCUMENTATION
COST_BASIS
ENERGY_BASIS
RISK_BASIS


---

## HomeTwinDataQualityStatus


SUFFICIENT
PARTIAL
INSUFFICIENT
UNKNOWN


---

# 7. Backend Architecture

## Module


home-digital-twin.module.ts


---

## Controllers


home-digital-twin.controller.ts
home-digital-twin-scenario.controller.ts


---

## Services

### HomeDigitalTwinService

Handles twin lifecycle.


getTwin()
initTwin()
refreshTwin()


---

### HomeDigitalTwinBuilderService

Builds twin from CtC data.

Sources:


property profile
inventory
maintenance
risk signals
documents


---

### HomeDigitalTwinQualityService

Calculates:


completeness score
confidence score
data quality dimensions


---

### HomeDigitalTwinScenarioService

Handles scenario lifecycle.


createScenario()
listScenarios()
getScenario()
archiveScenario()


---

### HomeDigitalTwinComputeService

Runs scenario simulation.

Outputs:


cost impact
savings
payback
risk change
maintenance change


---

# 8. Backend APIs

## Twin APIs


GET /properties/:id/home-digital-twin
POST /properties/:id/home-digital-twin/init
POST /properties/:id/home-digital-twin/refresh


---

## Scenario APIs


GET /properties/:id/home-digital-twin/scenarios
POST /properties/:id/home-digital-twin/scenarios
GET /properties/:id/home-digital-twin/scenarios/:id


---

## Recommendation APIs


GET /properties/:id/home-digital-twin/recommended-scenarios


---

# 9. Frontend Architecture

## Page


HomeDigitalTwinPage.tsx


---

## Components


HomeDigitalTwinHeroCard
HomeDigitalTwinReadinessCard
HomeDigitalTwinComponentCard
HomeDigitalTwinRecommendedScenarioCard
HomeDigitalTwinScenarioCard
HomeDigitalTwinScenarioDrawer
HomeDigitalTwinComponentDrawer
HomeDigitalTwinEmptyState
HomeDigitalTwinLoadingState


---

## Hooks


useHomeDigitalTwin()
useInitHomeDigitalTwin()
useRefreshHomeDigitalTwin()
useHomeDigitalTwinScenarios()
useCreateHomeDigitalTwinScenario()
useHomeDigitalTwinRecommendedScenarios()


---

# 10. Mobile Navigation

Digital Twin appears in:


Home Tools


Tool Card:


Title: Home Digital Twin
Description: Simulate home upgrades and replacements
Icon: system-model / home-structure icon


---

# 11. Scenario Intelligence Logic

Recommended scenarios ranked using:


component age
failure risk
replacement window
potential savings
confidence level
property context


Top 3–5 recommendations only.

---

# 12. Scenario Compute Logic

Example calculations.

### Replace HVAC


Upfront Cost → replacement estimate
Annual Savings → efficiency improvement
Risk Reduction → lower failure probability
Payback → cost / savings


---

### Replace Roof


Upfront Cost
Maintenance reduction
Risk reduction
Insurance impact


---

### Upgrade Insulation


Project cost
Annual savings
Payback
Comfort improvement


---

# 13. Confidence & Data Quality

Outputs must show:


known values
estimated values
confidence level


Example messaging:


Estimated using property data
Based on inferred system age
Confidence: moderate


---

# 14. Error Handling

Graceful handling for:


missing twin
partial data
invalid scenario inputs
compute failure
stale scenarios


---

# 15. Performance Considerations

Avoid:


duplicate recomputation
unnecessary refresh calls
large API payloads


---

# 16. QA Coverage

Test coverage areas:


twin initialization
scenario creation
scenario compute
invalid inputs
partial data scenarios
property authorization


---

# 17. Future Enhancements (Recommended)

These enhancements should be considered **after initial release**.

---

## Enhancement 1 — Smart Scenario Suggestions

Examples:


HVAC near replacement window
Roof approaching end of life
Water heater failure risk


---

## Enhancement 2 — Lifecycle Planning

Add projection timeline:


Roof replacement window
HVAC replacement window
Appliance lifecycle


---

## Enhancement 3 — Contractor Quote Comparison

Compare:


scenario estimate
contractor quote
market average


---

## Enhancement 4 — Insurance Optimization

Simulate impact of:


roof replacement
storm upgrades
resilience improvements


---

## Enhancement 5 — Renovation Planning

Examples:


finish basement
kitchen remodel
solar installation


---

# 18. Expected Outcome

Digital Twin becomes a **core intelligence layer** of Contract-to-Cozy.

It powers:


home upgrade planning
maintenance strategy
risk reduction decisions
financial optimization
long-term home ownership planning


Without creating:


feature sprawl
manual data-entry burden
complex UI