# PASS 1 — Schema Intelligence Extraction

## 1. Domain Breakdown

Analyzed full backend schema at `apps/backend/prisma/schema.prisma` (9,356 lines, 215 models).
Cross-check: worker schema at `apps/workers/prisma/schema.prisma` is missing 51 backend models.

- `Property / Room / Inventory`: 22 models
- `Maintenance`: 7 models
- `Risk / Score / Intelligence`: 63 models
- `Financial`: 27 models
- `Timeline / Events`: 23 models
- `Actions / Recommendations`: 30 models
- `User / Preferences`: 43 models

## 2. Model-by-model summary

## Property / Room / Inventory
- Property | Purpose: Core home entity anchoring homeowner data. | Ownership: property-scoped (root) | Key fields: id, homeownerProfileId, state, name | Relationships: HomeAsset, MovingPlan, HomeownerProfile, Booking, Warranty, InsurancePolicy, +80 more
- InventoryRoom | Purpose: Inventory pipeline entity (room/item scan, OCR, import, or draft). | Ownership: property-scoped | Key fields: id, propertyId, type, name | Relationships: Property, InventoryItem, RoomChecklistItem, PropertyMaintenanceTask, Incident, HomeEvent, +5 more
- InventoryItem | Purpose: Inventory pipeline entity (room/item scan, OCR, import, or draft). | Ownership: room-scoped | Key fields: id, propertyId, roomId, category, name, currency | Relationships: Property, InventoryRoom, HomeAsset, Warranty, InsurancePolicy, InventoryImportBatch, +12 more
- InventoryImportBatch | Purpose: Inventory pipeline entity (room/item scan, OCR, import, or draft). | Ownership: property-scoped | Key fields: id, propertyId, status, createdByUserId, fileName, templateVersion | Relationships: Property, User, InventoryItem
- InventoryRoomScanSession | Purpose: Inventory pipeline entity (room/item scan, OCR, import, or draft). | Ownership: room-scoped | Key fields: id, propertyId, roomId, userId, status | Relationships: Property, User, InventoryRoom, InventoryDraftItem, InventoryScanImage, InventoryScanDelta
- InventoryOcrSession | Purpose: Inventory pipeline entity (room/item scan, OCR, import, or draft). | Ownership: property-scoped | Key fields: id, propertyId, userId, status | Relationships: Property, User, InventoryOcrField, InventoryDraftItem
- InventoryOcrField | Purpose: Inventory pipeline entity (room/item scan, OCR, import, or draft). | Ownership: global | Key fields: id, sessionId, confidence, key, value, session | Relationships: InventoryOcrSession
- InventoryDraftItem | Purpose: Inventory pipeline entity (room/item scan, OCR, import, or draft). | Ownership: room-scoped | Key fields: id, propertyId, roomId, userId, sessionId, status | Relationships: Property, User, InventoryOcrSession, InventoryRoomScanSession, InventoryRoom, InventoryDraftBox, +1 more
- InventoryDraftBox | Purpose: Inventory pipeline entity (room/item scan, OCR, import, or draft). | Ownership: global | Key fields: id, source, confidence, draftItemId, imageId, x | Relationships: InventoryDraftItem, InventoryScanImage
- InventoryScanImage | Purpose: Inventory pipeline entity (room/item scan, OCR, import, or draft). | Ownership: global | Key fields: id, scanSessionId, bucket, key, width, height | Relationships: InventoryRoomScanSession, InventoryDraftBox
- InventoryScanDelta | Purpose: Inventory pipeline entity (room/item scan, OCR, import, or draft). | Ownership: global | Key fields: id, scanSessionId, previousSessionId, draftItemId, deltaType, metaJson | Relationships: InventoryRoomScanSession, InventoryDraftItem
- HomeAsset | Purpose: Asset entity adjacent to inventory/home-item models. | Ownership: property-scoped | Key fields: id, propertyId, property, assetType, installationYear, modelNumber | Relationships: Property, Warranty, PropertyMaintenanceTask, InventoryItem, RecallMatch, HomeItem, +2 more
- HomeItem | Purpose: Canonical item abstraction with status history. | Ownership: room-scoped | Key fields: id, propertyId, roomId, status | Relationships: Property, InventoryRoom, InventoryItem, HomeAsset, HomeItemStatus, HomeItemStatusEvent
- HomeItemStatus | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, confidence, homeItemId, computedCondition, computedRecommendation, computedReasonJson | Relationships: HomeItem
- HomeItemStatusEvent | Purpose: Event-log entity. | Ownership: global | Key fields: id, homeItemId, actorUserId, eventType, payloadJson, homeItem | Relationships: HomeItem, User
- RoomChecklistItem | Purpose: Checklist item entity. | Ownership: room-scoped | Key fields: id, propertyId, roomId, status, title | Relationships: Property, InventoryRoom
- PlantCatalog | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, commonName, scientificName, lightLevel, maintenanceLevel, humidityPreference | Relationships: RoomPlantRecommendation
- RoomPlantProfile | Purpose: Feature-specific entity. | Ownership: room-scoped | Key fields: id, propertyId, roomId, detectedRoomType, lightLevel, maintenancePreference | Relationships: Property, InventoryRoom, RoomPlantRecommendation
- RoomPlantRecommendation | Purpose: Feature-specific entity. | Ownership: room-scoped | Key fields: id, propertyId, roomId, status, confidence, score | Relationships: Property, InventoryRoom, RoomPlantProfile, PlantCatalog
- Favorite | Purpose: User favorite/bookmark entity. | Ownership: global | Key fields: id, userId, providerProfileId, user, providerProfile | Relationships: User, ProviderProfile
- PropertyClimateSetting | Purpose: Property climate/region override entity. | Ownership: property-scoped | Key fields: id, propertyId, climateRegion, climateRegionSource, notificationTiming, notificationEnabled | Relationships: Property
- PropertyOnboarding | Purpose: Property onboarding progress entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, status | Relationships: Property

## Maintenance
- PropertyMaintenanceTask | Purpose: Scheduled maintenance task entity. | Ownership: room-scoped | Key fields: id, propertyId, roomId, bookingId, status, category | Relationships: SeasonalChecklistItem, Booking, Warranty, HomeAsset, Property, RecallMatch, +1 more
- MaintenancePrediction | Purpose: Predicted maintenance timing/cost/risk entity. | Ownership: property-scoped | Key fields: id, propertyId, status, priority | Relationships: Property, InventoryItem, Booking
- MaintenanceTaskTemplate | Purpose: Reusable template entity. | Ownership: global | Key fields: id, title, description, defaultFrequency, serviceCategory, isActive | Relationships: none
- SeasonalTaskTemplate | Purpose: Reusable template entity. | Ownership: global | Key fields: id, priority, title, taskKey, season, description | Relationships: SeasonalChecklistItem
- SeasonalChecklist | Purpose: Checklist container entity. | Ownership: property-scoped | Key fields: id, propertyId, status, season, year, climateRegion | Relationships: Property, SeasonalChecklistItem
- SeasonalChecklistItem | Purpose: Checklist item entity. | Ownership: property-scoped | Key fields: id, propertyId, status, priority, title | Relationships: SeasonalChecklist, SeasonalTaskTemplate, Property, ChecklistItem, PropertyMaintenanceTask
- Warranty | Purpose: Warranty coverage entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, category, cost, startDate | Relationships: HomeownerProfile, Property, Document, HomeAsset, InventoryItem, PropertyMaintenanceTask, +2 more

## Risk / Score / Intelligence
- RiskAssessmentReport | Purpose: Generated report entity. | Ownership: property-scoped | Key fields: id, propertyId, riskScore, financialExposureTotal, details, property | Relationships: Property
- CoverageAnalysis | Purpose: Analysis output entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, status, confidence, summary | Relationships: HomeownerProfile, Property, CoverageScenario
- CoverageScenario | Purpose: Scenario row for coverage analysis. | Ownership: property-scoped | Key fields: id, propertyId, name, coverageAnalysisId, inputOverrides, outputSnapshot | Relationships: CoverageAnalysis, Property
- ReplaceRepairAnalysis | Purpose: Analysis output entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, status, verdict, confidence | Relationships: HomeownerProfile, Property, InventoryItem
- PropertyScoreSnapshot | Purpose: Point-in-time snapshot entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, score | Relationships: Property, HomeownerProfile
- HomeScoreReport | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: property-scoped | Key fields: id, propertyId, status, generatedByUserId, reportMode, reportVersion | Relationships: Property, HomeScoreReportSection, HomeScoreCertification, HomeScoreReportEvidenceLink, HomeScoreIntegrityCheckRun, HomeScoreFinancialForecast, +2 more
- HomeScoreReportSection | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: global | Key fields: id, reportId, sectionKey, sectionJson, hashSha256, report | Relationships: HomeScoreReport
- HomeScoreCertification | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: global | Key fields: id, reportId, certificationStatus, issuedAt, expiresAt, revokedAt | Relationships: HomeScoreReport, HomeScoreCertificationCheck
- HomeScoreCertificationCheck | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: global | Key fields: id, status, severity, certificationId, checkKey, evidenceRef | Relationships: HomeScoreCertification
- HomeScoreReportEvidenceLink | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: global | Key fields: id, reportId, sectionKey, itemKey, provenanceId, contributionWeight | Relationships: HomeScoreReport, SignalProvenance
- HomeScoreDataSourceRun | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: property-scoped | Key fields: id, propertyId, sourceName, sourceVersion, runStatus, startedAt | Relationships: Property, HomeScoreDataSourceFact
- HomeScoreDataSourceFact | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: property-scoped | Key fields: id, propertyId, sourceName, factKey, factValueJson, effectiveAt | Relationships: Property, HomeScoreDataSourceRun
- HomeScoreIntegrityCheckRun | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: property-scoped | Key fields: id, propertyId, reportId, status, severity | Relationships: Property, HomeScoreReport
- HomeScoreFinancialForecast | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: property-scoped | Key fields: id, propertyId, reportId, modelVersion, horizonMonths, moneyAtRiskCents | Relationships: Property, HomeScoreReport, HomeScoreFinancialForecastItem
- HomeScoreFinancialForecastItem | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: global | Key fields: id, forecastId, categoryKey, estimatedCostCents, verifiedCostCents, urgency | Relationships: HomeScoreFinancialForecast
- HomeScoreBenchmarkSnapshot | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: global | Key fields: id, snapshotDate, dimensionType, dimensionKey, sampleSize, avgHomeScore | Relationships: none
- HomeScoreShareToken | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: global | Key fields: id, reportId, tokenHash, audienceMode, expiresAt, revokedAt | Relationships: HomeScoreReport
- HomeScoreExportJob | Purpose: Home score/reporting entity (report, section, check, data source, or export). | Ownership: global | Key fields: id, reportId, format, jobStatus, storageUrl, requestedByUserId | Relationships: HomeScoreReport
- SignalProvenance | Purpose: Signal provenance/attribution entity. | Ownership: property-scoped | Key fields: id, propertyId, confidence, summary | Relationships: SignalAttribution, HomeEvent, HomeScoreReportEvidenceLink, GuidanceSignal
- SignalAttribution | Purpose: Signal provenance/attribution entity. | Ownership: global | Key fields: id, provenanceId, provenance, rank, weight | Relationships: SignalProvenance
- GuidanceSignal | Purpose: Guidance journey/decisioning entity. | Ownership: property-scoped | Key fields: id, propertyId, status, severity | Relationships: Property, HomeAsset, InventoryItem, SignalProvenance, GuidanceJourney, GuidanceJourneyEvent
- GuidanceJourney | Purpose: Guidance journey/decisioning entity. | Ownership: property-scoped | Key fields: id, propertyId, status, homeAssetId, inventoryItemId, primarySignalId | Relationships: Property, HomeAsset, InventoryItem, GuidanceSignal, GuidanceJourneyStep, GuidanceJourneyEvent
- GuidanceJourneyStep | Purpose: Guidance journey/decisioning entity. | Ownership: global | Key fields: id, status, journeyId, stepOrder, stepKey, stepType | Relationships: GuidanceJourney, GuidanceJourneyEvent
- GuidanceJourneyEvent | Purpose: Guidance journey/decisioning entity. | Ownership: property-scoped | Key fields: id, propertyId, journeyId, stepId, signalId, eventType | Relationships: Property, GuidanceJourney, GuidanceJourneyStep, GuidanceSignal
- Incident | Purpose: Incident lifecycle entity (signal, action, acknowledgment, score, event). | Ownership: room-scoped | Key fields: id, propertyId, roomId, userId, status, category | Relationships: InventoryRoom, IncidentEvent, IncidentScoreSnapshot, IncidentSignal, IncidentAction, IncidentAcknowledgement, +1 more
- IncidentSignal | Purpose: Incident lifecycle entity (signal, action, acknowledgment, score, event). | Ownership: global | Key fields: id, confidence, incidentId, signalType, externalRef, observedAt | Relationships: Incident
- IncidentAction | Purpose: Incident lifecycle entity (signal, action, acknowledgment, score, event). | Ownership: global | Key fields: id, status, type, incidentId, actionKey, decisionTrace | Relationships: Incident
- IncidentSuppressionRule | Purpose: Incident lifecycle entity (signal, action, acknowledgment, score, event). | Ownership: property-scoped | Key fields: id, propertyId, userId, scope, typeKey, assetId | Relationships: none
- IncidentAcknowledgement | Purpose: Incident lifecycle entity (signal, action, acknowledgment, score, event). | Ownership: global | Key fields: id, userId, type, incidentId, note, snoozeUntil | Relationships: Incident
- IncidentEvent | Purpose: Incident lifecycle entity (signal, action, acknowledgment, score, event). | Ownership: property-scoped | Key fields: id, propertyId, userId, type | Relationships: Incident
- IncidentScoreSnapshot | Purpose: Incident lifecycle entity (signal, action, acknowledgment, score, event). | Ownership: global | Key fields: id, confidence, severity, incidentId, computedAt, severityScore | Relationships: Incident
- RadarEvent | Purpose: Event-log entity. | Ownership: global | Key fields: id, status, severity, title, summary | Relationships: PropertyRadarMatch
- PropertyRadarMatch | Purpose: Property radar matching/state/action entity. | Ownership: property-scoped | Key fields: id, propertyId, radarEventId, matchScore, impactLevel, impactSummary | Relationships: Property, RadarEvent, PropertyRadarState, PropertyRadarAction
- PropertyRadarState | Purpose: Property radar matching/state/action entity. | Ownership: global | Key fields: id, userId, state, propertyRadarMatchId, stateMetaJson, propertyRadarMatch | Relationships: PropertyRadarMatch, User
- PropertyRadarAction | Purpose: Property radar matching/state/action entity. | Ownership: global | Key fields: id, propertyRadarMatchId, actionType, actionMetaJson, propertyRadarMatch | Relationships: PropertyRadarMatch
- RadarSourceConfig | Purpose: Configuration entity for system/risk calculations. | Ownership: global | Key fields: id, sourceType, sourceLabel, isEnabled, lastIngestedAt, configJson | Relationships: none
- HomeRiskEvent | Purpose: Home risk replay/event entity. | Ownership: global | Key fields: id, severity, title, summary | Relationships: HomeRiskReplayEventMatch
- HomeRiskReplayRun | Purpose: Home risk replay/event entity. | Ownership: property-scoped | Key fields: id, propertyId, status, windowType, windowStart, windowEnd | Relationships: Property, HomeRiskReplayEventMatch
- HomeRiskReplayEventMatch | Purpose: Home risk replay/event entity. | Ownership: property-scoped | Key fields: id, propertyId, homeRiskReplayRunId, homeRiskEventId, matchScore, impactLevel | Relationships: HomeRiskReplayRun, HomeRiskEvent, Property
- HomeDigitalTwin | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, status, version, completenessScore, confidenceScore | Relationships: Property, HomeTwinComponent, HomeTwinScenario, HomeTwinDataQuality, HomeTwinComputationRun
- HomeTwinComponent | Purpose: Digital twin entity (component/scenario/impact/quality/run). | Ownership: property-scoped | Key fields: id, propertyId, status, digitalTwinId, componentType, label | Relationships: HomeDigitalTwin, Property
- HomeTwinScenario | Purpose: Digital twin entity (component/scenario/impact/quality/run). | Ownership: property-scoped | Key fields: id, propertyId, status, name | Relationships: HomeDigitalTwin, Property, User, HomeTwinScenarioImpact, HomeRenovationAdvisorSession
- HomeTwinScenarioImpact | Purpose: Digital twin entity (component/scenario/impact/quality/run). | Ownership: global | Key fields: id, scenarioId, impactType, valueNumeric, valueText, valueJson | Relationships: HomeTwinScenario
- HomeTwinDataQuality | Purpose: Digital twin entity (component/scenario/impact/quality/run). | Ownership: global | Key fields: id, status, score, digitalTwinId, dimension, missingFields | Relationships: HomeDigitalTwin
- HomeTwinComputationRun | Purpose: Digital twin entity (component/scenario/impact/quality/run). | Ownership: global | Key fields: id, status, summary, digitalTwinId, runType, startedAt | Relationships: HomeDigitalTwin
- NeighborhoodEvent | Purpose: Event-log entity. | Ownership: global | Key fields: id, state, title, eventType, description, latitude | Relationships: NeighborhoodImpact, PropertyNeighborhoodEvent, DemographicImpact
- PropertyNeighborhoodEvent | Purpose: Event-log entity. | Ownership: property-scoped | Key fields: id, propertyId, eventId, distanceMiles, impactScore, property | Relationships: Property, NeighborhoodEvent
- NeighborhoodImpact | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, category, confidence, eventId, direction, description | Relationships: NeighborhoodEvent
- DemographicImpact | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, confidence, eventId, segment, description, event | Relationships: NeighborhoodEvent
- NeighborhoodScanJob | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, status, dataSource, recordsFound, recordsSaved, startedAt | Relationships: none
- RecallRecord | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, status, source, severity, title, summary | Relationships: RecallProduct, RecallMatch
- RecallProduct | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, category, recallId, recall, manufacturer, brand | Relationships: RecallRecord
- RecallMatch | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, status, inventoryItemId, homeAssetId, recallId | Relationships: RecallRecord, Property, InventoryItem, HomeAsset, PropertyMaintenanceTask, Notification
- ServiceRadarCheck | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, status, verdict | Relationships: Property, ServiceRadarCheckSystemLink, ServiceRadarUserAction
- ServiceRadarCheckSystemLink | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, serviceRadarCheckId, linkedEntityType, linkedEntityId, relevanceScore, serviceRadarCheck | Relationships: ServiceRadarCheck
- ServicePriceBenchmark | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, serviceCategory, serviceSubcategory, regionType, regionKey, homeType | Relationships: none
- FinancialEfficiencyConfig | Purpose: Configuration entity for system/risk calculations. | Ownership: global | Key fields: id, zipCode, propertyType, avgInsurancePremium, avgUtilityCost, avgWarrantyCost | Relationships: none
- FinancialEfficiencyReport | Purpose: Generated report entity. | Ownership: property-scoped | Key fields: id, propertyId, financialEfficiencyScore, actualInsuranceCost, actualUtilityCost, actualWarrantyCost | Relationships: Property
- ServiceCategoryConfig | Purpose: Configuration entity for system/risk calculations. | Ownership: global | Key fields: id, category, availableForHomeBuyer, availableForExistingOwner, displayName, description | Relationships: none
- SystemComponentConfig | Purpose: Configuration entity for system/risk calculations. | Ownership: global | Key fields: id, category, systemType, expectedLife, replacementCost, warningFlags | Relationships: none
- PropertyInsightSnapshot | Purpose: Point-in-time snapshot entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, schemaVersion, snapshotJson, confidenceScore | Relationships: Property, User, PropertyNarrativeRun
- PropertyNarrativeRun | Purpose: Execution-run history entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, status | Relationships: Property, User, PropertyInsightSnapshot
- OrchestrationDecisionTrace | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, confidence, actionKey, computedAt, algoVersion | Relationships: none

## Financial
- Booking | Purpose: Service booking/order entity. | Ownership: property-scoped | Key fields: id, propertyId, status, category | Relationships: HomeBuyerTask, PropertyMaintenanceTask, User, ProviderProfile, Property, Service, +8 more
- Payment | Purpose: Payment transaction entity. | Ownership: global | Key fields: id, bookingId, status, amount, currency | Relationships: Booking
- Service | Purpose: Provider service catalog entry. | Ownership: global | Key fields: id, category, name, providerProfileId, inspectionType, handymanType | Relationships: ProviderProfile, Booking
- Expense | Purpose: Property expense entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, bookingId, category, amount | Relationships: HomeownerProfile, Property, Booking, HomeEvent
- PropertyFinanceSnapshot | Purpose: Point-in-time snapshot entity. | Ownership: property-scoped | Key fields: id, propertyId, mortgageBalance, interestRate, remainingTermMonths, monthlyPayment | Relationships: Property
- InsurancePolicy | Purpose: Insurance policy entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, startDate | Relationships: HomeownerProfile, Property, Document, InventoryItem, Claim, HomeSavingsAccount
- InsuranceQuoteRequest | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, status, source, currency | Relationships: HomeownerProfile, Property, InventoryItem
- HomeSavingsRun | Purpose: Savings analysis entity (run, opportunity, account, or taxonomy). | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, trigger, inputsJson, summaryJson | Relationships: HomeownerProfile, Property
- HomeSavingsOpportunity | Purpose: Savings analysis entity (run, opportunity, account, or taxonomy). | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, status, confidence, headline | Relationships: HomeownerProfile, Property, HomeSavingsAccount, Document
- HomeSavingsAccount | Purpose: Savings analysis entity (run, opportunity, account, or taxonomy). | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, status, amount, currency | Relationships: HomeownerProfile, Property, InsurancePolicy, Warranty, Document, HomeSavingsOpportunity
- HomeSavingsCategory | Purpose: Savings analysis entity (run, opportunity, account, or taxonomy). | Ownership: global | Key fields: id, key, label, description, isEnabled, sortOrder | Relationships: none
- RiskPremiumOptimizationAnalysis | Purpose: Analysis output entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, status, confidence, summary | Relationships: HomeownerProfile, Property, RiskMitigationPlanItem
- NegotiationShieldCase | Purpose: Insurance negotiation case entity. | Ownership: property-scoped | Key fields: id, propertyId, status, title | Relationships: Property, User, NegotiationShieldInput, NegotiationShieldDocument, NegotiationShieldAnalysis, NegotiationShieldDraft
- NegotiationShieldInput | Purpose: Insurance negotiation case entity. | Ownership: global | Key fields: id, caseId, inputType, rawText, structuredData, negotiationShieldCase | Relationships: NegotiationShieldCase
- NegotiationShieldDocument | Purpose: Insurance negotiation case entity. | Ownership: global | Key fields: id, caseId, documentId, documentType, uploadedAt, negotiationShieldCase | Relationships: NegotiationShieldCase, Document
- NegotiationShieldAnalysis | Purpose: Insurance negotiation case entity. | Ownership: global | Key fields: id, confidence, summary, caseId, scenarioType, findings | Relationships: NegotiationShieldCase
- NegotiationShieldDraft | Purpose: Insurance negotiation case entity. | Ownership: global | Key fields: id, caseId, draftType, subject, body, tone | Relationships: NegotiationShieldCase
- RiskMitigationPlanItem | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, analysisId, status, priority, title | Relationships: RiskPremiumOptimizationAnalysis, Property, Document, HomeEvent
- HomeCapitalTimelineAnalysis | Purpose: Capital planning timeline entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, status, confidence, summary | Relationships: HomeownerProfile, Property, HomeCapitalTimelineItem
- HomeCapitalTimelineItem | Purpose: Capital planning timeline entity. | Ownership: property-scoped | Key fields: id, propertyId, analysisId, category, confidence, priority | Relationships: HomeCapitalTimelineAnalysis, Property, InventoryItem, HomeEvent, Document, HomeRenovationAdvisorSession
- HomeCapitalTimelineOverride | Purpose: Capital planning timeline entity. | Ownership: property-scoped | Key fields: id, propertyId, type, inventoryItemId, payload, note | Relationships: Property, InventoryItem
- DoNothingScenario | Purpose: No-action scenario input entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, name | Relationships: HomeownerProfile, Property, DoNothingSimulationRun
- DoNothingSimulationRun | Purpose: Execution-run history entity. | Ownership: property-scoped | Key fields: id, propertyId, homeownerProfileId, status, confidence, summary | Relationships: HomeownerProfile, Property, DoNothingScenario
- MortgageRateSnapshot | Purpose: Point-in-time snapshot entity. | Ownership: global | Key fields: id, source, date, rate30yr, rate15yr, sourceRef | Relationships: PropertyRefinanceRadarState
- RefinanceOpportunity | Purpose: Refinance opportunity output entity. | Ownership: property-scoped | Key fields: id, propertyId, currentRate, marketRate, rateGap, loanBalance | Relationships: Property, PropertyRefinanceRadarState
- PropertyRefinanceRadarState | Purpose: Current-state entity. | Ownership: property-scoped | Key fields: id, propertyId, radarState, currentOpportunityId, lastRateSnapshotId, lastEvaluatedAt | Relationships: Property, RefinanceOpportunity, MortgageRateSnapshot
- RefinanceScenarioSnapshot | Purpose: Point-in-time snapshot entity. | Ownership: property-scoped | Key fields: id, propertyId, targetRate, targetTerm, closingCost, monthlySavings | Relationships: Property

## Timeline / Events
- HomeEvent | Purpose: Event-log entity. | Ownership: room-scoped | Key fields: id, propertyId, roomId, claimId, type, title | Relationships: Property, User, InventoryRoom, InventoryItem, Claim, Expense, +4 more
- HomeEventDocument | Purpose: Home-event to document attachment link. | Ownership: global | Key fields: id, eventId, documentId, kind, caption, sortOrder | Relationships: HomeEvent, Document
- BookingTimeline | Purpose: Booking status/history timeline event. | Ownership: global | Key fields: id, bookingId, status, note, createdBy, booking | Relationships: Booking
- ClaimTimelineEvent | Purpose: Claim workflow entity (claim, document, checklist, timeline). | Ownership: property-scoped | Key fields: id, propertyId, claimId, type, title | Relationships: Claim, Property, User, ClaimDocument
- DomainEvent | Purpose: Event-log entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, status, type | Relationships: none
- LocalUpdate | Purpose: Location-aware update/news entity. | Ownership: global | Key fields: id, state, category, priority, title, startDate | Relationships: UserLocalUpdateDismissal, LocalUpdateEvent
- LocalUpdateEvent | Purpose: Event-log entity. | Ownership: global | Key fields: id, userId, localUpdateId, eventType, localUpdate | Relationships: LocalUpdate
- UserLocalUpdateDismissal | Purpose: User dismissal tracking for local updates. | Ownership: global | Key fields: id, userId, localUpdateId, dismissedAt, localUpdate | Relationships: LocalUpdate
- CommunityEvent | Purpose: Event-log entity. | Ownership: global | Key fields: id, state, source, title | Relationships: none
- PropertyDailySnapshot | Purpose: Point-in-time snapshot entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, snapshotDate, payloadJson, scoreJson | Relationships: PropertyMicroAction, Notification, Property, User
- PropertyMicroAction | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, status, type, title | Relationships: Property, User, PropertyDailySnapshot
- PropertyStreak | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, streakType, currentCount, bestCount | Relationships: Property, User
- ProductAnalyticsEvent | Purpose: Event-log entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, source | Relationships: User, Property
- PropertyAnalyticsDailyRollup | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, rollupDate, isActivated, interactionCount, featureOpenCount | Relationships: Property
- FeatureAnalyticsDailyRollup | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, rollupDate, moduleKey, featureKey, openCount, interactionCount | Relationships: none
- AdminAnalyticsDailySnapshot | Purpose: Point-in-time snapshot entity. | Ownership: global | Key fields: id, snapshotDate, totalUsers, totalAdminUsers, totalProperties, totalActivatedHomes | Relationships: none
- AnalyticsCohortSnapshot | Purpose: Point-in-time snapshot entity. | Ownership: global | Key fields: id, cohortKey, cohortType, snapshotDate, cohortSize, activatedCount | Relationships: none
- GazetteEdition | Purpose: Weekly Gazette publication pipeline entity. | Ownership: property-scoped | Key fields: id, propertyId, status, publishedAt | Relationships: GazetteStory, GazetteStoryCandidate, GazetteSelectionTrace, GazetteGenerationJob, GazetteShareLink
- GazetteStory | Purpose: Weekly Gazette publication pipeline entity. | Ownership: property-scoped | Key fields: id, propertyId, priority, headline, summary | Relationships: GazetteEdition
- GazetteStoryCandidate | Purpose: Weekly Gazette publication pipeline entity. | Ownership: property-scoped | Key fields: id, propertyId, status, editionId, sourceFeature, sourceEventId | Relationships: GazetteEdition
- GazetteSelectionTrace | Purpose: Weekly Gazette publication pipeline entity. | Ownership: property-scoped | Key fields: id, propertyId, editionId, candidateId, preScore, postScore | Relationships: GazetteEdition
- GazetteGenerationJob | Purpose: Weekly Gazette publication pipeline entity. | Ownership: property-scoped | Key fields: id, propertyId, status, editionId, stage, startedAt | Relationships: GazetteEdition
- GazetteShareLink | Purpose: Weekly Gazette publication pipeline entity. | Ownership: property-scoped | Key fields: id, propertyId, status, editionId, tokenHash, expiresAt | Relationships: GazetteEdition

## Actions / Recommendations
- Checklist | Purpose: Checklist container entity. | Ownership: global | Key fields: id, homeownerProfileId, homeownerProfile, items | Relationships: HomeownerProfile, ChecklistItem
- ChecklistItem | Purpose: Checklist item entity. | Ownership: property-scoped | Key fields: id, propertyId, status, title | Relationships: SeasonalChecklistItem, Checklist, Property
- HomeBuyerChecklist | Purpose: Checklist container entity. | Ownership: global | Key fields: id, homeownerProfileId, homeownerProfile, tasks | Relationships: HomeownerProfile, HomeBuyerTask
- HomeBuyerTask | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, bookingId, status, title | Relationships: Booking, HomeBuyerChecklist
- OrchestrationActionEvent | Purpose: Event-log entity. | Ownership: property-scoped | Key fields: id, propertyId, source, actionKey, actionType, primarySourceType | Relationships: none
- OrchestrationActionSnooze | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, actionKey, snoozedAt, snoozeUntil, snoozeReason | Relationships: none
- OrchestrationActionCompletion | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, actionKey, eventId, completedAt, costAmount | Relationships: OrchestrationActionCompletionPhoto
- OrchestrationActionCompletionPhoto | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, completionId, fileName, fileSizeBytes, mimeType | Relationships: OrchestrationActionCompletion
- ToolOverride | Purpose: Manual override entity for property tools. | Ownership: property-scoped | Key fields: id, propertyId, toolKey, key, value, property | Relationships: Property
- PropertyHabit | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, status, habitTemplateId, generationSource, titleOverride | Relationships: Property, HabitTemplate, PropertyHabitAction
- PropertyHabitAction | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, propertyHabitId, actionType, note | Relationships: PropertyHabit, Property, User
- PropertyHabitPreference | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, isEnabled, preferredSurfaceCount, snoozeDefaultsJson, quietHoursJson | Relationships: Property
- HabitTemplate | Purpose: Reusable template entity. | Ownership: global | Key fields: id, category, priority, title | Relationships: PropertyHabit
- ServiceRadarUserAction | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, serviceRadarCheckId, actionType, actionMetaJson, serviceRadarCheck | Relationships: ServiceRadarCheck
- HiddenAssetProgram | Purpose: Hidden-asset discovery entity (program, rule, match, scan). | Ownership: global | Key fields: id, category, name, currency | Relationships: HiddenAssetProgramRule, PropertyHiddenAssetMatch
- HiddenAssetProgramRule | Purpose: Hidden-asset discovery entity (program, rule, match, scan). | Ownership: global | Key fields: id, programId, attribute, operator, value, sortOrder | Relationships: HiddenAssetProgram
- PropertyHiddenAssetMatch | Purpose: Hidden-asset discovery entity (program, rule, match, scan). | Ownership: property-scoped | Key fields: id, propertyId, status, programId, confidenceLevel, estimatedValue | Relationships: Property, HiddenAssetProgram
- PropertyHiddenAssetScanRun | Purpose: Hidden-asset discovery entity (program, rule, match, scan). | Ownership: property-scoped | Key fields: id, propertyId, status, startedAt, completedAt, programsEvaluated | Relationships: Property
- HomeRenovationAdvisorSession | Purpose: Renovation advisor entity (session/output/evidence/checklist). | Ownership: property-scoped | Key fields: id, propertyId, status, createdByUserId, renovationType, customRenovationLabel | Relationships: Property, User, HomeCapitalTimelineItem, HomeTwinScenario, HomeRenovationPermitOutput, HomeRenovationTaxImpactOutput, +4 more
- HomeRenovationPermitOutput | Purpose: Renovation advisor entity (session/output/evidence/checklist). | Ownership: global | Key fields: id, advisorSessionId, requirementStatus, confidenceLevel, confidenceReason, permitCostMin | Relationships: HomeRenovationAdvisorSession, HomeRenovationPermitTypeRequirement, HomeRenovationInspectionStage
- HomeRenovationPermitTypeRequirement | Purpose: Renovation advisor entity (session/output/evidence/checklist). | Ownership: global | Key fields: id, permitOutputId, permitType, isRequired, confidenceLevel, note | Relationships: HomeRenovationPermitOutput
- HomeRenovationInspectionStage | Purpose: Renovation advisor entity (session/output/evidence/checklist). | Ownership: global | Key fields: id, permitOutputId, inspectionStageType, isLikelyRequired, note, displayOrder | Relationships: HomeRenovationPermitOutput
- HomeRenovationTaxImpactOutput | Purpose: Renovation advisor entity (session/output/evidence/checklist). | Ownership: global | Key fields: id, advisorSessionId, confidenceLevel, confidenceReason, assessedValueIncreaseMin, assessedValueIncreaseMax | Relationships: HomeRenovationAdvisorSession
- HomeRenovationLicensingOutput | Purpose: Renovation advisor entity (session/output/evidence/checklist). | Ownership: global | Key fields: id, advisorSessionId, requirementStatus, confidenceLevel, confidenceReason, consequenceSummary | Relationships: HomeRenovationAdvisorSession, HomeRenovationLicenseCategoryRequirement
- HomeRenovationLicenseCategoryRequirement | Purpose: Renovation advisor entity (session/output/evidence/checklist). | Ownership: global | Key fields: id, licensingOutputId, licenseCategoryType, isApplicable, confidenceLevel, note | Relationships: HomeRenovationLicensingOutput
- HomeRenovationAdvisorAssumption | Purpose: Renovation advisor entity (session/output/evidence/checklist). | Ownership: global | Key fields: id, advisorSessionId, assumptionKey, assumptionLabel, assumptionValueText, assumptionValueNumber | Relationships: HomeRenovationAdvisorSession
- HomeRenovationAdvisorDataPoint | Purpose: Renovation advisor entity (session/output/evidence/checklist). | Ownership: global | Key fields: id, advisorSessionId, sectionKey, fieldKey, fieldLabel, fieldValueText | Relationships: HomeRenovationAdvisorSession
- HomeRenovationComplianceChecklist | Purpose: Renovation advisor entity (session/output/evidence/checklist). | Ownership: global | Key fields: id, advisorSessionId, permitObtainedStatus, licensedContractorUsedStatus, reassessmentReceivedStatus, lastReviewedAt | Relationships: HomeRenovationAdvisorSession
- ClaimChecklistItem | Purpose: Claim workflow entity (claim, document, checklist, timeline). | Ownership: global | Key fields: id, claimId, status, title | Relationships: Claim, ClaimDocument, ClaimChecklistItemDocument
- ClaimChecklistItemDocument | Purpose: Claim workflow entity (claim, document, checklist, timeline). | Ownership: global | Key fields: id, claimChecklistItemId, claimDocumentId, item, claimDocument | Relationships: ClaimChecklistItem, ClaimDocument

## User / Preferences
- User | Purpose: Account and identity root. | Ownership: global | Key fields: id, status, email, phone, firstName, lastName | Relationships: Address, HomeownerProfile, ProviderProfile, Booking, Review, Message, +23 more
- Address | Purpose: Address entity for users/properties/providers. | Ownership: global | Key fields: id, userId, state, street1, street2, city | Relationships: User
- HomeownerProfile | Purpose: Homeowner profile and plan context. | Ownership: global | Key fields: id, userId, segment, closingDate, purchasePrice, preferredContactMethod | Relationships: User, Property, Checklist, HomeBuyerChecklist, Warranty, InsurancePolicy, +12 more
- Notification | Purpose: In-app notification entity. | Ownership: global | Key fields: id, userId, type, title | Relationships: User, NotificationDelivery, PropertyDailySnapshot, RecallMatch
- NotificationDelivery | Purpose: Per-channel delivery attempt entity. | Ownership: global | Key fields: id, status, notificationId, channel, sentAt, failureReason | Relationships: Notification
- AuditLog | Purpose: System audit trail entity. | Ownership: global | Key fields: id, userId, action, entityType, entityId, oldValues | Relationships: none
- SystemSetting | Purpose: Global key/value setting entity. | Ownership: global | Key fields: id, key, value, description | Relationships: none
- Review | Purpose: Booking review entity. | Ownership: global | Key fields: id, bookingId, status, title | Relationships: Booking, User
- Message | Purpose: Booking message entity. | Ownership: global | Key fields: id, bookingId, type, senderId, recipientId, content | Relationships: Booking, User
- Document | Purpose: File/document metadata linked across domains. | Ownership: property-scoped | Key fields: id, propertyId, bookingId, type, name | Relationships: Booking, Property, Warranty, InsurancePolicy, InventoryItem, HomeReportExport, +8 more
- ProviderProfile | Purpose: Provider business/profile entity. | Ownership: global | Key fields: id, userId, status, businessName, businessType, taxId | Relationships: User, Service, Certification, ProviderPortfolio, Booking, ProviderAvailability, +1 more
- ProviderAvailability | Purpose: Provider availability window entity. | Ownership: global | Key fields: id, startDate, endDate, providerProfileId, isAvailable, reason | Relationships: ProviderProfile
- ProviderPortfolio | Purpose: Provider portfolio media entity. | Ownership: global | Key fields: id, category, title, providerProfileId, description, imageUrl | Relationships: ProviderProfile
- Certification | Purpose: Provider certification/license entity. | Ownership: global | Key fields: id, name, providerProfileId, issuingAuthority, certificateNumber, issueDate | Relationships: ProviderProfile
- SellerPrepLead | Purpose: Seller prep lead capture record. | Ownership: property-scoped | Key fields: id, propertyId, userId, leadType, context, fullName | Relationships: none
- SellerPrepFeedback | Purpose: Seller prep feedback record. | Ownership: property-scoped | Key fields: id, propertyId, userId, rating, comment, page | Relationships: none
- SellerPrepPlan | Purpose: Seller prep plan container. | Ownership: property-scoped | Key fields: id, propertyId, userId, preferences, items, interviews | Relationships: SellerPrepPlanItem, AgentInterview
- SellerPrepPlanItem | Purpose: Seller prep plan task item. | Ownership: global | Key fields: id, status, priority, title | Relationships: SellerPrepPlan
- AgentInterview | Purpose: Seller-side agent interview record. | Ownership: global | Key fields: id, planId, agentName, isFavorite, totalScore, plan | Relationships: SellerPrepPlan
- InspectionReport | Purpose: Generated report entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, inspectionDate, inspectorName, inspectorCompany | Relationships: Property, InspectionIssue
- InspectionIssue | Purpose: Issue extracted from an inspection report. | Ownership: global | Key fields: id, reportId, category, severity, title | Relationships: InspectionReport
- MovingPlan | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, closingDate, planData, completedTasks, property | Relationships: Property
- CityFeatureFlag | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, state, city, eventsEnabled, servicesEnabled, alertsEnabled | Relationships: none
- KnowledgeArticle | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: global | Key fields: id, status, title, publishedAt | Relationships: Document, KnowledgeArticleSection, KnowledgeArticleCategory, KnowledgeArticleTag, KnowledgeArticleToolLink, KnowledgeArticleCta, +3 more
- KnowledgeArticleSection | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: global | Key fields: id, title, articleId, sectionType, body, dataJson | Relationships: KnowledgeArticle, KnowledgeArticleToolLink, KnowledgeArticleCta, KnowledgeArticleEvent
- KnowledgeCategory | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: global | Key fields: id, name, slug, description, sortOrder, isActive | Relationships: KnowledgeArticleCategory
- KnowledgeTag | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: global | Key fields: id, name, slug, tagGroup, isActive, articles | Relationships: KnowledgeArticleTag
- KnowledgeArticleCategory | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: global | Key fields: category, articleId, categoryId, article | Relationships: KnowledgeArticle, KnowledgeCategory
- KnowledgeArticleTag | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: global | Key fields: articleId, tagId, article, tag | Relationships: KnowledgeArticle, KnowledgeTag
- ProductTool | Purpose: Feature-specific entity. | Ownership: global | Key fields: id, status, category, name | Relationships: KnowledgeArticleToolLink, KnowledgeArticleCta, KnowledgeArticleEvent
- KnowledgeArticleToolLink | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: global | Key fields: id, priority, articleId, productToolId, anchorSectionId, placement | Relationships: KnowledgeArticle, ProductTool, KnowledgeArticleSection
- KnowledgeArticleCta | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: global | Key fields: id, priority, title, articleId, productToolId, sectionId | Relationships: KnowledgeArticle, ProductTool, KnowledgeArticleSection
- KnowledgeAudienceRule | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: global | Key fields: id, priority, name, articleId, description, ruleJson | Relationships: KnowledgeArticle
- KnowledgeArticleRelation | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: global | Key fields: sourceArticleId, targetArticleId, relationType, sortOrder, sourceArticle, targetArticle | Relationships: KnowledgeArticle
- KnowledgeArticleEvent | Purpose: Knowledge CMS entity (content, taxonomy, links, or event telemetry). | Ownership: property-scoped | Key fields: id, propertyId, userId, sessionId | Relationships: KnowledgeArticle, User, Property, ProductTool, KnowledgeArticleSection
- HomeReportExport | Purpose: Feature-specific entity. | Ownership: property-scoped | Key fields: id, propertyId, userId, status, type | Relationships: Document, User, Property, HomeReportExportEvent
- HomeReportExportEvent | Purpose: Event-log entity. | Ownership: global | Key fields: id, reportId, type, report | Relationships: HomeReportExport
- HomeDigitalWill | Purpose: Digital will entity (sections, entries, trusted contacts). | Ownership: property-scoped | Key fields: id, propertyId, status, title, publishedAt | Relationships: Property, HomeDigitalWillSection, HomeDigitalWillTrustedContact
- HomeDigitalWillSection | Purpose: Digital will entity (sections, entries, trusted contacts). | Ownership: global | Key fields: id, type, title, digitalWillId, description, sortOrder | Relationships: HomeDigitalWill, HomeDigitalWillEntry
- HomeDigitalWillEntry | Purpose: Digital will entity (sections, entries, trusted contacts). | Ownership: global | Key fields: id, priority, title, summary | Relationships: HomeDigitalWillSection
- HomeDigitalWillTrustedContact | Purpose: Digital will entity (sections, entries, trusted contacts). | Ownership: global | Key fields: id, name, digitalWillId, email, phone, relationship | Relationships: HomeDigitalWill
- Claim | Purpose: Claim workflow entity (claim, document, checklist, timeline). | Ownership: property-scoped | Key fields: id, propertyId, status, type, title | Relationships: Property, User, InsurancePolicy, Warranty, ClaimChecklistItem, ClaimDocument, +2 more
- ClaimDocument | Purpose: Claim workflow entity (claim, document, checklist, timeline). | Ownership: global | Key fields: id, claimId, type, title | Relationships: Claim, Document, ClaimChecklistItem, ClaimTimelineEvent, ClaimChecklistItemDocument


## 3. Relationship map (high-level)

- `Property` is the dominant aggregate root (87 inbound + 87 outbound relations); most operational domains hang off it directly.
- `User` is the identity root; it fans into homeowner/provider profiles plus activity/event/audit tables.
- `HomeownerProfile` anchors consumer-side financial/insurance/planning records and then links to `Property`.
- `InventoryRoom` -> `InventoryItem` is the room/item spine; inventory links into maintenance, incidents, timeline, recall, guidance, and capital planning.
- Service marketplace path: `User` (provider) -> `ProviderProfile` -> `Service` -> `Booking` -> (`Payment`, `Message`, `Review`, `BookingTimeline`, `Document`).
- Insurance path: `InsurancePolicy` / `Warranty` / `InsuranceQuoteRequest` / `Claim` / `ClaimDocument` / `ClaimChecklistItem` / `ClaimTimelineEvent`.
- Intelligence/risk path: `SignalProvenance` + `GuidanceSignal/Journey` + `Incident*` + `Radar*` + `HomeRisk*` + `HomeScore*` + `PropertyScoreSnapshot`.
- Recommendation/action path: `Checklist*`, `Seasonal*`, `PropertyHabit*`, `ToolOverride`, `ServiceRadarUserAction`, `HomeRenovation*`, `PropertyHiddenAsset*`.
- Timeline/event path: `HomeEvent` + `HomeEventDocument` + `DomainEvent` + `LocalUpdate*` + `Gazette*` + analytics snapshots/events.

## 4. Observed inconsistencies

### Overlapping models

- `HomeAsset` vs `InventoryItem` vs `HomeItem` all model in-home entities with partially overlapping semantics and cross-links.
- Checklist/task overlap across `ChecklistItem`, `RoomChecklistItem`, `SeasonalChecklistItem`, `HomeBuyerTask`, `ClaimChecklistItem`, and `PropertyMaintenanceTask`.
- Event overlap across `HomeEvent`, `DomainEvent`, `ClaimTimelineEvent`, `BookingTimeline`, `IncidentEvent`, `LocalUpdateEvent`, `KnowledgeArticleEvent`, and `ProductAnalyticsEvent`.
- Risk/recommendation overlap among `RiskAssessmentReport`, `FinancialEfficiencyReport`, `HomeScoreReport`, `PropertyScoreSnapshot`, `RiskPremiumOptimizationAnalysis`, `HomeCapitalTimelineAnalysis`, and `DoNothingSimulationRun`.

### Unclear ownership

Global child tables that are logically property-scoped only through parent foreign key:

- `HomeScoreReportSection`, `HomeScoreCertification`, `HomeScoreCertificationCheck`, `HomeScoreReportEvidenceLink`, `HomeScoreShareToken`, `HomeScoreExportJob`.
- `HomeDigitalWillSection`, `HomeDigitalWillEntry`, `HomeDigitalWillTrustedContact`.
- `ClaimDocument`, `ClaimChecklistItem`, `ClaimChecklistItemDocument`.
- `NegotiationShieldInput`, `NegotiationShieldDocument`, `NegotiationShieldAnalysis`, `NegotiationShieldDraft`.
- `HomeRenovationPermitOutput` and related `HomeRenovation*Requirement/*Stage/*Assumption/*DataPoint/*Checklist`.
- Inventory pipeline internals `InventoryOcrField`, `InventoryDraftBox`, `InventoryScanImage`, `InventoryScanDelta`.
- Radar/action internals `PropertyRadarState`, `PropertyRadarAction`, `ServiceRadarCheckSystemLink`, `ServiceRadarUserAction`.

### Models that appear deprecated or unused (schema-isolated)

No FK in/out in Prisma model graph:

- `ServiceCategoryConfig`, `SystemComponentConfig`, `FinancialEfficiencyConfig`, `MaintenanceTaskTemplate`.
- `CommunityEvent`, `CityFeatureFlag`.
- `SellerPrepLead`, `SellerPrepFeedback`.
- `OrchestrationActionEvent`, `OrchestrationActionSnooze`, `OrchestrationDecisionTrace`.
- `DomainEvent`.
- `HomeScoreBenchmarkSnapshot`, `HomeSavingsCategory`, `ServicePriceBenchmark`.
- `IncidentSuppressionRule`, `RadarSourceConfig`, `NeighborhoodScanJob`.
- `AuditLog`, `SystemSetting`.
- `FeatureAnalyticsDailyRollup`, `AdminAnalyticsDailySnapshot`, `AnalyticsCohortSnapshot`.

### Cross-schema inconsistency

- Backend schema contains 51 models absent from worker schema (notably `Guidance*`, `HomeDigitalTwin*`, `HomeRenovation*`, `PropertyHabit*`, `Gazette*`, refinance models, plant models, analytics rollups), indicating backend/worker schema drift.
