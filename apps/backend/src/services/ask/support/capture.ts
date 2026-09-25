// Ask handler support: capture. Moved out of askHandlerSupport.ts unchanged (FRD v1.110); that file re-exports these modules.
import { type AskCaptureRequest, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { PROPERTY_AREA_CAPTURE_SCOPES, type PropertyAreaCaptureScope } from '../../../modules/propertyContext/catalog/featureRequirementRegistry';
import { PROPERTY_FACT_CATALOG } from '../../../modules/propertyContext/catalog/factCatalog';
import { getContextCompleteness } from '../../../modules/propertyContext/application/getContextCompleteness';
import { getPropertyContext } from '../../../modules/propertyContext/application/getPropertyContext';
import { readablePropertyValue } from './homeEventCorrection';

export const isAreaCaptureScope = (value: unknown): value is PropertyAreaCaptureScope => (PROPERTY_AREA_CAPTURE_SCOPES as readonly string[]).includes(String(value));

export const AREA_CAPTURE_ANCHORS: Record<PropertyAreaCaptureScope, string> = {
  CORE: 'property-type', LOCATION: 'address', STRUCTURE: 'structure', EXTERIOR: 'exterior', RESPONSIBILITY: 'responsibility', SYSTEMS: 'systems', SAFETY: 'safety',
};

export const areaFallbackAnchor = (scope: string): string | null => isAreaCaptureScope(scope) ? AREA_CAPTURE_ANCHORS[scope] : null;

export function areaCaptureFallbackHref(propertyId: string, scope: string): string {
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}`;
  const anchor = areaFallbackAnchor(scope);
  return anchor ? `${base}/edit#${anchor}` : base;
}

export async function areaCaptureProgress(userId: string, propertyId: string, scope: PropertyAreaCaptureScope, skip: Set<string>) {
  // Every area scope is loaded: fact applicability (for example a condo not owning a private fence) reads facts from other areas.
  const snapshot = await getPropertyContext(propertyId, { userId }, { scopes: [...PROPERTY_AREA_CAPTURE_SCOPES] });
  const entry = getContextCompleteness(snapshot).scopes.find((candidate) => candidate.scope === scope);
  const unmet = entry ? [...entry.missingFactKeys, ...entry.conflictedFactKeys, ...entry.staleFactKeys] : [];
  const writable = new Set<string>(PROPERTY_FACT_CATALOG.filter((fact) => fact.scope === scope && fact.writable).map((fact) => fact.key));
  return {
    percent: entry?.completenessPercent ?? 100,
    askable: unmet.filter((key) => writable.has(key) && !skip.has(key)),
    skipped: unmet.filter((key) => writable.has(key) && skip.has(key)),
    otherSurface: unmet.filter((key) => !writable.has(key)),
  };
}

export const PROPERTY_SCOPE_LABELS: Record<string, string> = {
  CORE: 'Core property details', LOCATION: 'Location', STRUCTURE: 'Structure', EXTERIOR: 'Exterior and utilities',
  RESPONSIBILITY: 'Maintenance responsibility', SYSTEMS: 'Home systems', SAFETY: 'Safety', ROOMS: 'Rooms',
  INVENTORY: 'Inventory', OPTIONAL_HOUSEHOLD: 'Optional household context',
};

// ── Property Summary per-area capture ──────────────────────────────────────────────────────────────────────
// A completeness row on the Property Summary opens an inline flow for ONE area. Each answer goes form -> review card ->
// confirm -> receipt (IW-CONF-001); nothing is written by the form. The questions come from the versioned Property Context
// contract PROPERTY_RECORD_SUMMARY:CAPTURE_AREA, and the write is captureFeatureContext -- the same canonical capture the
// rest of Property Context uses -- so this adds no new form and no new writer.
//
// Skipping ("Skip for now", or an answer that is "not sure" for everything) is kept in the execution's server-controlled
// parameters (`skipFactKeys`) and is used ONLY to choose the next question: it writes nothing and never makes a fact
// complete, and the completeness numbers shown afterwards come from the live facts. The client never supplies the skip
// list. A fresh workflow from a row starts with no skips; the receipt's "Continue" carries them from that execution.
export const AREA_CAPTURE_MESSAGES: Record<PropertyAreaCaptureScope, string> = {
  CORE: 'Fill in the missing core property details.',
  LOCATION: 'Fill in the missing location details.',
  STRUCTURE: 'Fill in the missing structure details.',
  EXTERIOR: 'Fill in the missing exterior details.',
  RESPONSIBILITY: 'Fill in the missing maintenance responsibility details.',
  SYSTEMS: 'Fill in the missing home systems details.',
  SAFETY: 'Fill in the missing safety details.',
};

// Phase 3 write slice 4: correct an InventoryRoom -- its name (the original rename), and its type and floor level. The
// operation keeps the ROOM_RENAME id so nothing already registered has to move; the input's `field` says which one. The room
// id is stable across a correction, so an open inline detail stays valid.
export const ROOM_TYPE_VALUES = ['KITCHEN', 'LIVING_ROOM', 'BEDROOM', 'BATHROOM', 'DINING', 'LAUNDRY', 'GARAGE', 'OFFICE', 'BASEMENT', 'OTHER'] as const;

export const INVENTORY_CATEGORY_VALUES = ['APPLIANCE', 'HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'SAFETY', 'SMART_HOME', 'FURNITURE', 'ELECTRONICS', 'INTERIOR', 'STRUCTURAL', 'EXTERIOR', 'SITE', 'OTHER'] as const;

export function askCaptureRequest(requirement: any, contextVersion: string, destinationLabel: string, fallbackHref: string): AskCaptureRequest {
  return {
    requirementId: requirement.requirementId,
    captureKey: requirement.capture.captureKey,
    classification: requirement.classification,
    state: requirement.state,
    title: requirement.capture.title,
    question: requirement.capture.question,
    helpText: requirement.capture.helpText ?? null,
    inputSchema: requirement.capture.inputSchema,
    ...(requirement.currentAnswer === undefined ? {} : { currentAnswer: requirement.currentAnswer }),
    allowNotSure: requirement.capture.allowNotSure,
    sensitivity: requirement.capture.sensitivity,
    destinationLabel,
    fallbackHref,
    confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export function captureFallbackHref(operationId: string | null, propertyId: string | null): string | null {
  if (!propertyId) return null;
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}`;
  switch (operationId) {
    case 'REPLACEMENT_GUIDANCE':
    case 'INVENTORY_LOOKUP':
    case 'COVERAGE_GAPS': return `${base}/inventory`;
    case 'COVERAGE_COMPARISON_STATUS': return `${base}/tools/coverage-options`;
    case 'INCIDENT_CLAIM_STATUS':
    case 'CLAIM_FILE':
    case 'CLAIM_TRANSITION':
    case 'INCIDENT_CONTINUATION': return `${base}/claims`;
    case 'REFINANCE_ANALYSIS': return `${base}/tools/financing/profile`;
    case 'SAVINGS_OPPORTUNITIES': return `${base}/tools/home-savings`;
    case 'OWNERSHIP_COSTS': return `${base}/ownership-costs`;
    case 'SELL_HOLD_RENT_ANALYSIS':
    case 'SELLER_PREP_CHECKLIST':
    case 'SELLER_PREP_ITEM_DECISION': return `${base}/seller-prep`;
    case 'INVENTORY_ITEM_CORRECT':
    case 'INVENTORY_ITEM_CREATE': return `${base}/inventory?tab=items`;
    case 'PROPERTY_CONTEXT_AREA_CAPTURE': return base;
    case 'HOME_EVENT_CORRECT': return `${base}/timeline`;
    case 'WARRANTY_CORRECT': return '/dashboard/warranties';
    case 'ROOM_RENAME':
    case 'ROOM_CREATE': return `${base}/rooms`;
    case 'CAPITAL_RESERVE_PLAN': return `${base}/tools/capital-timeline`;
    case 'PROPERTY_TAX_APPEAL_READINESS': return `${base}/tools/property-tax`;
    case 'QUOTE_COMPARISON_REVIEW': return `${base}/tools/quote-comparison`;
    case 'RENOVATION_PERMIT_READINESS': return `${base}/projects`;
    case 'MAJOR_EVENT_ENTRY': return `${base}/tools`;
    case 'HOME_ACTIONS':
    case 'OPERATIONAL_WORK_UPDATE': return `${base}/home-operations`;
    case 'INSPECTION_FINDINGS':
    case 'INSPECTION_FINDING_UPDATE': return `${base}/inspection`;
    case 'DOCUMENT_PROMOTION_REVIEW':
    case 'DOCUMENT_PROMOTION_CONFIRM':
    case 'DOCUMENT_LOOKUP': return `${base}/documents`;
    case 'HOUSEHOLD_INVITATION': return `${base}/household`;
    case 'MAINTENANCE_TASK_CREATE':
    case 'MAINTENANCE_TASK_COMPLETE':
    case 'MAINTENANCE_FORECAST': return `${base}/maintenance`;
    default: return `${base}/edit`;
  }
}

// Facts an answer here cannot fill: they are set from the address, calculated, or read from other records.
export const AREA_OTHER_SURFACE_LABELS: Record<string, string> = {
  'core.activationStatus': 'Activation status (set by Cozy)',
  'location.county': 'County (from your address)', 'location.countyFips': 'County code (from your address)',
  'location.geocoded': 'Map location (from your address)', 'location.climateRegion': 'Climate region (from your location)',
  'structure.roofAgeYears': 'Roof age (calculated from the replacement year)',
  'systems.hasCooling': 'Cooling present (from your cooling type and inventory)', 'systems.installedItemTypes': 'Installed system types (from your inventory)',
};

export const areaLabel = (scope: string): string => PROPERTY_SCOPE_LABELS[scope] ?? readablePropertyValue(scope);

export function areaProgressBlock(propertyId: string, scope: PropertyAreaCaptureScope, progress: Awaited<ReturnType<typeof areaCaptureProgress>>, terminal: boolean, continueAction: boolean): AskPresentationBlock {
  const parts = [`${areaLabel(scope)} is ${progress.percent}% complete on the home record.`];
  if (progress.skipped.length) parts.push(`${progress.skipped.length} detail${progress.skipped.length === 1 ? ' was' : 's were'} skipped or marked not sure this session and ${progress.skipped.length === 1 ? 'is' : 'are'} still incomplete.`);
  const otherLabels = progress.otherSurface.map((key) => AREA_OTHER_SURFACE_LABELS[key]).filter(Boolean);
  if (progress.otherSurface.length) parts.push(`${progress.otherSurface.length} detail${progress.otherSurface.length === 1 ? '' : 's'} cannot be filled in here${otherLabels.length ? `: ${otherLabels.join('; ')}` : ''}.`);
  return {
    type: 'SUMMARY', id: 'area-capture-progress',
    title: terminal ? 'No more questions in this session' : `${areaLabel(scope)}: ${progress.askable.length} detail${progress.askable.length === 1 ? '' : 's'} left to answer`,
    body: parts.join(' '), tone: terminal && (progress.skipped.length || progress.otherSurface.length || progress.percent < 100) ? 'CAUTION' : 'DEFAULT',
    actions: [
      ...(continueAction && progress.askable.length ? [{ id: 'continue-area-capture', label: `Continue with ${areaLabel(scope)}`, interactionType: 'START_WORKFLOW' as const, message: AREA_CAPTURE_MESSAGES[scope], operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', style: 'PRIMARY' as const }] : []),
      { id: 'open-property-record', label: 'Open property record', href: areaCaptureFallbackHref(propertyId, scope), style: 'SECONDARY' as const },
    ],
  };
}

export function captureEventResult(propertyId: string, event: { id: string; title: string }, corrected: boolean): AskOperationResult {
  const timelineHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/timeline`;
  return {
    status: 'COMPLETED', reasonCode: corrected ? 'EVENT_CORRECTED' : 'EVENT_CAPTURED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `event-${corrected ? 'corrected' : 'captured'}-${event.id}`, title: corrected ? 'Home timeline event corrected' : 'Added to your home timeline', status: 'COMPLETED',
      description: corrected
        ? 'A new revision replaces the prior entry on your home\'s canonical timeline; the original is preserved as history.'
        : 'This event is now part of your home\'s canonical timeline.',
      details: [{ label: 'Event', value: event.title }],
      actions: [{ id: 'open-timeline', label: 'Open timeline', href: timelineHref, style: 'PRIMARY' }],
    }],
    confirmation: null, suggestions: [],
  };
}
