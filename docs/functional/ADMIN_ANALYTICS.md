Admin Analytics Layer
Contract-to-Cozy Internal Product Intelligence System
1. Overview

The Admin Analytics Layer provides internal visibility into how Contract-to-Cozy is being used.

It enables administrators to understand:

product activation

engagement

feature adoption

value delivered to homeowners

retention trends

decision guidance delivered by CtC

This feature is admin-only and is not visible to homeowners.

The system is built using an event-driven analytics architecture that captures product events and aggregates them into operational metrics.

2. Objectives

The Admin Analytics Layer answers key product questions:

Question	Metric
Are homes getting activated?	Activated Homes
Are users returning regularly?	WAH / MAH
Are users interacting with the product?	Interactions per Home
Are CtC insights actually guiding decisions?	Decisions Guided
Which features are most useful?	Feature Adoption
Where do users drop off?	Activation Funnel
Are cohorts retaining?	Cohort Retention
Which tools are used most?	Top Used Tools

3. Architecture Overview

The Admin Analytics Layer is composed of six layers.

Instrumentation Layer
        │
Analytics Event Ingestion
        │
ProductAnalyticsEvent Table
        │
Metrics Aggregation Engine
        │
Admin Analytics APIs
        │
Admin Analytics Dashboard

4. Data Model
4.1 ProductAnalyticsEvent

Raw event table capturing product usage.

Purpose

Acts as the source of truth for analytics.

Table
model ProductAnalyticsEvent {
  id            String   @id @default(cuid())

  eventType     ProductAnalyticsEventType
  eventName     String?

  userId        String?
  propertyId    String?

  moduleKey     String?
  featureKey    String?
  screenKey     String?
  source        String?
  sessionKey    String?

  occurredAt    DateTime
  eventDate     DateTime?

  metadataJson  Json?

  valueNumeric  Float?
  valueText     String?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

4.2 PropertyAnalyticsDailyRollup

Daily metrics aggregated per property.

model PropertyAnalyticsDailyRollup {
  id                         String   @id @default(cuid())
  propertyId                 String
  rollupDate                 DateTime

  isActivated                Boolean

  interactionCount           Int
  dashboardViewCount         Int
  featureOpenCount           Int
  toolUsageCount             Int

  maintenanceActionCount     Int
  incidentCount              Int
  claimCount                 Int

  decisionGuidedCount        Int

  hiddenAssetInteractionCount Int
  homePulseViewCount         Int
  digitalTwinViewCount       Int

  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt

  @@unique([propertyId, rollupDate])
}

4.3 FeatureAnalyticsDailyRollup

Feature adoption metrics.

model FeatureAnalyticsDailyRollup {
  id                    String   @id @default(cuid())

  rollupDate            DateTime

  moduleKey             String
  featureKey            String

  openCount             Int
  interactionCount      Int

  uniqueUserCount       Int
  uniquePropertyCount   Int

  decisionGuidedCount   Int

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([rollupDate, moduleKey, featureKey])
}
4.4 AdminAnalyticsDailySnapshot

Daily platform metrics.

model AdminAnalyticsDailySnapshot {
  id                         String @id @default(cuid())

  snapshotDate               DateTime

  totalUsers                 Int
  totalProperties            Int
  totalActivatedHomes        Int

  weeklyActiveHomes          Int
  monthlyActiveHomes         Int

  avgMonthlyInteractionsPerHome Float?

  decisionsGuidedCount       Int

  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt

  @@unique([snapshotDate])
}
5. Enums
ProductAnalyticsEventType
enum ProductAnalyticsEventType {
  PROPERTY_CREATED
  PROPERTY_UPDATED
  PROPERTY_ACTIVATED

  DASHBOARD_VIEWED

  FEATURE_OPENED
  TOOL_USED

  SYSTEM_ADDED
  SYSTEM_UPDATED

  MAINTENANCE_ITEM_CREATED
  MAINTENANCE_ITEM_COMPLETED

  INCIDENT_CREATED
  INCIDENT_VIEWED

  CLAIM_CREATED
  CLAIM_VIEWED

  HIDDEN_ASSET_VIEWED
  HIDDEN_ASSET_REFRESHED

  NEGOTIATION_SCENARIO_LAUNCHED

  HOME_PULSE_VIEWED
  DIGITAL_TWIN_VIEWED

  ARTICLE_VIEWED

  DECISION_GUIDED

  ACTION_COMPLETED

  INVENTORY_ITEM_CREATED

  RISK_VIEWED

  ADMIN_ANALYTICS_VIEWED
}
6. Backend Architecture
6.1 Analytics Module Structure
backend/src/analytics/

taxonomy.ts
schemas.ts
repository.ts
service.ts
emitter.ts
types.ts
6.2 Key Backend Services
ProductAnalyticsService

Handles event ingestion.

Functions:

trackEvent()
trackEvents()
trackFeatureOpened()
trackDecisionGuided()
trackPropertyActivated()
trackToolUsed()
AnalyticsEmitter

Safe helper used across CtC modules.

Example:

analyticsEmitter.trackFeatureOpened({
  userId,
  propertyId,
  moduleKey: "maintenance",
  featureKey: "maintenance_planner"
})
7. Instrumentation

Analytics events are wired into key flows.

Property

Events

PROPERTY_CREATED
PROPERTY_UPDATED
PROPERTY_ACTIVATED
Systems

Events

SYSTEM_ADDED
SYSTEM_UPDATED
Maintenance

Events

MAINTENANCE_ITEM_CREATED
MAINTENANCE_ITEM_COMPLETED
Incidents

Events

INCIDENT_CREATED
INCIDENT_VIEWED
Claims

Events

CLAIM_CREATED
CLAIM_VIEWED
Hidden Asset Finder

Events

HIDDEN_ASSET_VIEWED
HIDDEN_ASSET_REFRESHED
Negotiation Shield

Events

NEGOTIATION_SCENARIO_LAUNCHED
DECISION_GUIDED
Home Pulse

Events

HOME_PULSE_VIEWED
Digital Twin

Events

DIGITAL_TWIN_VIEWED
DECISION_GUIDED
Dashboard / Tool Entry

Events

DASHBOARD_VIEWED
FEATURE_OPENED
TOOL_USED
8. Metrics Engine

Located in:

backend/src/adminAnalytics/

Files:

metricsService.ts
repository.ts
cohortService.ts
funnelService.ts
schemas.ts
routes.ts
9. Admin APIs

Base path:

/api/admin/analytics
Overview
GET /admin/analytics/overview

Returns:

Activated Homes
WAH
MAH
Interactions/Home
Decisions Guided
Trends
GET /admin/analytics/trends

Returns:

activationTrend
interactionsTrend
decisionsTrend
activeHomesTrend
Feature Adoption
GET /admin/analytics/feature-adoption
Funnel
GET /admin/analytics/funnel
Cohorts
GET /admin/analytics/cohorts
Top Tools
GET /admin/analytics/top-tools
10. Frontend Architecture
Admin Analytics Page
frontend/src/app/admin/analytics/page.tsx
Component Structure
AdminAnalyticsPage
AdminAnalyticsFilterBar

AdminAnalyticsOverviewCards
AdminAnalyticsTrendCharts

AdminAnalyticsFunnel
AdminAnalyticsEngagementBreakdown

AdminAnalyticsDecisionGuidedSection

AdminAnalyticsFeatureAdoptionTable
AdminAnalyticsTopToolsTable

AdminAnalyticsCohortTable
11. Dashboard Layout

Desktop layout:

Header
Filters

Overview Cards

Trend Charts

Activation Funnel

Engagement Breakdown

Decision Guidance

Feature Adoption

Top Used Tools

Cohorts
12. Key Metrics Definitions
Activated Homes

A property becomes activated when:

property created

core data configured

meaningful interaction occurs

WAH

Weekly Active Homes.

unique properties with meaningful activity in last 7 days
MAH

Monthly Active Homes.

unique properties with meaningful activity in last 30 days
Interactions per Home
total interactions / active homes
Decisions Guided

Meaningful CtC actions:

negotiation launched

decision recommendation accepted

guided workflow executed

13. Data Quality Safeguards

The analytics system includes protections for:

Duplicate events

idempotent milestone events

guard logic in emitters

Event consistency

centralized taxonomy

moduleKey standardization

Missing metadata

Fallback handling for:

unknown_feature
unknown_module
unknown_property
Backfill safety

Metrics engine supports replay-safe aggregation.

Admin-only access

All APIs and UI require:

User.role = ADMIN
14. Security

Restrictions:

Admin APIs require server-side admin guard
Admin routes require role validation
No homeowner access
15. Future Enhancements
Predictive Product Insights

Example:

"Properties using Hidden Asset Finder are 2.3x more likely to stay active"
Feature Stickiness Analysis
Top retention-driving features
Homeowner Segmentation
New homeowners
Investors
Long-term owners
Geographic Insights
Adoption by region
Revenue Attribution
Which features drive upgrades
Automated Product Alerts

Example:

Activation rate dropped this week
Feature adoption spike
Retention decline
16. Operational Benefits

Admin Analytics Layer enables CtC to:

measure product value

guide product roadmap

detect adoption issues

identify retention drivers

prove impact to investors

17. Summary

The Admin Analytics Layer transforms Contract-to-Cozy into a data-driven platform.

It enables CtC to understand:

Activation
Engagement
Adoption
Retention
Decision impact

The system is:

Event-driven
Admin-only
Scalable
Extensible
Production-ready