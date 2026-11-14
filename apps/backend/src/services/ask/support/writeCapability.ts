// FR-WRT-4 (reliability FRD): "can this operation change state" is decided by what the operation persists, not by inferring from its broad family. The write trace
// (docs/architecture/ASK_COZY_WRITE_SAFETY_TRACE.md) found labels wrong in both directions; askTrust.contract.ts now carries explicit operation-owned effect overrides and the consistency test requires exact agreement.
// `persistenceClass` is the separate attribute (owner advice 2026-11-11): it replaces the two permanent exception lists this file used to keep.
import { getAskDomainCommandByOperation } from '../askDomainCommandRegistry';

/**
 * What an operation persists when its message turn runs (D15 classes):
 *  NONE                  persists nothing.
 *  TECHNICAL             telemetry, audit events, non-semantic caches, profile caching. Automatically permitted.
 *  DERIVED               reproducible derived materialisation (analysis snapshots, forecasts, default preference rows). Automatically permitted; not user-intended changes.
 *  USER_VISIBLE          changes homeowner-visible state at message time without a confirmation (decision threads, lifecycle reconciliation on read). Individually reviewed.
 *  CONFIRMATION_REQUIRED a user-intended record change that only the authenticated confirm route may perform.
 */
export type PersistenceClass = 'NONE' | 'TECHNICAL' | 'DERIVED' | 'USER_VISIBLE' | 'CONFIRMATION_REQUIRED';

interface Declaration { readonly persistenceClass: PersistenceClass; readonly reason: string; /** True when the persistence is only reconciliation or analysis a reader would expect (not a decision or record the homeowner started), so the operation is still offered and routed as a read. */ readonly readerEquivalent?: boolean }
const decl = (persistenceClass: PersistenceClass, reason: string, readerEquivalent = false): Declaration => ({ persistenceClass, reason, ...(readerEquivalent ? { readerEquivalent } : {}) });

/**
 * Operations whose class is NOT the default. The default is derived: an operation with a domain command is CONFIRMATION_REQUIRED, every other one is NONE. Each entry names why;
 * do not add one without a write-trace entry. Source: write trace §3-§5 (2026-11-11), operation ids mapped from the trace's handler keys.
 */
export const PERSISTENCE_DECLARATIONS: Readonly<Record<string, Declaration>> = Object.freeze({
  // Decision-thread bookkeeping at message time (intended; matrix materiality carve-out), so not read-only.
  HVAC_DECISION_START: decl('USER_VISIBLE', 'writes DecisionThread, links, RecommendationSnapshot, PropertyChange at message time'),
  HVAC_DECISION_SCENARIO: decl('USER_VISIBLE', 'continues the HVAC decision thread at message time'),
  REPLACEMENT_GUIDANCE: decl('USER_VISIBLE', 'persists ReplaceRepairAnalysis and, for an HVAC item, decision threads (D17: composition uses ITEM_REPAIR_REPLACE_VERDICT instead)', true),
  // Lifecycle reconciliation on read (trace §5): may create events or transition tasks/work items when an underlying source resolved. Individually reviewed under D15.
  HOME_ACTIONS: decl('USER_VISIBLE', 'ensureRecurringHandoff can create HomeEvent and update HomeBuyerTask, InspectionFinding, NewHomeSetupPlan; also DerivedTrait', true),
  HOME_CHANGE_SUMMARY: decl('USER_VISIBLE', 'ensureRecurringHandoff lifecycle reconciliation on read', true),
  SELLER_PREP_CHECKLIST: decl('USER_VISIBLE', 'syncReadinessItems can transition work items and reopen linked records', true),
  // Reproducible derived materialisation and default rows (trace §5): automatically permitted.
  MAINTENANCE_FORECAST: decl('DERIVED', 'regenerates MaintenancePrediction'),
  CAPITAL_RESERVE_PLAN: decl('DERIVED', 'AssumptionSet and HomeCapitalTimelineAnalysis; may enqueue a notification'),
  CAPITAL_ITEM_FUNDING_GOAL: decl('DERIVED', 'AssumptionSet; may enqueue a notification'),
  BREAK_EVEN_ANALYSIS: decl('DERIVED', 'analysis snapshot rows'),
  SELL_HOLD_RENT_ANALYSIS: decl('DERIVED', 'SellHoldRentAnalysis rows'),
  REFINANCE_ANALYSIS: decl('DERIVED', 'RefinanceScenarioSnapshot rows'),
  HOME_BRIEFING_VIEW: decl('DERIVED', 'default HomeBriefingPreference row'),
  HOME_STATUS_BOARD: decl('DERIVED', 'HomeItemStatus and Signal rows'),
  // Telemetry and profile caching (trace §5): automatically permitted.
  SAVINGS_OPPORTUNITIES: decl('TECHNICAL', 'ProductAnalyticsEvent / DomainEvent'),
  DIY_TEMPLATE_BROWSE: decl('TECHNICAL', 'ProductAnalyticsEvent / DomainEvent'),
  HOME_EVENT_RADAR_STATE: decl('TECHNICAL', 'ProductAnalyticsEvent / DomainEvent'),
  ENVIRONMENT_REPORT: decl('TECHNICAL', 'caches resolved geography on Property (resolvePropertyGeo)'),
});

export function persistenceClassOf(operationId: string): PersistenceClass {
  const declared = PERSISTENCE_DECLARATIONS[operationId];
  if (declared) return declared.persistenceClass;
  return getAskDomainCommandByOperation(operationId) !== null ? 'CONFIRMATION_REQUIRED' : 'NONE';
}

/** A write-capable operation whose persistence is reconciliation or analysis done while reading (declared above). Everything else write-capable starts or changes something the homeowner would notice. */
export function isReaderEquivalentOperation(operationId: string): boolean { return PERSISTENCE_DECLARATIONS[operationId]?.readerEquivalent === true; }

/** Write-capable = could change homeowner-visible state (USER_VISIBLE) or is a confirm-gated record command. NONE, TECHNICAL and DERIVED are not (D15 "automatically permitted"). */
export function isWriteCapableOperation(operationId: string): boolean {
  const c = persistenceClassOf(operationId);
  return c === 'USER_VISIBLE' || c === 'CONFIRMATION_REQUIRED';
}
