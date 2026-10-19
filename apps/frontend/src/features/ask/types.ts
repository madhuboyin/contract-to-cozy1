export type AskExecutionStatus =
  | 'RECEIVED' | 'ROUTING' | 'NEEDS_PROPERTY' | 'NEEDS_ENTITY'
  | 'NEEDS_CLARIFICATION' | 'NEEDS_CONTEXT' | 'READY_WITH_LIMITATIONS'
  | 'NEEDS_CONFIRMATION' | 'RUNNING' | 'ANSWERED' | 'COMPLETED'
  | 'NOT_APPLICABLE' | 'UNAVAILABLE' | 'OUT_OF_SCOPE' | 'BLOCKED'
  | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL' | 'CANCELLED' | 'EXPIRED';

export interface AskAction {
  id: string;
  label: string;
  href?: string;
  interactionType?: 'START_WORKFLOW';
  message?: string;
  operationId?: string;
  /** Registered semantic outcome used by the server to deduplicate richer and compact action surfaces. */
  outcomeKey?: string;
  capabilityId?: string;
  entityType?: string;
  entityId?: string;
  actionId?: string;
  style: 'PRIMARY' | 'SECONDARY' | 'QUIET';
}

// ASK_COZY_INTERACTION_MODEL_UI_FRD §7 (ACT-001/ACT-003): a declared item
// command (e.g. "Complete", "Reschedule" on a maintenance row), not a
// navigation link -- `message` is sent back through the normal ask() path
// with the item's own id/entityType as launchContext, so the server (not a
// client-guessed href) resolves and authorizes the actual write.
// ACT-001/ACT-003: declared interaction semantics and registered operation,
// distinct from the label/message a human reads.
export type AskItemActionInteractionType = 'CONVERSATION_CONTINUE' | 'FILTER_RESULT' | 'MUTATE_RECORD' | 'NAVIGATE' | 'CONFIRM' | 'EDIT_PROPOSAL' | 'REFRESH' | 'DISMISS' | 'REMIND_LATER';

// Presentation Quality 2A: a producer-declared account of how much of a collection this block carries. Mirrors the backend contract.
export interface AskCollectionDescriptor {
  sourceTotal: number | null;
  fetchedCount: number;
  deliveredCount: number;
  nextPageAvailable: boolean;
  deliveryTruncated: boolean;
}

export interface AskGroupedListItemAction {
  id: string;
  label: string;
  message: string;
  style: 'PRIMARY' | 'SECONDARY' | 'QUIET';
  interactionType: AskItemActionInteractionType;
  operationId: string;
}

// ACT-001 FILTER_RESULT: a declared, clickable filter chip.
export interface AskGroupedListFilter {
  id: string;
  label: string;
  message: string;
  active: boolean;
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.72): shared display-pattern types. Mirrors ask.contract.ts.
export type AskDisplayTone = 'DEFAULT' | 'POSITIVE' | 'CAUTION' | 'CRITICAL';
export interface AskAnswerChip { label: string; tone: AskDisplayTone }
export interface AskGroupedListItem {
  id: string;
  title: string;
  description?: string | null;
  condition?: string | null;
  meta: string[];
  status?: string | null;
  href?: string | null;
  entityType?: string | null;
  parentId?: string | null;
  actions?: AskGroupedListItemAction[];
  tone?: AskDisplayTone;
  timingLabel?: string | null;
  amountLabel?: string | null;
  proportionPercent?: number | null;
  floorLevel?: number | null;
  countLabel?: string | null;
  badgeLabel?: string | null;
  needsInfo?: boolean;
  detail?: string | null;
}
export type AskGroupedListPresentation =
  | { pattern: 'CHOICE_GRID' }
  | { pattern: 'BUDGET_BREAKDOWN'; summary?: { annual: string; monthly: string; peakMonth: string; peakAmount: string; confidence: string }; plan?: { headline: string; guidance: string; peakDelta: string; topDrivers: string[] }; costMix?: Array<{ label: string; annual: string; monthly: string; proportionPercent: number }>; calculation?: { basis: string; factors: string[]; improvements: string[] } }
  | { pattern: 'STATUS_ACCORDION' }
  | { pattern: 'SHELVES' }
  | { pattern: 'DECK'; swipeRightActionId?: string | null; swipeLeftActionId?: string | null; batch?: AskDeckBatch | null }
  | { pattern: 'ROOM_MAP'; focused?: boolean };
export interface AskBatchDecision { entityId: string; actionId: string }
// IW-PRES-015: decisions made with these item actions are collected in the deck and sent together, for one confirmation.
export interface AskDeckBatch { operationId: string; entityType: string; actionIds: string[]; message: string }
export interface AskComparisonBadge { label: string; basis: string; policyCode: string }

export type AskTaskGuideProgress = { current: number; total: number; completed: number; skipped: number; label: string; asOf: string };
export type AskTaskGuideOutlineEntry = { stepId: string; title: string; state: 'DONE' | 'SKIPPED' | 'CURRENT' | 'UPCOMING'; optional: boolean };
export interface AskTaskGuideChip { label: string; kind: 'PRIORITY_HIGH' | 'PRIORITY' | 'TIME' | 'COST' | 'DIY' | 'PRO' | 'DATE' | 'STATUS' | 'TAG' }

export type AskPresentationBlock =
  | {
    type: 'TASK_GUIDE'; id: string; title: string; summary: string; eyebrow: string[];
    icon: 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'ROOF' | 'OUTDOOR' | 'SAFETY' | 'APPLIANCE' | 'HABIT' | 'TASK';
    chips: AskTaskGuideChip[]; tip?: { title: string; body: string } | null;
    main?: { title: string; body: string; facts: Array<{ label: string; value: string }> } | null;
    history: Array<{ label: string; value: string }>; notes: Array<{ id: string; title: string; body: string; actionId?: string }>; actions: AskAction[];
    /** A RENDERED SNAPSHOT of where the person is in a stepped guide (docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md). Display only: the block owns no progress. */
    progress?: AskTaskGuideProgress;
    /** One entry per step, in order. Presence of an outline is what makes a TASK_GUIDE a stepped guide ("guide mode"). */
    outline?: AskTaskGuideOutlineEntry[];
  }
  | { type: 'SUMMARY'; id: string; title: string; body: string; tone: 'DEFAULT' | 'POSITIVE' | 'CAUTION' | 'CRITICAL'; actions: AskAction[]; chips?: AskAnswerChip[]; headline?: string; supportLine?: string }
  | { type: 'PROACTIVE_INSIGHT'; id: string; title: string; body: string; tone: 'DEFAULT' | 'POSITIVE' | 'CAUTION' | 'CRITICAL'; triggerSource: string; actions: AskAction[] }
  | { type: 'GROUPED_LIST'; id: string; title: string; description?: string | null; listDensity?: 'DENSE'; sections: Array<{ id: string; title: string; caption?: string | null; count: number; offset?: number; initialVisibleCount?: number; items: AskGroupedListItem[] }>; actions: AskAction[]; filters: AskGroupedListFilter[]; presentation?: AskGroupedListPresentation; collection?: AskCollectionDescriptor }
  | { type: 'TABLE'; id: string; title: string; description?: string | null; preferredPresentation?: 'AUTO' | 'TABLE' | 'CARDS'; columns: Array<{ key: string; label: string }>; rows: Array<{ id: string; values: Record<string, string> }>; totalCount?: number; actions: AskAction[] }
  | { type: 'CAPABILITY_LIST'; id: string; title: string; description?: string | null; capabilities: Array<{ id: string; label: string; description: string; expectedOutput: string; href: string; inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE'; operationId: string; message: string } | null; inlineBoundary: string; readiness: 'READY' | 'NEEDS_PROPERTY' | 'NEEDS_CONTEXT' | 'UNAVAILABLE' | 'AVAILABLE'; readinessLabel: string | null; readinessReasons: string[]; releaseStage: 'ACTIVE' | 'BETA' }> }
  | { type: 'EVIDENCE'; id: string; title: string; items: Array<{ label: string; source: string | null; observedAt: string | null; claim?: { targetBlockId: string; targetItemId: string | null; text: string } | null }> }
  | { type: 'BOUNDARY'; id: string; title: string; body: string; severity: 'INFO' | 'CAUTION' | 'EMERGENCY'; suggestions: string[]; actions?: AskAction[] }
  | { type: 'MONITOR'; id: string; monitorId: string; title: string; status: 'ACTIVE' | 'PAUSED' | 'STOPPED'; threshold: string; product: string; channel: string; cadence: string; quietHours: string | null; sourceBoundary: string; actions: AskAction[] }
  | { type: 'WORKFLOW_PROGRESS'; id: string; title: string; status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'; description: string; details: Array<{ label: string; value: string }>; actions: AskAction[] }
  | { type: 'OUTPUT_ARTIFACTS'; id: string; title: string; items: Array<
    | { artifactType: 'PROPERTY_MAINTENANCE_TASK'; artifactId: string; relationship: 'CREATED'; label: string; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NEEDS_REVIEW'; createdAt: string; navigation: { label: string; href: string } | null }
    | { artifactType: 'QUOTE_COMPARISON_WORKSPACE'; artifactId: string; relationship: 'CREATED' | 'REUSED'; label: string; status: 'DRAFT' | 'SHORTLISTED' | 'DECIDED' | 'ARCHIVED'; createdAt: string; navigation: { label: string; href: string } | null }
  > }
  | { type: 'RELATED_RECORDS'; id: string; title: string; relationships: Array<{ relationshipType: 'DOCUMENT_EVIDENCE_FOR_HOME_EVENT'; source: { recordType: 'DOCUMENT'; recordId: string; label: string }; target: { recordType: 'HOME_EVENT'; recordId: string; label: string }; navigation: { label: string; href: string } | null }> }
  | { type: 'METRIC_ROW'; id: string; title: string; description?: string | null; metrics: Array<{ label: string; value: string; detail?: string | null; tone: 'DEFAULT' | 'POSITIVE' | 'CAUTION' | 'CRITICAL' }> }
  | { type: 'TIMELINE'; id: string; title: string; description?: string | null; controls?: { search: boolean; typeFilter: boolean; dateFilter: boolean; limitFilter: boolean; selectionExport: boolean; annualRecap: boolean; storyPlayback: boolean }; items: Array<{ id: string; label: string; date?: string | null; description?: string | null; status?: string | null; href?: string | null; category?: { id: string; label: string } | null; datePrecision?: 'DAY' | 'MONTH' | 'YEAR' | null; entityType?: string | null; actions?: AskGroupedListItemAction[]; meta?: string[]; detail?: { facts: Array<{ label: string; value: string }>; evidence: Array<{ label: string; meta?: string | null }>; canReviewVerification?: boolean; canAttachEvidence?: boolean } | null }> }
  | { type: 'COMPARISON'; id: string; title: string; description?: string | null; options: Array<{ id: string; label: string; summary?: string | null; badge?: AskComparisonBadge | null; badges?: AskComparisonBadge[]; amount?: { value: number; currency: string } | null; attributes: Array<{ label: string; value: string; tone: 'DEFAULT' | 'POSITIVE' | 'CAUTION' | 'CRITICAL'; leading?: boolean }>; actions: AskAction[] }>; actions: AskAction[] }
  | { type: 'DECISION_TRACE'; id: string; title: string; steps: Array<{ label: string; detail: string; outcome?: string | null }> }
  | { type: 'DECISION_PROGRESS'; id: string; title: string; decisionThreadId: string; lifecycleStatus: 'OPEN' | 'GATHERING_CONTEXT' | 'READY_TO_COMPARE' | 'RECOMMENDATION_AVAILABLE' | 'ACTION_IN_PROGRESS' | 'DECIDED' | 'COMPLETED' | 'ABANDONED' | 'ARCHIVED'; contextStatus: 'CURRENT' | 'STALE' | 'CONFLICTED'; verdict: string | null; reasonCodes: string[]; limitationCodes: string[]; contextIssueCodes: string[]; confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null; generatedAt: string | null; actions: AskAction[] }
  | { type: 'SCENARIO_COMPARISON'; id: string; title: string; decisionThreadId: string; scenarioId: string; baseline: { label: string; verdict: string; reasonCodes: string[]; limitationCodes: string[] }; scenario: { label: string; verdict: string; reasonCodes: string[]; limitationCodes: string[]; assumptions: Array<{ label: string; value: string }> }; comparisonDirection: 'SCENARIO_FAVORS_REPLACE' | 'SCENARIO_FAVORS_REPAIR' | 'NO_CHANGE'; actions: AskAction[] }
  | { type: 'PREFERENCE_REFERENCE'; id: string; title: string; preferenceKey: string; summary: string; visibility: 'PRIVATE' | 'OWNER_ONLY' | 'HOUSEHOLD_SUMMARY' | 'HOUSEHOLD_DETAIL'; confirmedAt: string | null; expiresAt: string | null }
  | { type: 'WHY_NOW'; id: string; title: string; triggerCodes: string[]; evidenceCodes: string[]; timingNote: string | null; confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null }
  | { type: 'RECOMMENDATION_CHANGE'; id: string; title: string; decisionThreadId: string; previousVerdict: string; currentVerdict: string; category: 'MATERIAL' | 'CONFIDENCE_ONLY' | 'SYSTEM_METHOD_ONLY' | 'UNCHANGED'; changedFactors: string[]; changedAt: string }
  | { type: 'CHANGE_SUMMARY'; id: string; title: string; source: string; changeType: 'SOURCE_RECORD_CREATED' | 'SOURCE_RECORD_REVISED' | 'SOURCE_LIFECYCLE_CHANGED' | 'PROPERTY_FACT_CHANGED' | 'ACTION_STATE_CHANGED' | 'OUTCOME_CONFIRMED' | 'SOURCE_HEALTH_CHANGED' | 'DOCUMENT_PROMOTED'; summary: string; effectiveAt: string | null; detectedAt: string; materiality: 'INFORMATIONAL' | 'MEANINGFUL' | 'IMPORTANT' | 'URGENT'; materialityReasonCodes: string[]; confidence: number | null; linkedAction: { label: string; href: string } | null; reviewAction: AskAction | null }
  | { type: 'PRIORITY_LIST'; id: string; title: string; propertyId: string; rankingPolicyVersion: string; generatedAt: string; sourceFreshnessAt: string | null; truncated: boolean; items: Array<{ homeActionId: string; title: string; consumerPriority: 'DO_NOW' | 'PLAN_SOON' | 'WATCH' | 'OPTIONAL' | 'NO_ACTION'; comparativeReasonCodes: string[]; confidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH'; deadlineAt: string | null; dependencyRefs: string[]; cta: AskAction | null; inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE'; operationId: 'HOME_ACTIONS'; message: string } | null; watchState: string | null; suppressed: boolean; completed: boolean; unavailable: boolean; stale: boolean }> }
  | { type: 'OUTCOME_SUMMARY'; id: string; title: string; decisionThreadId: string; entries: Array<{ outcomeObservationId: string; recommendationSnapshotId: string; observedType: string; occurredAt: string; verificationStatus: 'REPORTED' | 'CORROBORATED' | 'VERIFIED' | 'REJECTED' | 'SUPERSEDED'; sourceLabel: string; relationshipType: 'SELECTED_OPTION' | 'ACTION_STARTED' | 'ACTION_COMPLETED' | 'COST_OBSERVED' | 'TIMING_OBSERVED' | 'RESULT_OBSERVED'; attributionConfidence: number | null; reviewStatus: 'PENDING' | 'CONFIRMED' | 'DISPUTED' | 'REJECTED'; comparable: boolean; observedCostLabel: string | null; predictedCostLabel: string | null; note: string | null }>; limitation: string }
  | { type: 'ASSUMPTIONS'; id: string; title: string; items: string[] }
  | { type: 'LIMITATION'; id: string; title: string; body: string; severity: 'INFO' | 'CAUTION' }
  | { type: 'EMPTY_STATE'; id: string; title: string; body: string; actions: AskAction[] }
  | { type: 'ERROR_STATE'; id: string; title: string; body: string; retryable: boolean; actions: AskAction[] }
  | { type: 'LIFESPAN'; id: string; title: string; description?: string | null; basis: string; items: Array<{ id: string; label: string; ageYears: number; typicalLifeYears: { min: number; max: number }; status: 'WITHIN_RANGE' | 'PLAN_AHEAD' | 'PAST_RANGE'; statusLabel: string; entityType?: string | null; actions?: AskGroupedListItemAction[]; meta?: string[] }>; missingAge: Array<{ id: string; label: string; entityType?: string | null; actions?: AskGroupedListItemAction[] }>; missingAgeTitle?: string | null; collection?: AskCollectionDescriptor }
  | { type: 'PROGRESS'; id: string; title: string; description?: string | null; percent: number; basis: string; metrics: Array<{ label: string; value: string; tone: AskDisplayTone }>; nextSteps: AskGroupedListItem[]; actions: AskAction[] }
  | {
    type: 'ENVIRONMENT_REPORT';
    id: string;
    title: string;
    summary: string;
    generatedAt: string;
    property: { name?: string | null; address: string; city: string; state: string; zipCode: string };
    location: { latitude: number | null; longitude: number | null; countyFips: string | null; zipCode: string | null };
    conditionSourcesComplete: boolean;
    insights: Array<{
      id: string;
      category: 'rain' | 'snow' | 'freeze' | 'heat' | 'storm' | 'air_quality' | 'drought';
      severity: 'info' | 'watch' | 'action';
      title: string;
      summary: string;
      homeImplication: string;
      timeframe: string;
      effectiveFrom: string;
      effectiveTo: string;
      affectedSystems: string[];
      recommendedActions: string[];
      source: string;
      relatedIncidentId?: string | null;
      isOfficialAlert?: boolean;
      entityType?: string | null;
      entityId?: string | null;
      actions: AskGroupedListItemAction[];
    }>;
    preparations: Array<{
      id: string;
      insightId: string;
      title: string;
      summary: string;
      timeframe: string;
      status: string;
      progress: { completed: number; skipped: number; resolved: number; total: number };
      items: Array<{
        id: string;
        entityId: string;
        entityType: string;
        label: string;
        status: 'CREATED' | 'COMPLETED' | 'CANCELED';
        sortOrder: number;
        actions: AskGroupedListItemAction[];
      }>;
    }>;
    questions: Array<{
      id: string;
      insightId: string;
      field: string;
      prompt: string;
      reason: string;
      entityType?: string | null;
      entityId?: string | null;
      actions: AskGroupedListItemAction[];
    }>;
    plantAdvisorModules: Array<{
      id: string;
      trigger: 'heat' | 'freeze' | 'low_humidity' | 'storm' | 'air_quality';
      relatedInsightId: string | null;
      title: string;
      summary: string;
      contextLevel: 'added_plants' | 'saved_recommendations' | 'room_profiles' | 'setup';
      plantNames: string[];
      roomNames: string[];
      actions: AskGroupedListItemAction[];
    }>;
    longTermHazardContext?: {
      state: string;
      checkedThrough: string | null;
      emptyState: string | null;
      hazards: Array<{
        propertyMatchId: string;
        hazardType: string;
        hazardLabel: string;
        title: string;
        factualSummary: string | null;
        lifecycleStatus: string;
        precision?: string | null;
        distanceMiles?: number | null;
        provider?: string | null;
      }>;
      actions: AskGroupedListItemAction[];
    } | null;
    sections: {
      weather: {
        status: 'ok' | 'unavailable';
        reason?: string;
        fetchedAt?: string;
        data?: {
          current: {
            temperatureF: number;
            apparentTemperatureF: number;
            humidityPercent: number;
            windSpeedMph: number;
            precipitationIn: number;
            weatherCode: number;
            isDay?: boolean;
            observedAt: string;
          };
          hourly: Array<{
            time: string;
            temperatureF: number;
            precipitationProbabilityPercent: number;
            weatherCode: number;
          }>;
          tenDayForecast: Array<{
            date: string;
            tempMaxF: number;
            tempMinF: number;
            precipitationSumIn: number;
            weatherCode: number;
          }>;
          thirtyDayHistory: Array<{
            date: string;
            tempMaxF: number;
            tempMinF: number;
            precipitationSumIn: number;
          }>;
        };
      };
      airQuality: {
        status: 'ok' | 'unavailable';
        reason?: string;
        fetchedAt?: string;
        data?: {
          current: { aqi: number; pm2_5: number; pm10: number; observedAt: string };
          history: Array<{ date: string; avgAqi: number; avgPm2_5: number }>;
        };
      };
      drought: {
        status: 'ok' | 'unavailable';
        reason?: string;
        fetchedAt?: string;
        data?: {
          current: {
            date: string;
            dominantCategory: 'None' | 'D0' | 'D1' | 'D2' | 'D3' | 'D4';
            percentArea: Record<string, number>;
          } | null;
          history: Array<{
            date: string;
            dominantCategory: 'None' | 'D0' | 'D1' | 'D2' | 'D3' | 'D4';
            percentArea: Record<string, number>;
          }>;
        };
      };
      floodElevation: {
        status: 'ok' | 'unavailable';
        reason?: string;
        fetchedAt?: string;
        data?: { femaFloodZone: string | null; femaZoneSubtype: string | null; elevationFeet: number | null };
      };
      radon: {
        status: 'ok' | 'unavailable';
        reason?: string;
        fetchedAt?: string;
        data?: { zone: 1 | 2 | 3; zoneDescription: string; countyName: string | null; stateName: string | null };
      };
      hazards: {
        status: 'ok' | 'unavailable';
        reason?: string;
        fetchedAt?: string;
        data?: {
          facilities: Array<{
            registryId: string;
            name: string;
            address: string;
            programs: string[];
            complianceStatus: string | null;
            significantNoncompliance: boolean;
            inspectionCount: number;
            lastInspectionDate: string | null;
            penaltyCount: number;
            latitude: number | null;
            longitude: number | null;
            distanceMiles: number | null;
          }>;
          totalFacilitiesInRadius: number;
          totalPenaltiesInRadius: string | null;
          searchRadiusMiles: number;
        };
      };
      climate: {
        status: 'ok' | 'unavailable';
        reason?: string;
        fetchedAt?: string;
        data?: {
          normals: {
            status: 'ok' | 'unavailable';
            reason?: string;
            fetchedAt?: string;
            data?: {
              stationId: string;
              stationName: string;
              monthly: Array<{
                month: number;
                avgTempF: number | null;
                avgHighF: number | null;
                avgLowF: number | null;
              }>;
              annualHeatingDegreeDays: number | null;
              annualCoolingDegreeDays: number | null;
            };
          };
          hardinessZone: {
            status: 'ok' | 'unavailable';
            reason?: string;
            fetchedAt?: string;
            data?: { zone: string; temperatureRangeF: string };
          };
        };
      };
    };
    actions: AskAction[];
  };

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN §4: the server-authored compact follow-up. Mirrors the backend
// SuggestedNextActionSchema; the client renders `label`, submits only the id + source execution on selection, and never
// supplies the operation or entity (the server resolves them from its stored ledger).
export interface SuggestedNextAction {
  id: string;
  outcomeKey: string;
  label: string;
  message: string;
  operationId: string;
  interactionType: 'CONVERSATION_CONTINUE' | 'MUTATE_RECORD' | 'START_WORKFLOW';
  entityContext: { propertyId: string | null; entityType: string | null; entityId: string | null; contextVersion: string | null };
  eligibility: { state: 'ELIGIBLE' | 'NEEDS_CONTEXT'; reasonCodes: string[]; missingFactKeys: string[] };
  provenance: { source: string; sourceOperationId: string | null; sourceExecutionId: string | null; reasonCodes: string[] };
  createdAt: string;
  expiresAt: string;
  priority: { tier: 'CONTINUE' | 'RECORD_ACTION' | 'RELATED' | 'DISCOVERY'; score: number };
}

export interface SuggestedNextActionSelection {
  suggestedActionId: string;
  suggestedActionFromExecutionId: string;
  message: string;
}

export interface AskExecutionResponse {
  schemaVersion: '1.0';
  executionId: string;
  sessionId: string;
  question: string;
  status: AskExecutionStatus;
  property: { id: string; label: string } | null;
  skill?: { id: string; version: string; domain: string } | null;
  skillHandoff?: {
    suggestedNextSkillId: string;
    suggestedGoal: string;
    /** Display-only button text nominated by the handler; absent on executions persisted before FRD v1.166. */
    suggestedLabel?: string | null;
    reasonCodes: string[];
    contextReferenceIds: string[];
    continuity: {
      propertyId: string | null;
      sourceEntityType: string | null;
      sourceEntityId: string | null;
      sourceHomeActionId: string | null;
      decisionThreadId: string | null;
      workItemId: string | null;
      journeyId: string | null;
      contextVersion: string | null;
      returnDestination: string | null;
    };
  } | null;
  operation: { id: string; version: string; family: string } | null;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-003/MAINT-003: set only for a bare
  // filter refinement of an existing read result (e.g. "only show urgent").
  continuesExecutionId?: string | null;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001: frozen the first time this
  // execution's result was computed; `blocks` above is always current data.
  originalResponse?: { blocks: AskPresentationBlock[]; observedAt: string } | null;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001-005/HAND-001-003: "what the
  // homeowner is currently viewing," stable across chip clicks/refreshes
  // of the SAME interactive result (resultId), separate from executionId.
  viewState?: { resultId: string; domainScopePhrase: string | null; dateScopePhrase: string | null; statusFilter: string; selectedTaskId: string | null; queryMessage?: string | null; collectionOffsets?: Record<string, number>; revision: number } | null;
  contextVersion: string | null;
  blocks: AskPresentationBlock[];
  captureRequests: AskCaptureRequest[];
  confirmation: AskConfirmation | null;
  clarification: AskClarification | null;
  correctionCapabilities: {
    intent: boolean;
    entity: boolean;
    homeRecord: boolean;
    retryResponse: boolean;
  };
  suggestions: string[];
  /** True when this result passed through the server-governed action finalizer; string suggestions are historical-only thereafter. */
  suggestedNextActionsGoverned?: boolean;
  /** Absent on executions persisted before the typed contract; those keep rendering from `suggestions`. */
  suggestedNextActions?: SuggestedNextAction[];
  createdAt: string;
  updatedAt: string;
  // Ask Cozy Stage 3, Phase 3 (implementation plan §9/§19; FRD §16/§28). A
  // synchronous conversational-capture attempt (a fact/event the homeowner
  // mentioned in passing, e.g. "I replaced the roof last summer for
  // $14,500.") delivers its own confirmation-required child execution here,
  // in the SAME turn's response that triggered it -- not a separate fetch.
  // Bounded to 3, one level deep (a child's own childExecutions is always
  // []): matches the backend's AskExecutionResponseSchema exactly.
  childExecutions: AskExecutionResponse[];
}

export interface AskPendingWorkItem {
  pendingKind: 'CLARIFICATION' | 'PROPERTY_SELECTION' | 'ENTITY_SELECTION' | 'CONTEXT_CAPTURE' | 'CONFIRMATION' | 'COMMAND_RECOVERY';
  actionLabel: string;
  execution: AskExecutionResponse;
}

export interface AskRecentSessionSummary {
  sessionId: string;
  title: string;
  property: { id: string; label: string };
  latestStatus: AskExecutionStatus;
  latestExecutionId: string;
  executionCount: number;
  lastActiveAt: string;
  // IW-HIST-009..011: lifecycle state for the rail's session menu.
  pinned: boolean;
  archived: boolean;
  titleSetByUser: boolean;
}

export interface AskRecentSessionPage {
  items: AskRecentSessionSummary[];
  nextCursor: string | null;
  // IW-HIST-003: the pinned group, sent with the first page of the recent list only.
  pinned?: AskRecentSessionSummary[];
}

export type AskSessionChange = { title: string } | { pinned: boolean } | { archived: boolean };

export interface AskClarification {
  version: number;
  question: string;
  options: Array<{ operationId: string; label: string }>;
  allowFreeText: boolean;
  expiresAt: string;
}

export interface SubmitAskClarificationPayload {
  clarificationVersion: number;
  idempotencyKey: string;
  operationId?: string;
  answer?: string;
}

export interface AskFeedbackResponse {
  id: string;
  rating: 'UP' | 'DOWN';
}

// ASK_COZY_INTERACTION_MODEL_UI_FRD §8 (CONF-002/CONF-003): a declared,
// typed field the homeowner may change before confirming. The value is always
// a string: DATE is YYYY-MM-DD, MONEY is dollars with up to two decimals, and
// SELECT is one of `options`.
export interface AskConfirmationEditableField {
  key: string;
  label: string;
  type: 'DATE' | 'TEXT' | 'TEXTAREA' | 'SELECT' | 'MONEY';
  value: string;
  options?: Array<{ label: string; value: string }>;
}

export interface AskConfirmation {
  confirmationId: string;
  version: number;
  title: string;
  description: string;
  fields: Array<{ label: string; value: string }>;
  editableFields: AskConfirmationEditableField[];
  confirmLabel: string;
  consentText: string;
  expiresAt: string;
}

export interface EditAskConfirmationPayload {
  confirmationVersion: number;
  edits: Record<string, string>;
}

export interface AskCaptureRequest {
  requirementId: string;
  captureKey: string;
  classification: 'REQUIRED_APPLICABILITY' | 'REQUIRED_SAFETY' | 'REQUIRED_CALCULATION' | 'ENHANCEMENT_ACCURACY' | 'SCENARIO_INPUT' | 'PREFERENCE_INPUT' | 'WORKFLOW_INPUT';
  state: 'KNOWN' | 'UNKNOWN' | 'CONFLICTED' | 'STALE';
  title: string;
  question: string;
  helpText: string | null;
  inputSchema: CaptureInputSchema;
  currentAnswer?: unknown;
  allowNotSure: boolean;
  sensitivity: 'STANDARD' | 'FINANCIAL' | 'SECURITY';
  destinationLabel: string | null;
  fallbackHref?: string | null;
  confirmationText: string | null;
  expectedContextVersion: string;
  presentation?: 'CONVERSATIONAL' | 'FORM';
  /** The homeowner may skip this question for now; skipping saves nothing (Property Summary per-area capture). */
  skippable?: boolean;
}

export interface SubmitAskCapturePayload {
  requirementId: string;
  captureKey: string;
  expectedContextVersion: string;
  idempotencyKey: string;
  answer: Record<string, unknown>;
  sensitiveDataConfirmed?: boolean;
}

export interface CreateAskExecutionPayload {
  clientRequestId: string;
  sessionId: string;
  message: string;
  propertyId?: string | null;
  /** Proof that this turn selects an app-offered action (plan §4.1). The server, not this payload, decides operation/entity. */
  suggestedActionSelection?: SuggestedNextActionSelection;
  launchContext?: {
    surface: string;
    capabilityId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    actionId?: string | null;
    decisionThreadId?: string | null;
    workItemId?: string | null;
    journeyId?: string | null;
    contextVersion?: string | null;
    returnTo?: string | null;
    sourceExecutionId?: string | null;
    /** Telemetry only (FRD v1.168): the execution whose Skill-handoff card was clicked. Distinct from sourceExecutionId, which drives in-place refresh. */
    handoffFromExecutionId?: string | null;
    // Capability discovery lifecycle (IW-SHELL-021): which reviewed discovery entry started this turn, and from where. Bounded identifiers; the server
    // derives the capability and operation and ignores a claim that does not match the entry's operation and message.
    discovery?: AskDiscoveryClaim | null;
    operationId?: string | null;
    // ASK_COZY_INLINE_WORKSPACE_FRD Phase 3, evidence upload design (approved 2026-09-22): the id of a Document
    // already uploaded via POST /api/documents/property/:propertyId/evidence-upload, carried the same way
    // entityId carries an existing record's id.
    documentId?: string | null;
    // IW-PRES-015 (FRD v1.75): a card deck's collected decisions, sent together for one confirmation.
    batchDecisions?: AskBatchDecision[] | null;
  };
}
// Ask Intelligence FRD §18.4, Phase 9B "Concierge Home" — a dedicated
// composed read surface for the Ask starting page, distinct from
// AskExecutionResponse (no message, no execution created). See
// apps/backend/src/productFramework/conciergeHome.contract.ts for the
// authoritative shape.
export interface ConciergeHomeView {
  propertyId: string;
  generatedAt: string;
  journeyContext: {
    state: 'AVAILABLE' | 'UNKNOWN' | 'UNAVAILABLE';
    ownershipState: 'SHOPPING' | 'UNDER_CONTRACT' | 'RECENT_OWNER' | 'ESTABLISHED_OWNER' | 'PREPARING_TRANSFER' | 'UNKNOWN' | null;
    operatingMode: 'BUYING' | 'OWNING' | 'SELLING' | 'UNKNOWN';
    entryPath: 'EXISTING_OWNER_TRIGGER' | 'EXISTING_HOME_PURCHASE' | 'NEW_HOME_SETUP' | 'MAJOR_MOMENT' | 'EXPLORATION' | null;
    propertyOrigin: 'EXISTING_HOME' | 'NEW_CONSTRUCTION' | 'UNKNOWN' | null;
    contextVersion: string | null;
    capturedAt: string | null;
  };
  priorityList: {
    state: 'AVAILABLE' | 'NO_ACTION' | 'UNAVAILABLE';
    rankingPolicyVersion: string | null;
    generatedAt: string | null;
    items: Array<{
      homeActionId: string;
      title: string;
      askQuestion: string;
      askCategoryId: 'MAINTAIN' | 'PROTECT' | 'SAVE' | 'PLAN_MONITOR';
      askCategoryLabel: 'Maintain' | 'Protect' | 'Save' | 'Plan';
      subject?: AskConciergeSubject | null;
      rawPriority: 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER';
      consumerPriority: 'DO_NOW' | 'PLAN_SOON' | 'WATCH' | 'OPTIONAL' | 'NO_ACTION';
      comparativeReasonCodes: string[];
      confidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH';
      deadlineAt: string | null;
      cta: { label: string; href: string } | null;
      watchState: string | null;
      suppressed: boolean;
      completed: boolean;
      unavailable: boolean;
      stale: boolean;
    }>;
    truncated: boolean;
    href: string;
  };
  changes: {
    state: 'AVAILABLE' | 'NO_CHANGE' | 'UNAVAILABLE';
    windowDays: number;
    items: Array<{ id: string; source: string; summary: string; materiality: 'INFORMATIONAL' | 'MEANINGFUL' | 'IMPORTANT' | 'URGENT'; detectedAt: string; effectiveAt: string | null }>;
    href: string;
  };
  decisions: {
    state: 'AVAILABLE' | 'NO_DECISIONS' | 'UNAVAILABLE';
    items: Array<{ decisionThreadId: string; title: string; lifecycleStatus: string; contextStatus: string; verdict: string | null; confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null; subject?: AskConciergeSubject | null; updatedAt: string }>;
    href: string;
  };
  homeContinuity: {
    state: 'AVAILABLE' | 'UNAVAILABLE';
    decisions: Array<{
      id: string;
      title: string;
      summary: string | null;
      href: string;
      askQuestion: string;
      askCategoryId: 'MAINTAIN' | 'PROTECT' | 'SAVE' | 'PLAN_MONITOR';
      askCategoryLabel: 'Maintain' | 'Protect' | 'Save' | 'Plan';
    }>;
    activeMajorMoment: null | {
      kind: 'PROJECT' | 'GUIDANCE_JOURNEY';
      id: string;
      title: string;
      stage: string;
      context: string | null;
      blocker: string | null;
      nextMilestone: string;
      href: string;
    };
  };
  landingSpotlight?: { kind: 'ATTENTION' | 'DECISION'; entityId: string } | null;
  capabilityGroups: AskCapabilityGroup[];
  // Explore with Cozy: server-owned topics and starters. Optional only so older payloads and fixtures still parse.
  discoveryTopics?: AskDiscoveryTopic[];
  featuredPrompts: AskFeaturedPrompt[];
  suggestedQuestions: string[];
}

export type AskCapabilityCategoryId = 'UNDERSTAND' | 'MAINTAIN' | 'PROTECT' | 'SAVE' | 'DECIDE' | 'PLAN_MONITOR';

export interface AskConciergeSubject {
  kind: 'INVENTORY_ITEM' | 'CHECKLIST' | 'PROPERTY' | 'EVENT' | 'SALE_READINESS_ITEM' | 'GUIDANCE_JOURNEY' | 'WORK_ITEM';
  id: string;
  label: string;
}

export interface AskCapabilityPrompt {
  id: string;
  categoryId: AskCapabilityCategoryId;
  categoryLabel: string;
  question: string;
  // Capability explorer entries (server-owned, reviewed): a homeowner label, the registered operation a selection launches, approved
  // search aliases, and for a governed workflow the consequence stated before anything is confirmed. Absent on personalized prompts.
  label?: string;
  operationId?: string;
  aliases?: string[];
  note?: string;
  subject?: AskConciergeSubject;
  context?: {
    propertyId?: string;
    entityType?: string;
    entityId?: string;
    actionId?: string;
    capabilityId?: string;
    decisionThreadId?: string;
    workItemId?: string;
    journeyId?: string;
    contextVersion?: string;
    returnTo?: string;
    // ASK_COZY_INTERACTION_MODEL_UI_FRD MAINT-005/A12: the execution a row
    // action (e.g. "Complete") was clicked from, so its confirm handler can
    // refresh that still-visible list once the mutation succeeds.
    sourceExecutionId?: string;
    // Mirrors CreateAskExecutionPayload.launchContext.handoffFromExecutionId, above.
    handoffFromExecutionId?: string;
    // Mirrors CreateAskExecutionPayload.launchContext.discovery, above.
    discovery?: AskDiscoveryClaim;
    // ACT-001/ACT-003: a declared item action's own registered operation,
    // routing directly instead of relying on free-text pattern matching.
    operationId?: string;
    // ASK_COZY_INLINE_WORKSPACE_FRD Phase 3, evidence upload design (approved 2026-09-22): mirrors
    // CreateAskExecutionPayload.launchContext.documentId, above.
    documentId?: string;
    batchDecisions?: AskBatchDecision[];
  };
}

export type AskDiscoveryTopicId = 'HOME_CARE' | 'DIY_PROJECTS' | 'HOME_RECORD';

export interface AskDiscoveryClaim {
  entryId: string;
  surface: 'TOPIC' | 'EXPLORER' | 'LANDING_PROMPT';
  topicId?: AskDiscoveryTopicId | null;
}

// Mirrors AskDiscoveryTopic/AskDiscoveryStarter in backend conciergeHome.contract.ts. A starter launches through the ordinary Ask path:
// its message is the turn and its operationId rides in launchContext.operationId. Selecting a topic is client view state only.
export interface AskDiscoveryStarter {
  id: string;
  // Join keys for lifecycle telemetry: the reviewed entry this starter references and its capability, both from the server.
  entryId: string;
  capabilityId: string;
  label: string;
  message: string;
  operationId: string;
  // SELECT_TARGET: choosing it opens the domain-owned target selector named by `selectorId`; `message` is then only the idea's prompt and is never sent.
  interactionType: 'CONVERSATION_CONTINUE' | 'START_WORKFLOW' | 'SELECT_TARGET';
  selectorId: AskTargetSelectorId | null;
  availability: 'AVAILABLE' | 'NEEDS_CONTEXT' | 'UNAVAILABLE';
  reasonCodes: string[];
  entityContext: Record<string, string> | null;
}

export type AskTargetSelectorId = 'PROPERTY_AREA' | 'DIY_PROJECT';

// Mirrors AskTargetOption/AskTargetSelection in backend askTargetSelection.contract.ts (IW-SHELL-022). A selection is a READ; choosing an option launches
// the target operation through the ordinary Ask path, which revalidates everything itself.
export interface AskTargetOption {
  targetId: string;
  label: string;
  summary: string | null;
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  reasonCodes: string[];
  launch: { operationId: string; message: string; entityType: string; entityId: string };
}

export interface AskTargetSelection {
  selectorId: AskTargetSelectorId;
  propertyId: string;
  // UNAVAILABLE means the source could not be read; it is never an empty result.
  state: 'OPTIONS' | 'NONE_ELIGIBLE' | 'UNAVAILABLE';
  title: string;
  options: AskTargetOption[];
  explanation: string | null;
  truncated: boolean;
  generatedAt: string;
}

export interface AskDiscoveryTopic {
  id: AskDiscoveryTopicId;
  label: string;
  order: number;
  indicator: { label: string; value: number | string; sourceVersion: string | null; freshness: 'CURRENT' | 'STALE' | 'UNAVAILABLE' } | null;
  starters: AskDiscoveryStarter[];
}

export interface AskFeaturedPrompt extends AskCapabilityPrompt {
  source: 'PERSONALIZED' | 'DISCOVERY';
}

export interface AskCapabilityGroup {
  id: AskCapabilityCategoryId;
  label: string;
  description: string;
  capabilityIds: string[];
  prompts: AskCapabilityPrompt[];
}

import type { CaptureInputSchema } from '@/components/property-context/featureContextTypes';

// Record destination index (Sole Homeowner Interface Phase 2). Mirrors the backend `AskRecordIndex` contract.
export type AskRecordSectionState = 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED' | 'RESTRICTED';
export type AskRecordSectionReason = 'READER_NOT_CONNECTED' | 'PROVIDER_FAILED' | 'LIFECYCLE_INAPPLICABLE' | 'LIFECYCLE_CONTEXT_REQUIRED' | 'ROLE_FLOOR';

export interface AskRecordIndexSection {
  id: string;
  label: string;
  scope: string;
  state: AskRecordSectionState;
  reasonCode: AskRecordSectionReason | null;
  count: number | null;
  countLabel: string | null;
  freshAsOf: string | null;
  freshnessSource: string;
  pagedCollection: boolean;
  primaryAction: { label: string; question: string } | null;
}

export interface AskRecordIndex {
  contractVersion: 'ask-record-index-v1';
  propertyId: string;
  generatedAt: string;
  accessRole: 'VIEWER' | 'CONTRIBUTOR' | 'OWNER';
  operatingMode: 'BUYING' | 'OWNING' | 'SELLING' | 'UNKNOWN';
  property: { name: string | null; address: string; city: string; state: string } | null;
  completeness: { state: 'AVAILABLE' | 'UNAVAILABLE'; percent: number | null; pendingDetails: number | null };
  partial: boolean;
  sections: AskRecordIndexSection[];
}

export interface AskRecordRestrictedDetail {
  id: string;
  title: string;
  state: 'AVAILABLE' | 'NOT_RECORDED' | 'OWNER_ONLY';
  requiredRole: 'OWNER';
  facts: Array<{ label: string; value: string }>;
}

export type AskRecordDetailCapability = { state: 'CONNECTED' } | { state: 'UNAVAILABLE'; reason: string };

export type AskRecordFacetState = 'AVAILABLE' | 'NOT_RECORDED' | 'UNAVAILABLE';

export interface AskRecordFacet {
  state: AskRecordFacetState;
  value: string | null;
  at: string | null;
  reason: string | null;
}

export interface AskRecordLaunch {
  message: string;
  operationId: string;
  entityType: string;
  entityId: string;
  actionId: string | null;
}

export interface AskRecordCorrectionRoute {
  id: string;
  label: string;
  /** The existing Ask command that makes the change; null when no Ask command changes this kind of record. */
  operationId: string | null;
  requiredRole: 'VIEWER' | 'CONTRIBUTOR' | 'OWNER' | null;
  state: 'AVAILABLE' | 'ROLE_REQUIRED' | 'UNAVAILABLE';
  reason: string | null;
  /** The record-specific launch of this change: the same message, operation, and record target an item action in an Ask answer sends. Null unless AVAILABLE. */
  launch: AskRecordLaunch | null;
  /** A limit of the Ask answer that route opens (for example a list cap), or null. */
  note: string | null;
}

// One record's detail, provenance and correction routes (FR-REC-004/005). Mirrors the backend `AskRecordDetail`.
export interface AskRecordDetail {
  contractVersion: 'ask-record-detail-v1';
  propertyId: string;
  sectionId: string;
  recordId: string;
  generatedAt: string;
  title: string;
  facts: Array<{ label: string; value: string }>;
  provenance: {
    source: AskRecordFacet;
    observed: AskRecordFacet;
    verification: AskRecordFacet;
    visibility: AskRecordFacet;
    related: { state: AskRecordFacetState; records: Array<{ label: string; kindLabel: string; broken: boolean | null }>; reason: string | null };
    history: { state: AskRecordFacetState; entries: Array<{ at: string; label: string }>; reason: string | null };
  };
  corrections: AskRecordCorrectionRoute[];
}

// Record section collection page (FR-REC-003). Mirrors the backend `AskRecordCollectionPage`.
export interface AskRecordCollectionPage<Row> {
  contractVersion: 'ask-record-collection-v1';
  propertyId: string;
  sectionId: string;
  generatedAt: string;
  freshAsOf?: string | null;
  total: number;
  delivered: number;
  nextCursor: string | null;
  truncated: boolean;
  /** A source limit the cursor cannot work around; shown to the homeowner when present. */
  notice?: string | null;
  /** Facts that need a higher role than the collection; present only for sections that have some. */
  detail?: AskRecordRestrictedDetail | null;
  /** FR-REC-004: whether a row opens canonical per-record detail, or why it cannot. */
  recordDetail?: AskRecordDetailCapability;
  sort: { key: string; label: string };
  query: { search: string | null; filters: Record<string, string> };
  filterOptions: Array<{ key: string; label: string; options: Array<{ value: string; label: string }> }>;
  rows: Row[];
}

export interface AskRecordRoomRow {
  id: string;
  name: string;
  type: string | null;
  floorLevel: number | null;
  itemCount: number;
  openTaskCount: number;
  updatedAt: string;
  askQuestion: string;
}

export interface AskRecordInventoryRow {
  id: string;
  name: string;
  category: string;
  condition: string | null;
  roomName: string | null;
  brandModel: string | null;
  verified: boolean;
  missingDetails: string[];
  endOfLifeBy: string | null;
  updatedAt: string;
  askQuestion: string;
}

export interface AskRecordDocumentRow {
  /** A document's own id, or `candidate:<kind>:<id>` for a document-derived candidate awaiting review. */
  id: string;
  rowKind: 'DOCUMENT' | 'EXTRACTED_CANDIDATE';
  title: string;
  kind: string;
  kindLabel: string;
  verification: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  needsReview: boolean | null;
  expiry: 'CURRENT' | 'EXPIRING_SOON' | 'EXPIRED' | null;
  transitional: boolean;
  addedAt: string;
  updatedAt: string;
  askQuestion: string;
}

export interface AskRecordWarrantyRow {
  id: string;
  providerName: string;
  category: string;
  categoryLabel: string;
  itemName: string | null;
  coverageSummary: string | null;
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'STARTS_LATER' | 'NEEDS_REVIEW';
  statusLabel: string;
  daysRemaining: number | null;
  startDate: string;
  expiryDate: string;
  hasDocuments: boolean;
  updatedAt: string;
  askQuestion: string;
}

export interface AskRecordTimelineRow {
  id: string;
  title: string;
  summary: string | null;
  type: string;
  typeLabel: string;
  occurredAt: string;
  datePrecision: 'EXACT_DATE' | 'MONTH' | 'YEAR' | 'RANGE' | 'UNKNOWN';
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  verification: string;
  verificationLabel: string;
  providerName: string | null;
  isPrivate: boolean;
  askQuestion: null;
}

export interface AskRecordMaintenanceRow {
  id: string;
  title: string;
  scope: string;
  completedOn: string | null;
  actualCost: string | null;
  source: string;
  repeats: string | null;
  priority: string;
  askQuestion: null;
}

export interface AskRecordInspectionRow {
  id: string;
  reportType: string;
  reportTypeLabel: string;
  inspectionDate: string;
  inspector: string | null;
  status: string;
  statusLabel: string;
  totalFindings: number;
  openFindings: number;
  safetyFindings: number;
  majorFindings: number;
  askQuestion: null;
}

export interface AskRecordPermitRow {
  id: string;
  title: string;
  description: string | null;
  officialStatus: string;
  officialStatusLabel: string;
  reportedStatusLabel: string | null;
  closed: boolean;
  hasOpenInspections: boolean;
  issueDate: string | null;
  finaledDate: string | null;
  expirationDate: string | null;
  contractorName: string | null;
  verified: boolean;
  askQuestion: null;
}

export interface AskRecordProjectRow {
  /** `project:<id>` or `renovation:<id>`: tracked projects and renovation cases are separate tables. */
  id: string;
  kind: 'PROJECT' | 'RENOVATION_CASE';
  name: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  providerLabel: string | null;
  contractLabel: string | null;
  paidLabel: string | null;
  remainingLabel: string | null;
  expectedEndDate: string | null;
  warrantyExpiresAt: string | null;
  milestoneCount: number | null;
  issueCount: number | null;
  askQuestion: null;
}

export interface AskRecordIncidentClaimRow {
  id: string;
  recordId: string;
  kind: 'INCIDENT' | 'CLAIM';
  title: string;
  summary: string | null;
  statusLabel: string;
  open: boolean;
  detailLabel: string | null;
  providerName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  askQuestion: null;
}

export interface AskRecordPolicyRow {
  id: string;
  carrierName: string;
  coverageType: string | null;
  status: 'ACTIVE' | 'NEEDS_REVIEW' | 'STARTS_LATER' | 'EXPIRED';
  statusLabel: string;
  startDate: string | null;
  expiryDate: string | null;
  verified: boolean;
  lastVerifiedAt: string | null;
  askQuestion: null;
}

export interface AskRecordFinancingScenarioRow {
  id: string;
  title: string;
  projectCostLabel: string;
  status: string;
  statusLabel: string;
  selectedOptionLabel: string | null;
  entryPointLabel: string | null;
  createdAt: string;
  askQuestion: null;
}

export interface AskRecordBuyerTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  statusLabel: string;
  phase: string;
  phaseLabel: string;
  required: boolean;
  blocking: boolean;
  dueAt: string | null;
  completedAt: string | null;
  askQuestion: null;
}

export interface AskRecordSellerItemRow {
  id: string;
  title: string;
  detail: string | null;
  category: string;
  categoryLabel: string;
  requirementLabel: string;
  status: string;
  statusLabel: string;
  dueAt: string | null;
  costRangeLabel: string | null;
  askQuestion: null;
}

export interface AskRecordHouseholdMemberRow {
  id: string;
  name: string;
  role: 'OWNER' | 'CONTRIBUTOR' | 'VIEWER';
  roleLabel: string;
  isPrimaryOwner: boolean;
  isYou: boolean;
  joinedAt: string;
  askQuestion: null;
}

// Export review (FR-REC-006). Mirrors the backend `AskRecordExportReview`.
export interface AskRecordExportReviewSection {
  id: string;
  label: string;
  state: 'INCLUDED' | 'EXCLUDED';
  applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED' | 'RESTRICTED';
  packPath: string | null;
  reason: string | null;
  note: string | null;
  ownerFields: string[];
  sharedFields: string[];
  withheldFromShared: string[];
}

export interface AskRecordExportReview {
  contractVersion: 'ask-record-export-review-v1';
  propertyId: string;
  generatedAt: string;
  property: { name: string | null; address: string; city: string; state: string } | null;
  accessRole: 'VIEWER' | 'CONTRIBUTOR' | 'OWNER';
  operatingMode: 'BUYING' | 'OWNING' | 'SELLING' | 'UNKNOWN';
  create: { allowed: boolean; requiredRole: 'CONTRIBUTOR'; reason: string | null };
  pack: { format: 'PDF'; sectionsSelectable: true; downloadableBy: 'CREATOR'; recordExpiresInDays: number };
  alwaysIncluded: { label: string; ownerFields: string[]; sharedFields: string[]; withheldFromShared: string[] };
  sharing: { requiredRole: 'CONTRIBUTOR'; defaultExpiryDays: number; copy: 'REDACTED' };
  sections: AskRecordExportReviewSection[];
  included: string[];
  excluded: string[];
}

export interface HomeReportExportSelection {
  version: 1;
  requested: string[];
  included: string[];
  unavailable: Array<{ id: string; reason: 'NOT_IN_PACK' | 'RESTRICTED' }>;
}

export type HomeReportExportStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED' | 'EXPIRED' | 'DELETED';
export interface HomeReportExportSummary {
  id: string;
  status: HomeReportExportStatus;
  requestedAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
  expiresAt?: string | null;
}

// Work destination (FR-WORK-001..005). Mirrors the backend `AskWorkPage`, `AskWorkRow` and `AskWorkResolution`.
export type AskWorkLifecycleView = 'NEEDS_YOU' | 'ACTIVE' | 'WAITING' | 'SCHEDULED' | 'COMPLETED' | 'ARCHIVED';
/** What opening work finds. Separate from the lifecycle views: a row is in one view; an open attempt has one outcome. */
export type AskWorkResumeOutcome = 'AVAILABLE' | 'DELETED' | 'COMPLETED' | 'STALE' | 'ACCESS_LOST' | 'SUPERSEDED';
export type AskWorkType =
  | 'PENDING_EXECUTION' | 'HOME_WORK_ITEM' | 'DECISION_THREAD' | 'INCIDENT' | 'CLAIM' | 'PROJECT' | 'GUIDANCE_JOURNEY' | 'DIY_PROJECT'
  | 'RENOVATION_CASE' | 'REPAIR' | 'MONITOR' | 'QUEUED_JOB' | 'RETRYABLE_EXECUTION' | 'UNKNOWN_OUTCOME_EXECUTION' | 'SCHEDULED_FOLLOW_UP';
export type AskWorkProviderState = 'AVAILABLE' | 'UNAVAILABLE' | 'FAILED' | 'RESTRICTED' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED';

export interface AskWorkLaunch {
  operationId: string | null;
  entityType: string | null;
  entityId: string | null;
  actionId: string | null;
  decisionThreadId: string | null;
  workItemId: string | null;
  journeyId: string | null;
  contextVersion: string | null;
}

export interface AskWorkRow {
  workKey: string;
  sourceAliases: string[];
  providerId: string;
  workType: AskWorkType;
  propertyId: string;
  entity: { type: string; id: string };
  title: string;
  summary: string | null;
  status: { canonical: string; label: string };
  lifecycleView: AskWorkLifecycleView;
  nextAction: { label: string; operationId: string | null; allowed: boolean; retryExecutionId?: string } | null;
  sortAt: string;
  dueAt?: string | null;
  freshness: { version: string; asOf: string };
  sourceOwner: string;
  resume: { kind: 'CONVERSATION' | 'CONFIRMATION' | 'WORKSPACE'; executionId: string | null; sessionId: string | null; launch: AskWorkLaunch };
}

export interface AskWorkProviderStatus {
  providerId: string;
  label: string;
  workType: AskWorkType;
  state: AskWorkProviderState;
  reason: string | null;
  total: number | null;
  delivered: number;
  required: boolean;
}

export interface AskWorkPage {
  contractVersion: 'ask-work-v1';
  propertyId: string;
  generatedAt: string;
  view: AskWorkLifecycleView;
  total: number | null;
  totalScope: 'COMPLETE' | 'PARTIAL';
  partial: boolean;
  delivered: number;
  nextCursor: string | null;
  truncated: boolean;
  viewCounts: Record<AskWorkLifecycleView, number | null>;
  sort: { key: 'sortAt'; label: string };
  query: { workType: AskWorkType | null; status: string | null };
  providers: AskWorkProviderStatus[];
  rows: AskWorkRow[];
}

export interface AskWorkResolution {
  contractVersion: 'ask-work-v1';
  propertyId: string;
  workKey: string;
  outcome: AskWorkResumeOutcome;
  row: AskWorkRow | null;
  currentVersion: string | null;
  supersededBy: string | null;
  message: string;
}
