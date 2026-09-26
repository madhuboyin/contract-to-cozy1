// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { isWaterHeaterInventoryName } from '../../repairReplaceEligibility';
import { formatMajorApplianceType, inferMajorApplianceType, PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX } from '../../majorAppliance.util';
import { InventoryService, ROOM_REQUIRED_CATEGORIES } from '../../inventory.service';
import { type CorrectionOption } from '../askCorrectionFields';
import { humanDate } from '../askFormatting';
import { durableFreeTextClarification, ensurePropertyAccess, exactEntityMatch, homeEventCorrectionItemActions, INVENTORY_CATEGORY_VALUES, InventoryCreateInputSchema, InventoryItemCorrectionInputSchema, isValidDateEditInput, MAX_RESULT_ITEMS } from '../askHandlerSupport';
import { isIncompleteInventoryRequest, isLifecycleInventoryRequest } from '../askInventoryIntent';
import { type AskViewState } from '../support/executionState';
import { loadAskViewState } from './maintenance.handler';

export const inventoryService = new InventoryService();

const INVENTORY_QUERY_STOP_WORDS = new Set([
  'about', 'appliance', 'appliances', 'details', 'equipment', 'find', 'have', 'home', 'house',
  'incomplete', 'information', 'inventory', 'item', 'items', 'know', 'list', 'missing', 'property', 'record', 'records',
  'show', 'system', 'systems', 'tell', 'that', 'the', 'this', 'what', 'which', 'with', 'your', 'my',
]);

function inventorySearchTokens(message: string): string[] {
  return [...new Set(message.toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    .filter((token) => token.length > 2 && !INVENTORY_QUERY_STOP_WORDS.has(token));
}

function inventoryItemSearchText(item: Awaited<ReturnType<InventoryService['listItems']>>[number]): string {
  return [
    item.name, item.category, item.assetType, item.brand, item.model, item.manufacturer, item.modelNumber,
    item.room?.name, ...(item.tags ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function inventoryMissingFacts(item: Awaited<ReturnType<InventoryService['listItems']>>[number]): string[] {
  return [
    item.brand || item.manufacturer ? null : 'Brand or manufacturer',
    item.model || item.modelNumber ? null : 'Model',
    item.serialNo || item.serialNumber ? null : 'Serial number',
    item.purchasedOn ? null : 'Purchase date',
    item.documents.length ? null : 'Documents',
    item.warrantyId || item.insurancePolicyId || item.coverageEvidenceStatus !== 'UNKNOWN' ? null : 'Coverage evidence',
  ].filter((value): value is string => Boolean(value));
}

function inventoryItemHref(propertyId: string, itemId: string): string {
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items&openItemId=${encodeURIComponent(itemId)}`;
}

const inventoryCount = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The end-of-life horizon used everywhere Ask talks about "nearing end of life": three years out. */
function inventoryLifecycleHorizon(now = new Date()): Date {
  const horizon = new Date(now);
  horizon.setUTCFullYear(horizon.getUTCFullYear() + 3);
  return horizon;
}

/**
 * ACUI I-1 / IW-CALM-001 (FRD v1.121): the calm answer for an inventory list, as one sentence, one optional supporting line and
 * answer chips, from counts only (no model). Every number in the headline and the chips comes from the same records, so they
 * never disagree. "None missing" is said only about the records in this result and only for the facts Ask checks.
 */
export function inventoryCalmCopy(counts: {
  matchCount: number; shownCount: number; missingCount: number; lifecycleCount: number; incompleteFocus: boolean; lifecycleFocus: boolean;
  /** The selected category, in the homeowner's words ("HVAC"), so a filtered headline says what it is about. */
  categoryLabel?: string | null;
}): { headline: string; supportLine?: string; chips: Array<{ label: string; tone: 'DEFAULT' | 'CAUTION' | 'CRITICAL' }> } {
  const { matchCount, shownCount, missingCount, lifecycleCount, incompleteFocus, lifecycleFocus, categoryLabel } = counts;
  const scope = categoryLabel ? `${categoryLabel} ` : '';
  let headline: string;
  if (incompleteFocus) {
    headline = `${matchCount} ${scope}${matchCount === 1 ? 'record is' : 'records are'} missing details.`;
  } else if (lifecycleFocus) {
    headline = `${matchCount} ${scope}${matchCount === 1 ? 'item has' : 'items have'} a recorded end-of-life date in the next three years.`;
  } else if (missingCount > 0) {
    headline = `${matchCount} ${scope}${matchCount === 1 ? 'item' : 'items'} recorded, ${missingCount} with missing details.`;
  } else {
    headline = `${matchCount} ${scope}${matchCount === 1 ? 'item' : 'items'} recorded, none missing the details Ask checks.`;
  }
  const chips: Array<{ label: string; tone: 'DEFAULT' | 'CAUTION' | 'CRITICAL' }> = [
    { label: inventoryCount(matchCount, 'record', 'records'), tone: 'DEFAULT' },
    { label: `${missingCount} missing details`, tone: missingCount > 0 ? 'CAUTION' : 'DEFAULT' },
    { label: `${lifecycleCount} near end of life`, tone: lifecycleCount > 0 ? 'CAUTION' : 'DEFAULT' },
  ];
  return shownCount < matchCount
    ? { headline, supportLine: `Showing the first ${shownCount}. Each row reflects the canonical inventory record.`, chips }
    : { headline, chips };
}

// ACUI I-2 (FRD v1.122): Inventory filters as a governed refinement. Same continuity model as Maintenance and Buyer Deadlines: a
// declared chip is a fresh authoritative query that carries a stable result id and the next revision, so the earlier result is
// superseded rather than stacked. Two independent dimensions, each replaced on its own: a status focus and a category.
export type InventoryStatusFilter = 'ALL' | 'INCOMPLETE' | 'LIFECYCLE';
export type InventoryCategoryFilter = 'HVAC' | 'APPLIANCE' | 'ROOF_EXTERIOR';
const INVENTORY_STATUS_FILTERS: ReadonlySet<string> = new Set(['ALL', 'INCOMPLETE', 'LIFECYCLE']);
const INVENTORY_CATEGORY_FILTERS: ReadonlySet<string> = new Set(['HVAC', 'APPLIANCE', 'ROOF_EXTERIOR']);
const INVENTORY_CATEGORY_LABELS: Record<InventoryCategoryFilter, string> = { HVAC: 'HVAC', APPLIANCE: 'Appliances', ROOF_EXTERIOR: 'Roof and exterior' };
// Each declared chip message must be recognized here AND begin with a phrase askFollowUpContext's FILTER_CONTINUATION_PATTERN accepts.
const INVENTORY_CLEAR_FILTERS_MESSAGE = 'Now show all inventory items with no filters';
const INVENTORY_CLEAR_PATTERN = /^\s*now show all inventory items with no filters\b/i;
const INVENTORY_ALL_STATUS_PATTERN = /^\s*now show all inventory items\b/i;
const INVENTORY_ALL_CATEGORIES_PATTERN = /^\s*now show all inventory categories\b/i;

function detectInventoryCategory(message: string): InventoryCategoryFilter | null {
  return /\bhvac|furnace|air conditioner|heat pump|boiler\b/i.test(message)
    ? 'HVAC'
    : /\bappliances?\b/i.test(message)
      ? 'APPLIANCE'
      : /\broof\b/i.test(message)
        ? 'ROOF_EXTERIOR'
        : null;
}

function inventoryMatchesCategory(item: Awaited<ReturnType<InventoryService['listItems']>>[number], category: InventoryCategoryFilter): boolean {
  return category === 'HVAC'
    ? item.category === 'HVAC' || /\b(?:hvac|furnace|air conditioner|heat pump|boiler)\b/i.test(inventoryItemSearchText(item))
    : item.category === category;
}

/**
 * Merges this turn's declared filter into the prior view. Only the dimension the message names changes; "no filters" clears both.
 * Returns null when there is no prior view or the message names no filter, so an ordinary question is answered as a fresh query.
 */
export function resolveInventoryRefinement(message: string, prior: AskViewState | null | undefined): { status: InventoryStatusFilter; category: InventoryCategoryFilter | null } | null {
  if (!prior || !INVENTORY_STATUS_FILTERS.has(prior.statusFilter)) return null;
  const priorCategory = prior.domainScopePhrase && INVENTORY_CATEGORY_FILTERS.has(prior.domainScopePhrase) ? prior.domainScopePhrase as InventoryCategoryFilter : null;
  if (INVENTORY_CLEAR_PATTERN.test(message)) return { status: 'ALL', category: null };
  const status: InventoryStatusFilter | null = isIncompleteInventoryRequest(message) ? 'INCOMPLETE'
    : isLifecycleInventoryRequest(message) ? 'LIFECYCLE'
      : INVENTORY_ALL_STATUS_PATTERN.test(message) ? 'ALL' : null;
  const allCategories = INVENTORY_ALL_CATEGORIES_PATTERN.test(message);
  const category = allCategories ? null : detectInventoryCategory(message);
  if (!status && !category && !allCategories) return null;
  return { status: status ?? prior.statusFilter as InventoryStatusFilter, category: allCategories ? null : category ?? priorCategory };
}

export function buildInventoryViewState(prior: AskViewState | null | undefined, status: InventoryStatusFilter, category: InventoryCategoryFilter | null): AskViewState {
  return {
    resultId: prior?.resultId ?? randomUUID(),
    // Inventory reuses the generic fields: the category key rides in domainScopePhrase, the status focus in statusFilter.
    domainScopePhrase: category,
    dateScopePhrase: null,
    statusFilter: status,
    selectedTaskId: prior?.selectedTaskId ?? null,
    revision: (prior?.revision ?? 0) + 1,
  };
}

/** The prior view only when the source execution really was an inventory lookup (another domain's view state must never be continued). */
async function loadInventoryViewState(sourceExecutionId: string | null | undefined, userId: string): Promise<AskViewState | null> {
  if (!sourceExecutionId) return null;
  const source = await prisma.askExecution.findFirst({ where: { id: sourceExecutionId, userId }, select: { operationId: true } });
  return source?.operationId === 'INVENTORY_LOOKUP' ? loadAskViewState(sourceExecutionId, userId) : null;
}

/** The declared chips for a collection result; every message round-trips through resolveInventoryRefinement. */
export function inventoryFilterChips(status: InventoryStatusFilter, category: InventoryCategoryFilter | null) {
  return [
    { id: 'status-all', label: 'All items', message: 'Now show all inventory items', active: status === 'ALL' },
    { id: 'status-incomplete', label: 'Missing details', message: 'Only show items with missing details', active: status === 'INCOMPLETE' },
    { id: 'status-lifecycle', label: 'Near end of life', message: 'Only show items nearing end of life', active: status === 'LIFECYCLE' },
    { id: 'category-all', label: 'All categories', message: 'Now show all inventory categories', active: category === null },
    { id: 'category-hvac', label: 'HVAC', message: 'Only show HVAC items', active: category === 'HVAC' },
    { id: 'category-appliance', label: 'Appliances', message: 'Only show appliances', active: category === 'APPLIANCE' },
    { id: 'category-roof', label: 'Roof and exterior', message: 'Only show roof items', active: category === 'ROOF_EXTERIOR' },
    ...(status !== 'ALL' || category ? [{ id: 'clear-all', label: 'Clear filters', message: INVENTORY_CLEAR_FILTERS_MESSAGE, active: false }] : []),
  ];
}

async function inventoryLookupResult(userId: string, propertyId: string, message: string, priorViewState?: AskViewState | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const inventoryHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items`;
  const allItems = await inventoryService.listItems(propertyId, {});
  const recordVersion = createHash('sha256').update(JSON.stringify(allItems.map((item) => ({ id: item.id, updatedAt: item.updatedAt })))).digest('hex');
  if (!allItems.length) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'INVENTORY_NOT_RECORDED', contextVersion: recordVersion,
      blocks: [{
        type: 'SUMMARY', id: 'inventory-empty', title: 'No inventory items are recorded for this home yet',
        body: 'An empty Living Home Record does not mean the home has no appliances or systems. Add or scan items before Ask can provide item-specific details or history.',
        tone: 'CAUTION',
        actions: [{ id: 'add-inventory', label: 'Add inventory items', href: `${inventoryHref}&action=add-item&source=ask`, style: 'PRIMARY' }],
      }],
      suggestions: ['Open home inventory'],
    };
  }

  // ACUI I-2: a declared filter chip continues the prior result; only the dimension it names changes, and the query is re-run here.
  const refinement = resolveInventoryRefinement(message, priorViewState);
  const historyFocus = !refinement && /\b(?:history|timeline|what happened|repairs?|service(?:d| history)?|maintenance history)\b/i.test(message);
  const incompleteFocus = refinement ? refinement.status === 'INCOMPLETE' : isIncompleteInventoryRequest(message);
  const lifecycleFocus = refinement ? refinement.status === 'LIFECYCLE' : /\b(?:end of life|nearing (?:replacement|expiry)|expir(?:e|y|ing)|oldest systems?)\b/i.test(message);
  const categoryFilter = refinement ? refinement.category : detectInventoryCategory(message);
  const specificAliases: Array<{ test: RegExp; terms: string[] }> = [
    { test: /\b(?:refrigerator|fridge)\b/i, terms: ['refrigerator', 'fridge'] },
    { test: /\bwater heater\b/i, terms: ['water heater'] },
    { test: /\bwasher\b/i, terms: ['washer', 'washing machine'] },
    { test: /\bdryer\b/i, terms: ['dryer'] },
    { test: /\bdishwasher\b/i, terms: ['dishwasher'] },
  ];
  const specific = refinement ? undefined : specificAliases.find((candidate) => candidate.test.test(message));
  const genericList = /\b(?:inventory|systems?|equipment|appliances?)\b/i.test(message) && !specific && !categoryFilter;
  const tokens = inventorySearchTokens(message);

  let matches = allItems;
  if (categoryFilter) {
    matches = allItems.filter((item) => inventoryMatchesCategory(item, categoryFilter));
  } else if (refinement) {
    // Every item, then the status focus below: a filter never depends on the words of an earlier question.
    matches = allItems;
  } else if (specific) {
    matches = allItems.filter((item) => specific.terms.some((term) => inventoryItemSearchText(item).includes(term)));
  } else if (!genericList && tokens.length) {
    const scored = allItems.map((item) => ({
      item,
      score: tokens.reduce((score, token) => score + (inventoryItemSearchText(item).includes(token) ? 1 : 0), 0),
    })).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score || right.item.updatedAt.getTime() - left.item.updatedAt.getTime());
    const topScore = scored[0]?.score ?? 0;
    matches = scored.filter((candidate) => candidate.score === topScore).map((candidate) => candidate.item);
  }

  if (incompleteFocus) {
    matches = matches.filter((item) => inventoryMissingFacts(item).length > 0)
      .sort((left, right) => inventoryMissingFacts(right).length - inventoryMissingFacts(left).length);
  } else if (lifecycleFocus) {
    const horizon = inventoryLifecycleHorizon();
    matches = matches.filter((item) => item.expectedExpiryDate && item.expectedExpiryDate <= horizon)
      .sort((left, right) => (left.expectedExpiryDate?.getTime() ?? Number.POSITIVE_INFINITY) - (right.expectedExpiryDate?.getTime() ?? Number.POSITIVE_INFINITY));
  }

  if (!matches.length && refinement) {
    // A filter that matches nothing still continues the result and keeps every chip, so the homeowner can widen or clear it.
    return {
      status: 'ANSWERED', reasonCode: 'INVENTORY_FILTER_NO_MATCH', contextVersion: recordVersion,
      parameters: { viewState: buildInventoryViewState(priorViewState, refinement.status, refinement.category) },
      blocks: [{
        type: 'SUMMARY', id: 'inventory-summary', title: 'No inventory records match these filters', headline: 'No items match these filters.',
        supportLine: `This home has ${allItems.length} visible inventory item${allItems.length === 1 ? '' : 's'}. Widen or clear a filter to see them.`,
        body: `This home has ${allItems.length} visible inventory item${allItems.length === 1 ? '' : 's'}, but none match the selected filters.`, tone: 'DEFAULT',
        actions: [{ id: 'open-inventory', label: 'Open home inventory', href: inventoryHref, style: 'PRIMARY' }],
      }, {
        type: 'GROUPED_LIST', id: 'inventory-results',
        title: isIncompleteInventoryRequest(message) ? 'Incomplete inventory records' : isLifecycleInventoryRequest(message) ? 'Recorded lifecycle dates approaching' : 'Inventory details',
        filters: inventoryFilterChips(refinement.status, refinement.category),
        sections: [{ id: 'items', title: 'Living Home Record', count: 0, items: [] }],
        actions: [
          ...(access.role !== HouseholdRole.VIEWER ? [inventoryAddItemAction()] : []),
          { id: 'open-inventory-list', label: 'Open home inventory', href: inventoryHref, style: 'SECONDARY' },
        ],
      }],
      suggestions: [],
    };
  }

  if (!matches.length) {
    const focus = incompleteFocus ? 'incomplete inventory records' : lifecycleFocus ? 'items with a recorded end-of-life date in the next three years' : 'a matching inventory record';
    return {
      status: 'ANSWERED', reasonCode: 'INVENTORY_MATCH_NOT_FOUND', contextVersion: recordVersion,
      blocks: [{
        type: 'SUMMARY', id: 'inventory-no-match', title: `I could not find ${focus}`,
        body: `This home has ${allItems.length} visible inventory item${allItems.length === 1 ? '' : 's'}, but none match this request. Ask will not infer an unrecorded appliance or system from general property data.`,
        tone: 'DEFAULT',
        actions: [{ id: 'search-inventory', label: 'Search home inventory', href: inventoryHref, style: 'PRIMARY' }],
      }],
      suggestions: ['List all inventory items', 'Show incomplete inventory records'],
    };
  }

  const needsEntity = matches.length > 1 && (historyFocus || Boolean(specific));
  if (needsEntity) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'MULTIPLE_INVENTORY_MATCHES', contextVersion: recordVersion,
      ...durableFreeTextClarification('INVENTORY_LOOKUP', 'Which inventory item do you mean? Add its room, brand, model, or exact name.'),
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'inventory-entity-selection', title: 'Which inventory item do you mean?',
        description: 'More than one Living Home Record matches this question. Open the intended item, or ask again using its room, brand, or model.',
        sections: [{
          id: 'matches', title: 'Matching records', count: matches.length,
          // IW-PRIN-002 fix: entityType added so this disambiguation list
          // also routes through InventoryResultList (GroupedListBlock.tsx
          // matches both 'inventory-results' and this block's id) instead
          // of the generic renderer's plain href -- selecting an ambiguous
          // match now opens inline detail instead of implicitly ejecting to
          // /inventory before the homeowner even confirmed which item they meant.
          items: matches.slice(0, MAX_RESULT_ITEMS).map((item) => ({
            id: item.id, title: item.name, entityType: 'INVENTORY_ITEM', actions: inventoryCorrectionItemActions(access.role !== HouseholdRole.VIEWER), description: [item.brand ?? item.manufacturer, item.model ?? item.modelNumber].filter(Boolean).join(' ') || null,
            meta: [item.room?.name, item.category.toLowerCase().replace(/_/g, ' '), `Updated ${humanDate(item.updatedAt) ?? 'date unavailable'}`].filter((value): value is string => Boolean(value)),
            status: item.condition, href: inventoryItemHref(propertyId, item.id),
          })),
        }],
        actions: [],
      }],
      suggestions: ['Open home inventory'],
    };
  }

  // A refined list stays a list even at one row, so its chips (and the way back) never disappear.
  const selectedItem = !refinement && matches.length === 1 ? matches[0] : null;
  const lifecycleEvaluation = selectedItem
    ? await evaluateFeatureContext(propertyId, userId, {
      featureKey: 'REPAIR_REPLACE', operationKey: 'RUN_ANALYSIS', operationInput: { inventoryItemId: selectedItem.id },
    })
    : null;
  const activeRequirement = lifecycleEvaluation?.requirements[0];
  const captureSupported = activeRequirement
    && access.role !== HouseholdRole.VIEWER
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED'
    && activeRequirement.capture.inputSchema.type !== 'RELATIONAL_SELECT_CREATE';
  const captureRequests: AskCaptureRequest[] = captureSupported && lifecycleEvaluation ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this item’s Home Record',
    confirmationText: null,
    expectedContextVersion: lifecycleEvaluation.contextVersion,
  }] : [];

  const shown = matches.slice(0, MAX_RESULT_ITEMS);
  // The answer-trust contract (askInventoryIntent) keys the list title on the words of THIS question, so a chip like "Only show HVAC
  // items" is titled "Inventory details" even when a status focus carried over from the prior view; the headline states the real scope.
  const listTitle = isIncompleteInventoryRequest(message) ? 'Incomplete inventory records' : isLifecycleInventoryRequest(message) ? 'Recorded lifecycle dates approaching' : 'Inventory details';
  const freshCollection = !specific && !historyFocus && (genericList || Boolean(categoryFilter) || incompleteFocus || lifecycleFocus);
  const collectionView = !selectedItem && (Boolean(refinement) || freshCollection);
  const activeStatus: InventoryStatusFilter = incompleteFocus ? 'INCOMPLETE' : lifecycleFocus ? 'LIFECYCLE' : 'ALL';
  const viewState = collectionView ? buildInventoryViewState(priorViewState, activeStatus, categoryFilter) : null;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'inventory-summary',
    title: selectedItem ? `Here is what the Home Record contains for ${selectedItem.name}` : `${matches.length} inventory records match this request`,
    body: selectedItem
      ? `${inventoryMissingFacts(selectedItem).length ? `${inventoryMissingFacts(selectedItem).length} important detail${inventoryMissingFacts(selectedItem).length === 1 ? ' is' : 's are'} still missing.` : 'The core identity, lifecycle, document, and coverage fields checked by Ask are present.'} Unknown fields remain unknown and are not inferred by a model.`
      : `${shown.length === matches.length ? 'All matching records are shown.' : `Showing the first ${shown.length}.`} Each row reflects the canonical inventory record.`,
    tone: selectedItem && inventoryMissingFacts(selectedItem).length ? 'CAUTION' : 'DEFAULT',
    // I-1: the calm anatomy for a list: a counted headline and chips. A single item keeps its own title and body (the calm answer shows
    // an undeclared summary as title plus plain text, so nothing is dropped). The full-record link also rides on the list (below).
    ...(selectedItem ? {} : inventoryCalmCopy({
      matchCount: matches.length, shownCount: shown.length, incompleteFocus, lifecycleFocus, categoryLabel: categoryFilter ? INVENTORY_CATEGORY_LABELS[categoryFilter] : null,
      missingCount: matches.filter((item) => inventoryMissingFacts(item).length > 0).length,
      lifecycleCount: matches.filter((item) => item.expectedExpiryDate && item.expectedExpiryDate <= inventoryLifecycleHorizon()).length,
    })),
    actions: [{ id: 'open-inventory', label: 'Open home inventory', href: inventoryHref, style: 'PRIMARY' }],
  }, {
    // ASK_COZY_INLINE_WORKSPACE_FRD Phase 3: block id 'inventory-results' is
    // matched by GroupedListBlock.tsx to render InventoryResultList instead
    // of the generic list, giving item titles inline detail (a direct
    // canonical GET, same pattern as Maintenance's inline task detail) in
    // place of navigating to /inventory. No item `actions` are declared yet
    // -- this is a read-only OPEN_INLINE_ENTITY slice; inline mutation would
    // need real per-item operations registered first. 'inventory-entity-selection'
    // above (the disambiguation list) is also routed through
    // InventoryResultList as of the same day -- selecting an ambiguous match
    // opens inline detail instead of implicitly ejecting to /inventory.
    // 'inventory-history' below is still unaffected and hands off via a bare
    // href (it lists HomeEvent timeline entries, a different entity type
    // with no inline detail component yet) -- a genuine remaining "broader
    // entry points" gap, matching Maintenance's own flagship-first shape.
    type: 'GROUPED_LIST', filters: viewState ? inventoryFilterChips(activeStatus, categoryFilter) : [], id: 'inventory-results', title: listTitle,
    description: lifecycleFocus ? 'Only items with a recorded expected-expiry date within the next three years are included.' : null,
    sections: [{
      id: 'items', title: 'Living Home Record', count: matches.length,
      items: shown.map((item) => {
        const missingFacts = inventoryMissingFacts(item);
        const identity = [item.brand ?? item.manufacturer, item.model ?? item.modelNumber].filter(Boolean).join(' ');
        const lifecycleDate = item.purchasedOn;
        return {
          id: item.id, title: item.name, entityType: 'INVENTORY_ITEM', actions: inventoryCorrectionItemActions(access.role !== HouseholdRole.VIEWER),
          description: incompleteFocus && missingFacts.length ? `Missing: ${missingFacts.join(', ')}` : item.notes,
          meta: [
            item.room?.name ?? item.category.toLowerCase().replace(/_/g, ' '),
            identity || 'Brand/model not recorded',
            lifecycleDate ? `Purchased ${humanDate(lifecycleDate)}` : 'Purchase date not recorded',
            item.expectedExpiryDate ? `Expected lifecycle date ${humanDate(item.expectedExpiryDate)}` : null,
            `${item.documents.length} document${item.documents.length === 1 ? '' : 's'}`,
            item.isVerified ? 'Verified record' : 'Not verified',
          ].filter((value): value is string => Boolean(value)),
          status: item.condition, href: inventoryItemHref(propertyId, item.id),
        };
      }),
    }],
    // I-1: "Add an item" is the one dominant step; the full inventory page is a quiet secondary link (shown by the calm answer only).
    actions: [
      ...(access.role !== HouseholdRole.VIEWER ? [inventoryAddItemAction()] : []),
      { id: 'open-inventory-list', label: 'Open home inventory', href: inventoryHref, style: 'SECONDARY' },
    ],
  }];

  if (historyFocus && selectedItem) {
    const events = await prisma.homeEvent.findMany({
      where: {
        propertyId, inventoryItemId: selectedItem.id, isCurrent: true, deletedAt: null,
        OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: userId }],
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: MAX_RESULT_ITEMS,
      select: { id: true, type: true, title: true, summary: true, occurredAt: true, datePrecision: true, verificationStatus: true, sourceBadge: true },
    });
    blocks.push({
      // ASK_COZY_INLINE_WORKSPACE_FRD Phase 3: entityType lets
      // GroupedListBlock.tsx route this block through HomeEventResultList
      // (the disambiguation-list fix's own follow-up) instead of the
      // generic renderer's bare href -- opening event detail inline
      // instead of ejecting to the inventory item's page for a
      // per-event question the homeowner never asked.
      type: 'GROUPED_LIST', filters: [], id: 'inventory-history', title: `${selectedItem.name} history`,
      description: events.length ? 'Current, non-deleted Home Timeline events visible to you.' : 'No visible Home Timeline events are linked to this item yet.',
      sections: [{
        id: 'events', title: 'Timeline', count: events.length,
        items: events.map((event) => ({
          id: event.id, title: event.title, entityType: 'HOME_EVENT', actions: homeEventCorrectionItemActions(access.role !== HouseholdRole.VIEWER), description: event.summary,
          meta: [humanDate(event.occurredAt) ?? 'Date unavailable', event.type.toLowerCase().replace(/_/g, ' '), event.verificationStatus.toLowerCase().replace(/_/g, ' '), event.sourceBadge.toLowerCase().replace(/_/g, ' ')],
          status: event.datePrecision, href: inventoryItemHref(propertyId, selectedItem.id),
        })),
      }],
      actions: [],
    });
  }

  blocks.push({
    type: 'EVIDENCE', id: 'inventory-evidence', title: 'Record freshness',
    items: shown.slice(0, 15).map((item) => ({
      label: item.name,
      source: `Home Inventory · ${item.sourceType.toLowerCase().replace(/_/g, ' ')}${item.verificationSource ? ` · ${item.verificationSource.toLowerCase().replace(/_/g, ' ')}` : ''}`,
      observedAt: item.updatedAt.toISOString(),
    })),
  });

  return {
    status: captureRequests.length || (selectedItem ? inventoryMissingFacts(selectedItem).length > 0 : false) ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length ? 'INVENTORY_LIFECYCLE_CONTEXT_OPTIONAL' : selectedItem && inventoryMissingFacts(selectedItem).length ? 'INVENTORY_RECORD_INCOMPLETE' : undefined,
    contextVersion: lifecycleEvaluation?.contextVersion ?? recordVersion,
    parameters: viewState ? { viewState } : selectedItem ? { inventoryItemId: selectedItem.id } : undefined,
    captureRequests,
    blocks,
    suggestions: selectedItem
      ? ['Show incomplete inventory records', 'Which systems are nearing end of life?', 'List all appliances']
      : ['Show incomplete inventory records', 'Which systems are nearing end of life?', 'List all appliances'],
  };
}

registerCapabilityHandler('inventory.lookup', async (envelope) => inventoryLookupResult(
  envelope.userId, envelope.propertyId!, envelope.message,
  await loadInventoryViewState(envelope.launchContext?.sourceExecutionId, envelope.userId),
));

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3 write slice: corrections on an exact
// InventoryItem, written through the canonical inventoryService.updateItem.
// Each field maps to one editable field on the confirmation card (DATE, SELECT,
// TEXT, TEXTAREA or MONEY). Only these fields are offered; clearing a value is
// not (a blank is rejected), and room, category and links stay on the
// traditional Inventory page.
type InventoryFieldKind = 'DATE' | 'TEXT' | 'TEXTAREA' | 'SELECT' | 'MONEY';


export const inventoryCategoryLabel = (value: string): string => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

const INVENTORY_CONDITION_OPTIONS: readonly CorrectionOption[] = [
  { label: 'New', value: 'NEW' }, { label: 'Good', value: 'GOOD' }, { label: 'Fair', value: 'FAIR' },
  { label: 'Poor', value: 'POOR' }, { label: 'Unknown', value: 'UNKNOWN' },
];

const INVENTORY_CATEGORY_OPTIONS: readonly CorrectionOption[] = INVENTORY_CATEGORY_VALUES.map((value) => ({ label: inventoryCategoryLabel(value), value }));

// Sentinel written into the room dropdown to mean "no room" (parallel to INVENTORY_ITEM_CREATE's INVENTORY_NO_ROOM_VALUE
// and HOME_EVENT_CORRECT's HOME_EVENT_LINK_NONE_VALUE) -- an editable field's value is always a non-empty string.
export const INVENTORY_CORRECTION_NO_ROOM_VALUE = 'NONE';

export const INVENTORY_CORRECTION_FIELDS = {
  installedOn: { label: 'installed date', action: 'Correct install date', message: 'Correct the install date of this inventory item.', kind: 'DATE' as InventoryFieldKind, max: 0, options: [] as readonly CorrectionOption[] },
  purchasedOn: { label: 'purchase date', action: 'Correct purchase date', message: 'Correct the purchase date of this inventory item.', kind: 'DATE' as InventoryFieldKind, max: 0, options: [] as readonly CorrectionOption[] },
  lastServicedOn: { label: 'last serviced date', action: 'Correct last serviced date', message: 'Correct the last serviced date of this inventory item.', kind: 'DATE' as InventoryFieldKind, max: 0, options: [] as readonly CorrectionOption[] },
  condition: { label: 'condition', action: 'Correct condition', message: 'Correct the condition of this inventory item.', kind: 'SELECT' as InventoryFieldKind, max: 0, options: INVENTORY_CONDITION_OPTIONS },
  brand: { label: 'brand', action: 'Correct brand', message: 'Correct the brand of this inventory item.', kind: 'TEXT' as InventoryFieldKind, max: 80, options: [] as readonly CorrectionOption[] },
  model: { label: 'model', action: 'Correct model', message: 'Correct the model of this inventory item.', kind: 'TEXT' as InventoryFieldKind, max: 80, options: [] as readonly CorrectionOption[] },
  serialNo: { label: 'serial number', action: 'Correct serial number', message: 'Correct the serial number of this inventory item.', kind: 'TEXT' as InventoryFieldKind, max: 120, options: [] as readonly CorrectionOption[] },
  purchaseCostCents: { label: 'purchase cost', action: 'Correct purchase cost', message: 'Correct the purchase cost of this inventory item.', kind: 'MONEY' as InventoryFieldKind, max: 0, options: [] as readonly CorrectionOption[] },
  replacementCostCents: { label: 'replacement cost', action: 'Correct replacement cost', message: 'Correct the replacement cost of this inventory item.', kind: 'MONEY' as InventoryFieldKind, max: 0, options: [] as readonly CorrectionOption[] },
  notes: { label: 'notes', action: 'Correct notes', message: 'Correct the notes of this inventory item.', kind: 'TEXTAREA' as InventoryFieldKind, max: 2000, options: [] as readonly CorrectionOption[] },
  category: { label: 'category', action: 'Correct category', message: 'Correct the category of this inventory item.', kind: 'SELECT' as InventoryFieldKind, max: 0, options: INVENTORY_CATEGORY_OPTIONS },
  // No static option list -- inventoryRoomLinkOptions builds it from the property's own rooms at propose and edit
  // time. Like a home event's room/item link, a raw id means nothing to a homeowner, so this is never
  // message-extracted from free text; the confirmation card's dropdown is the only way to choose a value.
  roomId: { label: 'room', action: 'Correct room', message: 'Correct the room of this inventory item.', kind: 'SELECT' as InventoryFieldKind, max: 0, options: [] as readonly CorrectionOption[] },
} as const;

type InventoryCorrectionField = keyof typeof INVENTORY_CORRECTION_FIELDS;

const MAX_INVENTORY_MONEY_DOLLARS = 10_000_000;

export const INVENTORY_ROOM_LINK_FIELD: InventoryCorrectionField = 'roomId';

// Cost fields are checked before the date fields: "purchase cost" and "purchase date" share a word.
function inventoryCorrectionField(message: string): InventoryCorrectionField | null {
  if (/\breplacement\b.{0,12}\b(?:cost|price|value)\b/i.test(message)) return 'replacementCostCents';
  if (/\b(?:purchase[d]?|bought)\b.{0,12}\b(?:cost|price|amount)\b/i.test(message)) return 'purchaseCostCents';
  if (/\binstall(?:ed|ation)?\b/i.test(message)) return 'installedOn';
  if (/\bpurchase[d]?\b/i.test(message)) return 'purchasedOn';
  if (/\b(?:last[- ]serviced|service[d]?)\b/i.test(message)) return 'lastServicedOn';
  if (/\bcondition\b/i.test(message)) return 'condition';
  if (/\bcategory\b/i.test(message)) return 'category';
  if (/\broom\b/i.test(message)) return 'roomId';
  if (/\b(?:brand|manufacturer)\b/i.test(message)) return 'brand';
  if (/\bserial\b/i.test(message)) return 'serialNo';
  if (/\bmodel\b/i.test(message)) return 'model';
  if (/\bnotes?\b/i.test(message)) return 'notes';
  return null;
}

// The value currently recorded for a field, in the same canonical string form the confirmation card edits.
export function inventoryFieldCurrent(item: object, field: InventoryCorrectionField): string | null {
  const raw = (item as Record<string, unknown>)[field];
  const kind = INVENTORY_CORRECTION_FIELDS[field].kind;
  if (kind === 'DATE') return inventoryDateValue(raw as Date | string | null | undefined);
  if (kind === 'MONEY') return typeof raw === 'number' ? (raw / 100).toFixed(2) : null;
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

// Returns a homeowner-facing reason the value is unusable, else null. Async (unlike the other fields) only for the
// room link, which must be re-verified against live, property-scoped data -- a static option list cannot tell a
// stale or cross-property id from a real one.
export async function inventoryFieldValueError(propertyId: string, field: InventoryCorrectionField, value: unknown): Promise<string | null> {
  const meta = INVENTORY_CORRECTION_FIELDS[field];
  if (field === INVENTORY_ROOM_LINK_FIELD) {
    if (value === INVENTORY_CORRECTION_NO_ROOM_VALUE) return null;
    if (typeof value !== 'string' || !value.trim()) return 'Choose a room, or "No room".';
    const found = await prisma.inventoryRoom.findFirst({ where: { id: value, propertyId }, select: { id: true } });
    return found ? null : 'That room is not in this home. Choose a recorded room, or "No room".';
  }
  if (typeof value !== 'string' || !value.trim()) return `Enter the corrected ${meta.label} before confirming.`;
  const text = value.trim();
  if (meta.kind === 'DATE') return isValidDateEditInput(text) ? null : 'Enter a valid date.';
  if (meta.kind === 'SELECT') return meta.options.some((option) => option.value === text) ? null : `Choose one of the listed ${meta.label} values.`;
  if (meta.kind === 'MONEY') {
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) return 'Enter an amount in dollars, such as 850 or 850.50.';
    return Number(text) > MAX_INVENTORY_MONEY_DOLLARS ? 'Enter an amount of $10,000,000 or less.' : null;
  }
  return text.length <= meta.max ? null : `Use at most ${meta.max} characters.`;
}

// The property's own rooms, as SELECT options for the room link, with a leading "No room" entry -- capped like
// every other inline room picker in this file.
export async function inventoryRoomLinkOptions(propertyId: string): Promise<CorrectionOption[]> {
  const rooms = await prisma.inventoryRoom.findMany({ where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 50, select: { id: true, name: true } });
  return [{ label: 'No room', value: INVENTORY_CORRECTION_NO_ROOM_VALUE }, ...rooms.map((room) => ({ label: room.name, value: room.id }))];
}

// Why this item cannot take this category/room correction (the same combined-state rules inventoryService.updateItem
// itself enforces), or null. Pre-checked before offering or accepting a value so a doomed confirmation is never
// shown, and re-checked at confirm against live data as the writer's own defense in depth.
export function inventoryCorrectionCombinedBlocker(item: { name: string; category: string; roomId: string | null }, field: InventoryCorrectionField, normalized: string): string | null {
  if (field !== 'category' && field !== INVENTORY_ROOM_LINK_FIELD) return null;
  const nextCategory = field === 'category' ? normalized : item.category;
  const nextRoomId = field === INVENTORY_ROOM_LINK_FIELD ? (normalized === INVENTORY_CORRECTION_NO_ROOM_VALUE ? null : normalized) : item.roomId;
  if (String(nextCategory) === 'APPLIANCE' && isWaterHeaterInventoryName(item.name)) return 'Water heaters are plumbing systems. Choose the Plumbing category instead.';
  if (ROOM_REQUIRED_CATEGORIES.has(String(nextCategory)) && !nextRoomId) return 'Appliances and belongings need a room. Correct the room first, or choose a category that does not require one.';
  return null;
}

export function inventoryFieldNormalized(field: InventoryCorrectionField, value: string): string {
  const text = value.trim();
  return INVENTORY_CORRECTION_FIELDS[field].kind === 'MONEY' ? Number(text).toFixed(2) : text;
}

export function inventoryFieldPatch(field: InventoryCorrectionField, normalized: string): Record<string, unknown> {
  if (INVENTORY_CORRECTION_FIELDS[field].kind === 'MONEY') return { [field]: Math.round(Number(normalized) * 100) };
  if (field === INVENTORY_ROOM_LINK_FIELD) return { roomId: normalized === INVENTORY_CORRECTION_NO_ROOM_VALUE ? null : normalized };
  return { [field]: normalized };
}

// `dynamicOptions` is only ever passed for the room link (its option list is the property's live rooms, not a
// static one); every other field resolves its label from its own static `meta.options`.
export function inventoryFieldDisplay(field: InventoryCorrectionField, value: string | null, dynamicOptions?: readonly CorrectionOption[]): string {
  if (!value) return 'Not recorded';
  const meta = INVENTORY_CORRECTION_FIELDS[field];
  if (meta.kind === 'MONEY') return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (meta.kind === 'SELECT') return (dynamicOptions ?? meta.options).find((option) => option.value === value)?.label ?? value;
  return value;
}

function inventoryDateValue(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function inventoryItemContextVersion(item: { id: string; updatedAt: Date }): string {
  return createHash('sha256').update(`${item.id}:${item.updatedAt.toISOString()}`).digest('hex');
}

// Item actions offered from the inline inventory detail. Contributor-and-up
// only -- a VIEWER never receives a control implying the write will be accepted.
export function inventoryCorrectionItemActions(canManage: boolean) {
  if (!canManage) return undefined;
  return (Object.keys(INVENTORY_CORRECTION_FIELDS) as InventoryCorrectionField[]).map((field) => ({
    id: `correct-${field}`, label: INVENTORY_CORRECTION_FIELDS[field].action, message: INVENTORY_CORRECTION_FIELDS[field].message,
    style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INVENTORY_ITEM_CORRECT',
  }));
}

export function inventoryCorrectionConfirmation(item: { id: string; name: string }, field: InventoryCorrectionField, current: string | null, proposed: string | null, version: number, expiresAt: Date, dynamicOptions?: readonly CorrectionOption[]) {
  const meta = INVENTORY_CORRECTION_FIELDS[field];
  return {
    confirmationId: `inventory-correct-${item.id}-${version}`, version, title: `Correct ${meta.label} for ${item.name}?`,
    description: 'This writes through the canonical inventory service, the same record the Inventory page edits, and refreshes dependent coverage and replace-or-repair analysis.',
    fields: [{ label: 'Item', value: item.name }, { label: 'Field', value: meta.label }, { label: 'Current value', value: inventoryFieldDisplay(field, current, dynamicOptions) }],
    editableFields: [{
      key: 'value', label: `Corrected ${meta.label}`, type: meta.kind, value: proposed ?? '',
      ...(meta.kind === 'SELECT' ? { options: [...(dynamicOptions ?? meta.options)] } : {}),
    }],
    confirmLabel: `Save ${meta.label}`, consentText: 'I authorize this correction to the shared home inventory record.', expiresAt: expiresAt.toISOString(),
  };
}

async function inventoryItemCorrectResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const inventoryHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items`;
  const items = await inventoryService.listItems(propertyId, {});
  const selected = exactEntityMatch(items.map((item) => ({ ...item, title: item.name })), message, launchContext);
  if (!selected) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'INVENTORY_ITEM_TARGET_REQUIRED',
      ...durableFreeTextClarification('INVENTORY_ITEM_CORRECT', 'Which inventory item should Ask correct? Use its exact name.'),
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'inventory-entity-selection', title: 'Choose the item to correct',
        description: 'Use the exact item name in your next message; nothing has changed.',
        sections: [{ id: 'items', title: 'Inventory items', count: items.length, items: items.slice(0, 20).map((item) => ({
          id: item.id, title: item.name, entityType: 'INVENTORY_ITEM', description: null,
          meta: [item.room?.name, item.category.toLowerCase().replace(/_/g, ' ')].filter((value): value is string => Boolean(value)), status: item.condition, href: null,
        })) }],
        actions: [{ id: 'open-inventory', label: 'Open home inventory', href: inventoryHref, style: 'SECONDARY' }],
      }],
      suggestions: items.slice(0, 3).map((item) => `Correct the install date of ${item.name}`),
    };
  }
  const field = inventoryCorrectionField(message);
  if (!field) {
    return {
      status: 'NEEDS_CLARIFICATION', reasonCode: 'INVENTORY_CORRECTION_FIELD_REQUIRED',
      ...durableFreeTextClarification('INVENTORY_ITEM_CORRECT', `Which detail should change for ${selected.name}? Ask can correct its dates, condition, brand, model, serial number, costs, notes, room, or category.`),
      blocks: [{ type: 'SUMMARY', id: 'inventory-correct-field', title: `Which detail should change for ${selected.name}?`, body: 'Say which one: install date, purchase date, last serviced date, condition, brand, model, serial number, purchase cost, replacement cost, or notes. Nothing has changed.', tone: 'CAUTION', actions: [] }],
      suggestions: [`Correct the install date of ${selected.name}`, `Correct the purchase date of ${selected.name}`],
    };
  }
  const current = inventoryFieldCurrent(selected, field);
  const isRoomLink = field === INVENTORY_ROOM_LINK_FIELD;
  const dynamicOptions = isRoomLink ? await inventoryRoomLinkOptions(propertyId) : undefined;
  const stated = INVENTORY_CORRECTION_FIELDS[field].kind === 'DATE' ? message.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null : null;
  // The room link always pre-selects the item's current room (or "No room") rather than extracting one from free
  // text -- a raw id typed into a message would mean nothing, and the dropdown is the only supported way to choose one.
  const proposed = isRoomLink ? (current ?? INVENTORY_CORRECTION_NO_ROOM_VALUE) : (stated && isValidDateEditInput(stated) ? stated : current);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const contextVersion = inventoryItemContextVersion(selected);
  const input = InventoryItemCorrectionInputSchema.parse({ itemId: selected.id, field, value: proposed });
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INVENTORY_CORRECTION_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      inventoryCorrection: input, inventoryCorrectionContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null,
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'inventory-correct-review', title: `Review this ${INVENTORY_CORRECTION_FIELDS[field].label} correction`, body: 'No shared-home record has changed yet. Enter the corrected value, then confirm.', tone: 'DEFAULT', actions: [{ id: 'open-inventory', label: 'Open home inventory', href: inventoryHref, style: 'SECONDARY' }] }],
    confirmation: inventoryCorrectionConfirmation(selected, field, current, proposed, 1, expiresAt, dynamicOptions),
    suggestions: [],
  };
}

registerCapabilityHandler('inventory.item-correct', async (envelope) => inventoryItemCorrectResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

// ── Add an inventory item (user-initiated) ───────────────────────────────────────────────────────────────
// An item is added inline only from the declared "Add an item" action. The form collects identity only (name,
// category, room, optional brand and model); dates, costs, condition and notes are then correctable inline through
// INVENTORY_ITEM_CORRECT. Confirming writes through inventoryService.createItem -- the same writer the Inventory page
// uses, including its water-heater, room-required and one-per-major-appliance rules -- and repeats the three
// stale-analysis markers the traditional POST controller calls.
export const INVENTORY_ADD_MESSAGE = 'Add an item to my home inventory.';

export const INVENTORY_CREATE_CAPTURE_KEY = 'INVENTORY_ITEM_CREATE_INPUTS';

export const INVENTORY_NO_ROOM_VALUE = 'NONE';

type InventoryCreateInput = z.infer<typeof InventoryCreateInputSchema>;

export const inventoryAddItemAction = () => ({ id: 'add-inventory-item', label: 'Add an item', interactionType: 'START_WORKFLOW' as const, message: INVENTORY_ADD_MESSAGE, operationId: 'INVENTORY_ITEM_CREATE', style: 'PRIMARY' as const });

export async function inventoryCreateRooms(propertyId: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.inventoryRoom.findMany({ where: { propertyId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 50 });
}

// The room options are part of the form, so the version changes when the room list does.
const inventoryCreateVersionFor = (propertyId: string, rooms: Array<{ id: string }>): string => createHash('sha256').update(`inventory-create:${propertyId}:${rooms.map((room) => room.id).sort().join(',')}`).digest('hex');

export async function inventoryCreateContextVersion(propertyId: string): Promise<string> {
  return inventoryCreateVersionFor(propertyId, await inventoryCreateRooms(propertyId));
}

function inventoryCreateCaptureRequest(contextVersion: string, rooms: Array<{ id: string; name: string }>, entered?: Partial<InventoryCreateInput>): AskCaptureRequest {
  return {
    requirementId: 'inventory-create-inputs', captureKey: INVENTORY_CREATE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Add an item', question: 'Which item would you like to add to your home inventory?',
    helpText: 'Appliances and belongings need a room; whole-home systems such as HVAC or plumbing do not. Dates, costs and notes can be corrected after it is added. You will review everything before it is added.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'name', label: 'Item name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
      { key: 'category', label: 'Category', required: true, inputSchema: { type: 'SINGLE_SELECT', options: INVENTORY_CATEGORY_VALUES.map((value) => ({ label: inventoryCategoryLabel(value), value })) } },
      { key: 'roomId', label: 'Room', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [...rooms.map((room) => ({ label: room.name, value: room.id })), { label: 'No room (whole-home)', value: INVENTORY_NO_ROOM_VALUE }] } },
      { key: 'brand', label: 'Brand', helpText: 'Optional.', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 80 } },
      { key: 'model', label: 'Model', helpText: 'Optional.', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 80 } },
    ] },
    currentAnswer: { name: entered?.name ?? null, category: entered?.category ?? null, roomId: entered?.roomId ?? null, brand: entered?.brand ?? null, model: entered?.model ?? null },
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this item; nothing is added until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

// The writer's own rules, checked before the review card so a doomed request is corrected up front instead of failing
// at confirm. Returns the reason the item cannot be added, or null.
export async function inventoryCreateBlocker(propertyId: string, input: InventoryCreateInput, rooms: Array<{ id: string; name: string }>): Promise<{ code: string; title: string; body: string } | null> {
  if (input.roomId !== INVENTORY_NO_ROOM_VALUE && !rooms.some((room) => room.id === input.roomId)) {
    return { code: 'INVENTORY_ROOM_UNKNOWN', title: 'That room is not in this home', body: 'Choose one of the recorded rooms, or "No room". Nothing has been added.' };
  }
  if (ROOM_REQUIRED_CATEGORIES.has(input.category) && input.roomId === INVENTORY_NO_ROOM_VALUE) {
    return { code: 'INVENTORY_ROOM_REQUIRED', title: 'Choose a room for this item', body: rooms.length ? 'Appliances and belongings need a room; only whole-home systems can be recorded without one. Nothing has been added.' : 'Appliances and belongings need a room and this home has none yet. Add a room first (Show my rooms), then add the item. Nothing has been added.' };
  }
  if (input.category === 'APPLIANCE' && isWaterHeaterInventoryName(input.name)) {
    return { code: 'INVENTORY_WATER_HEATER_CATEGORY', title: 'Water heaters are plumbing systems', body: 'Choose the Plumbing category for a water heater. Nothing has been added.' };
  }
  if (input.category === 'APPLIANCE') {
    const inferred = inferMajorApplianceType(input.name);
    if (inferred) {
      const existing = await prisma.inventoryItem.findFirst({ where: { propertyId, sourceHash: `${PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX}${inferred}` }, select: { id: true } });
      if (existing) return { code: 'INVENTORY_APPLIANCE_EXISTS', title: `A ${formatMajorApplianceType(inferred).toLowerCase()} is already recorded`, body: 'This home keeps one record per major appliance. Correct the existing item instead. Nothing has been added.' };
    }
  }
  return null;
}

export async function inventoryItemCreateResult(userId: string, propertyId: string, suppliedInput: InventoryCreateInput | undefined, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const inventoryHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items`;
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'inventory-add-permission', title: 'A contributor or owner can add an item', body: 'Your role can view the inventory but not add to it. Nothing has changed.', tone: 'CAUTION', actions: [{ id: 'open-inventory', label: 'Open home inventory', href: inventoryHref, style: 'SECONDARY' }] }],
      suggestions: [],
    };
  }
  const rooms = await inventoryCreateRooms(propertyId);
  const contextVersion = inventoryCreateVersionFor(propertyId, rooms);
  const openInventory = { id: 'open-inventory', label: 'Open inventory instead', href: inventoryHref, style: 'SECONDARY' as const };
  if (!suppliedInput) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'INVENTORY_CREATE_INPUT_REQUIRED', contextVersion,
      parameters: { sourceExecutionId },
      blocks: [{ type: 'SUMMARY', id: 'inventory-create-input', title: 'Add an item', body: 'Nothing has been added yet. Enter the details, then review them before the item is added.', tone: 'DEFAULT', actions: [openInventory] }],
      captureRequests: [inventoryCreateCaptureRequest(contextVersion, rooms)], suggestions: [],
    };
  }
  const blocker = await inventoryCreateBlocker(propertyId, suppliedInput, rooms);
  if (blocker) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: blocker.code, contextVersion,
      parameters: { sourceExecutionId },
      blocks: [{ type: 'SUMMARY', id: 'inventory-create-blocked', title: blocker.title, body: blocker.body, tone: 'CAUTION', actions: [openInventory] }],
      captureRequests: [inventoryCreateCaptureRequest(contextVersion, rooms, suppliedInput)], suggestions: [],
    };
  }
  const roomName = suppliedInput.roomId === INVENTORY_NO_ROOM_VALUE ? 'No room (whole-home)' : rooms.find((room) => room.id === suppliedInput.roomId)?.name ?? '';
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INVENTORY_CREATE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { inventoryCreate: suppliedInput, inventoryCreateContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'inventory-create-review', title: 'Review this item', body: 'You entered these details. Nothing is added until you confirm.', tone: 'DEFAULT', actions: [openInventory] }],
    confirmation: {
      confirmationId: `inventory-create-${createHash('sha256').update(`${propertyId}:${suppliedInput.name}:${suppliedInput.category}`).digest('hex').slice(0, 12)}-1`, version: 1,
      title: `Add "${suppliedInput.name}" to your inventory?`,
      description: 'This adds the item through the canonical inventory service, the same record the Inventory page edits, and refreshes dependent coverage analysis.',
      fields: [
        { label: 'Item name', value: suppliedInput.name }, { label: 'Category', value: inventoryCategoryLabel(suppliedInput.category) }, { label: 'Room', value: roomName },
        ...(suppliedInput.brand ? [{ label: 'Brand', value: suppliedInput.brand }] : []),
        ...(suppliedInput.model ? [{ label: 'Model', value: suppliedInput.model }] : []),
      ],
      editableFields: [], confirmLabel: 'Add item', consentText: 'I authorize adding this item to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    // Kept so the entry can be changed and resubmitted before confirming.
    captureRequests: [inventoryCreateCaptureRequest(contextVersion, rooms, suppliedInput)],
    suggestions: [],
  };
}

registerCapabilityHandler('inventory.create', async (envelope) => {
  const declaredAddAction = envelope.launchContext?.operationId === 'INVENTORY_ITEM_CREATE'
    && envelope.launchContext.surface !== 'ASK_REFRESH'
    && envelope.message === INVENTORY_ADD_MESSAGE;
  if (declaredAddAction) return inventoryItemCreateResult(envelope.userId, envelope.propertyId!, undefined, envelope.launchContext?.sourceExecutionId ?? null);
  // A refresh of an in-progress add, or a bare message: never start (or reset) a form here.
  return {
    status: 'NOT_APPLICABLE', reasonCode: 'ASK_INVENTORY_CREATE_NOT_DIRECTLY_ROUTABLE',
    blocks: [{ type: 'SUMMARY', id: 'inventory-create-not-routable', title: 'Use the Add an item button', body: 'Items are added from the inventory list in your home summary. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
    suggestions: ['Show my inventory'],
  };
});
