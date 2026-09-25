// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole, MaintenanceTaskStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { askModelDurationSeconds, askRemoteGenerationCharactersTotal, askRemoteGenerationTotal } from '../../../lib/metrics';
import { PropertyMaintenanceTaskService } from '../../PropertyMaintenanceTask.service';
import { answerGroundedAsk } from '../../groundedAsk.service';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import type { CapabilityInvocationEnvelope } from '../capabilityInvocation.contract';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { assertCoverageConflictFree } from '../../coverageConflict.service';
import { queryIntelligenceEnvelope } from '../../intelligenceEnvelope';
import { ReplaceRepairService } from '../../replaceRepairAnalysis.service';
import { humanDate, money } from '../askFormatting';
import { durableFreeTextClarification, ensurePropertyAccess, exactEntityMatch, GuidanceJourneyCommandInputSchema, guidanceJourneyContextVersion, HOME_CHANGE_SUMMARY_WINDOW_DAYS, HomeDeadlineMonitorInputSchema, homeDeadlineSourceVersion, MaintenanceCompletionWorkflowInput, RadarEnvelopeQuerySuppliedInput } from '../askHandlerSupport';
import { EVENT_ADD_MESSAGE, eventAddResult, evidenceAttachResult, WARRANTY_ADD_MESSAGE, warrantyAddResult } from '../handlers/homeRecordWrites.handler';
import { hvacDecisionStartResult } from '../handlers/hvacDecision.handler';
import { extractMaintenanceCompletionInput, maintenanceCompletionMatch, maintenanceMonitorSubject, maintenanceTaskCompleteResult, maintenanceTaskUpdateResult, maintenanceTaskVersion, maintenanceWorkflowVersion } from '../handlers/maintenance.handler';
import * as decisionPreferenceService from '../../decisionPlatform/decisionPreferenceService';
import { listPropertyChanges } from '../../../propertyChanges/propertyChange.service';
import { buildChangeSummaryText, sourceTypeLabel } from '../../decisionPlatform/homeChangeSummaryMapping';
import { type SkillExecutionTimingTrace } from '../../skills/skillExecutionTelemetry';
import { resolveAskEnvelopeQueryScope } from '../askEnvelopeQueryScope';
import { listWorkItems } from '../../../modules/homeOperations/application/listWorkItems.usecase';
import { assertUserWorkItemTransition } from '../../../modules/homeOperations/domain/userGovernance';

const replaceRepairService = new ReplaceRepairService();

async function guidanceJourneyCreateResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const inventory = await prisma.inventoryItem.findMany({ where: { propertyId }, select: { id: true, name: true }, take: 100 });
  const lower = message.toLowerCase();
  const item = inventory.find((candidate) => lower.includes(candidate.name.toLowerCase()));
  let input: z.infer<typeof GuidanceJourneyCommandInputSchema> | null = null;
  if (item) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'ITEM', scopeId: item.id, issueType: /replace|end of life|aging/i.test(message) ? 'near_end_of_life' : /leak/i.test(message) ? 'leak' : 'maintenance_needed', inventoryItemId: item.id, serviceKey: null, label: item.name });
  else if (/warranty/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'warranty_purchase', issueType: /renew/i.test(message) ? 'warranty_renewal' : 'purchase_warranty', inventoryItemId: null, serviceKey: 'warranty_purchase', label: 'Home warranty' });
  else if (/insurance|coverage/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'insurance_purchase', issueType: /renew/i.test(message) ? 'policy_renewal' : /compare|quote/i.test(message) ? 'compare_rates' : 'purchase_insurance', inventoryItemId: null, serviceKey: 'insurance_purchase', label: 'Home insurance' });
  else if (/clean/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'cleaning_service', issueType: 'arrange_cleaning', inventoryItemId: null, serviceKey: 'cleaning_service', label: 'Cleaning service' });
  else if (/inspect/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'general_inspection', issueType: 'schedule_inspection', inventoryItemId: null, serviceKey: 'general_inspection', label: 'Home inspection' });
  if (!input) return {
    status: 'NEEDS_ENTITY', reasonCode: 'GUIDANCE_JOURNEY_SCOPE_REQUIRED',
    ...durableFreeTextClarification('GUIDANCE_JOURNEY_CREATE', 'What recorded item or approved home service should the guided plan cover?'),
    blocks: [{ type: 'SUMMARY', id: 'journey-scope', title: 'What should the guided plan cover?', body: 'Name a recorded appliance/system, warranty, insurance decision, inspection, or cleaning need. Ask will not start an ungrounded workflow.', tone: 'CAUTION', actions: [] }],
    suggestions: inventory.slice(0, 3).map((candidate) => `Start a guided plan for ${candidate.name}`),
  };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const contextVersion = await guidanceJourneyContextVersion(propertyId, input);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'GUIDANCE_JOURNEY_CONFIRMATION_REQUIRED', contextVersion, parameters: { guidanceJourney: input, guidanceJourneyContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'journey-review', title: 'Review this guided plan', body: 'No journey has been started yet.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `guidance-journey-${propertyId}-1`, version: 1, title: `Start a guided plan for ${input.label}?`, description: 'This creates a canonical, resumable guidance journey for the selected home.', fields: [{ label: 'Scope', value: input.label }, { label: 'Plan type', value: input.issueType.replace(/_/g, ' ') }], editableFields: [], confirmLabel: 'Start guided plan', consentText: 'I authorize creating this guided plan in the shared home record.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

export async function homeDeadlineMonitorResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const leadDays = Math.min(90, Math.max(1, Number(message.match(/(\d{1,2})\s*days?\s*(?:before|ahead)/i)?.[1] ?? 30)));
  const warrantyFocus = /warrant/i.test(message);
  const insuranceFocus = /insurance|policy|coverage/i.test(message);
  const maintenanceFocus = /maintenance|task/i.test(message) && !warrantyFocus && !insuranceFocus;
  if (maintenanceFocus) {
    const openTasks = (await PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: false }))
      .filter((task) => task.status !== MaintenanceTaskStatus.CANCELLED);
    const matchedTask = maintenanceCompletionMatch(maintenanceMonitorSubject(message), openTasks);
    const tasks = openTasks.filter((task) => task.nextDueDate);
    const selected = matchedTask?.nextDueDate ? matchedTask : null;
    const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`;
    if (matchedTask && !matchedTask.nextDueDate) {
      const contextVersion = await maintenanceWorkflowVersion(propertyId);
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'MAINTENANCE_MONITOR_DUE_DATE_REQUIRED', contextVersion,
        parameters: { maintenanceWorkflowVersion: contextVersion },
        blocks: [{ type: 'SUMMARY', id: 'maintenance-monitor-date', title: `Add a due date for ${matchedTask.title}`, body: 'The task is recorded but cannot drive a real reminder until it has a future due date. Add it here and Ask will continue to reminder confirmation.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${maintenanceHref}&taskId=${encodeURIComponent(matchedTask.id)}`, style: 'SECONDARY' }] }],
        captureRequests: [{ requirementId: `maintenance-monitor-date-${contextVersion.slice(0, 20)}`, captureKey: 'HOME_DEADLINE_MAINTENANCE_DUE_DATE', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: 'Maintenance due date', question: `When is ${matchedTask.title} due?`, helpText: 'The date is saved to the canonical Maintenance task and reused by Home Actions and reminder workflows.', inputSchema: { type: 'GROUP', fields: [{ key: 'taskId', label: 'Task', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: matchedTask.title, value: matchedTask.id }] } }, { key: 'nextDueDate', label: 'Due date', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } }] }, currentAnswer: { taskId: matchedTask.id }, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Saved to the selected Maintenance task', confirmationText: null, expectedContextVersion: contextVersion }],
        suggestions: [],
      };
    }
    if (!selected) return {
      status: 'NEEDS_ENTITY', reasonCode: 'MAINTENANCE_MONITOR_TASK_REQUIRED',
      ...durableFreeTextClarification('HOME_DEADLINE_MONITOR', 'Which dated maintenance task should Ask monitor?'),
      blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'maintenance-monitor-options', title: 'Choose a dated maintenance task', description: tasks.length ? 'Use the exact task title in your next message. No notification preference has changed.' : 'No open maintenance task with a due date is recorded yet. Add or schedule the task first.', sections: [{ id: 'tasks', title: 'Dated maintenance tasks', count: tasks.length, items: tasks.slice(0, 20).map((task) => ({ id: task.id, title: task.title, description: `Due ${humanDate(task.nextDueDate)}`, meta: [task.priority], status: task.status, href: `${maintenanceHref}&taskId=${encodeURIComponent(task.id)}` })) }], actions: [{ id: 'open-maintenance', label: 'Open Maintenance', href: maintenanceHref, style: 'PRIMARY' }] }],
      suggestions: tasks.slice(0, 3).map((task) => `Remind me when ${task.title} is due`),
    };
    const input = HomeDeadlineMonitorInputSchema.parse({ sourceType: 'MAINTENANCE', sourceId: selected.id, title: selected.title, dueDate: selected.nextDueDate!.toISOString().slice(0, 10), leadDays: 7 });
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_MONITOR_CONFIRMATION_REQUIRED', contextVersion: maintenanceTaskVersion(selected),
      parameters: { homeDeadlineMonitor: input, maintenanceTaskVersion: maintenanceTaskVersion(selected), confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
      blocks: [{ type: 'SUMMARY', id: 'maintenance-monitor-review', title: 'Review maintenance reminders', body: 'The existing dated task already drives in-app reminders. Confirming enables scoped email delivery; it does not create a duplicate task.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${maintenanceHref}&taskId=${encodeURIComponent(selected.id)}`, style: 'SECONDARY' }] }],
      confirmation: { confirmationId: `maintenance-monitor-${selected.id}-1`, version: 1, title: `Enable reminders for ${selected.title}?`, description: 'The governed reminder worker checks dated maintenance tasks inside its seven-day horizon.', fields: [{ label: 'Task', value: selected.title }, { label: 'Due', value: humanDate(selected.nextDueDate) ?? input.dueDate }, { label: 'Delivery', value: 'In-app plus email' }, { label: 'Reminder window', value: 'Within 7 days of the due date' }], editableFields: [], confirmLabel: 'Enable reminders', consentText: 'I consent to receive maintenance deadline reminders by email and in the app.', expiresAt: expiresAt.toISOString() }, suggestions: [],
    };
  }
  const [warranty, policy, policiesMissingExpiry] = await Promise.all([
    warrantyFocus ? prisma.warranty.findFirst({ where: { propertyId, expiryDate: { gt: new Date() } }, orderBy: { expiryDate: 'asc' } }) : null,
    insuranceFocus ? prisma.insurancePolicy.findFirst({ where: { propertyId, expiryDate: { gt: new Date() } }, orderBy: { expiryDate: 'asc' } }) : null,
    insuranceFocus ? prisma.insurancePolicy.findMany({ where: { propertyId, expiryDate: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], select: { id: true, carrierName: true, coverageType: true, updatedAt: true } }) : [],
  ]);
  const source = warranty ?? policy;
  if (!source) {
    const contextVersion = createHash('sha256').update(JSON.stringify(policiesMissingExpiry)).digest('hex');
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'EXPIRATION_DATE_REQUIRED', contextVersion,
      parameters: { homeDeadlineCaptureVersion: contextVersion },
      blocks: [{ type: 'SUMMARY', id: 'deadline-source-missing', title: 'Add the expiration date first', body: policiesMissingExpiry.length
        ? 'The policy is recorded, but its expiration date is missing. Add it here and Ask will immediately continue to the reminder review.'
        : 'No future expiration or editable undated policy is recorded. Add the coverage record first, then return to activate a real reminder.', tone: 'CAUTION', actions: [{ id: 'open-coverage', label: 'Review coverage records', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'SECONDARY' }] }],
      captureRequests: policiesMissingExpiry.length ? [{
        requirementId: `home-deadline-expiry-${contextVersion.slice(0, 20)}`,
        captureKey: 'HOME_DEADLINE_EXPIRATION_DATE', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Policy expiration date', question: 'Which policy should be monitored, and when does it expire?',
        helpText: 'This date is saved to the canonical insurance policy, then reused by Coverage and reminder workflows.',
        inputSchema: { type: 'GROUP', fields: [
          { key: 'policyId', label: 'Policy', required: true, inputSchema: { type: 'SINGLE_SELECT', options: policiesMissingExpiry.map((candidate) => ({ label: `${candidate.carrierName}${candidate.coverageType ? ` — ${candidate.coverageType}` : ''}`, value: candidate.id })) } },
          { key: 'expiryDate', label: 'Expiration date', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
        ] },
        currentAnswer: policiesMissingExpiry.length === 1 ? { policyId: policiesMissingExpiry[0].id } : {},
        allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Saved to the selected insurance policy', confirmationText: null,
        expectedContextVersion: contextVersion,
      }] : [], suggestions: [],
    };
  }
  try {
    await assertCoverageConflictFree(propertyId, prisma, warranty
      ? { warrantyId: warranty.id }
      : { insurancePolicyId: policy!.id });
  } catch (error) {
    const details = (error as { details?: { resolutionPath?: string } }).details;
    return {
      status: 'NEEDS_CONTEXT',
      reasonCode: 'COVERAGE_CONFLICT_REVIEW_REQUIRED',
      contextVersion: createHash('sha256').update(`coverage-conflict:${source.id}`).digest('hex'),
      parameters: {},
      blocks: [{
        type: 'SUMMARY', id: 'coverage-conflict', title: 'Resolve the coverage conflict first',
        body: 'Two records disagree, so Ask will not choose one for an expiration reminder. Review both sources and select the correct record.',
        tone: 'CAUTION',
        actions: [{ id: 'resolve-coverage-conflict', label: 'Resolve coverage conflict', href: details?.resolutionPath ?? '/dashboard/insurance', style: 'PRIMARY' }],
      }],
      captureRequests: [], suggestions: [],
    };
  }
  const expiry = source.expiryDate!;
  const due = new Date(expiry.getTime() - leadDays * 86_400_000);
  const sourceType = warranty ? 'WARRANTY' as const : 'INSURANCE_POLICY' as const;
  const provider = warranty ? warranty.providerName : policy!.carrierName;
  const input = HomeDeadlineMonitorInputSchema.parse({ sourceType, sourceId: source.id, title: `Review ${provider} ${warranty ? 'warranty' : 'insurance policy'} before expiration`, dueDate: due.toISOString().slice(0, 10), leadDays });
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DEADLINE_MONITOR_CONFIRMATION_REQUIRED', parameters: { homeDeadlineMonitor: input, homeDeadlineSourceVersion: homeDeadlineSourceVersion(source), confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'deadline-monitor-review', title: 'Review this expiration reminder', body: 'Ask will create a dated canonical Maintenance obligation so the existing governed reminder worker can notify you.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `home-deadline-${source.id}-1`, version: 1, title: `Monitor this ${warranty ? 'warranty' : 'policy'} expiration?`, description: 'This creates one deduplicated reminder task and enables expiration-deadline email preferences for this home. It does not change maintenance-task email preferences.', fields: [{ label: 'Provider', value: provider }, { label: 'Expires', value: expiry.toISOString().slice(0, 10) }, { label: 'Reminder date', value: input.dueDate }, { label: 'Channel', value: 'In-app plus email' }], editableFields: [], confirmLabel: 'Activate reminder', consentText: 'I consent to receive this expiration-deadline reminder by email and in the app.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

async function replacementGuidanceResult(userId: string, propertyId: string, message: string, focusedInventoryItemId: string | null | undefined, executionId: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const allItems = await prisma.inventoryItem.findMany({
    where: { propertyId }, orderBy: [{ isVerified: 'desc' }, { updatedAt: 'desc' }], take: 200,
    select: { id: true, name: true, category: true, assetType: true, brand: true, model: true, condition: true, installedOn: true, purchasedOn: true, expectedExpiryDate: true, updatedAt: true },
  });
  const query = message.toLowerCase().replace(/\b(?:when|should|i|we|repair|replace|replacement|versus|vs|my|our|the|is|it|time|good|to|do)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases = /\b(?:hvac|furnace|air conditioner|heat pump)\b/i.test(message) ? ['hvac', 'furnace', 'air conditioner', 'heat pump']
    : /\b(?:refrigerator|fridge)\b/i.test(message) ? ['refrigerator', 'fridge']
      : /\bwater heater\b/i.test(message) ? ['water heater']
        : /\b(?:roof|roofing)\b/i.test(message) ? ['roof']
          : /\b(?:washer|washing machine)\b/i.test(message) ? ['washer', 'washing machine']
            : /\bdryer\b/i.test(message) ? ['dryer']
              : /\bdishwasher\b/i.test(message) ? ['dishwasher'] : query ? [query] : [];
  const itemText = (item: typeof allItems[number]) => [item.name, item.category, item.assetType, item.brand, item.model].filter(Boolean).join(' ').toLowerCase();
  const items = focusedInventoryItemId
    ? allItems.filter((item) => item.id === focusedInventoryItemId)
    : aliases.length ? allItems.filter((item) => aliases.some((alias) => itemText(item).includes(alias) || alias.includes(item.name.toLowerCase()))) : [];
  if (!items.length) {
    return {
      status: 'READY_WITH_LIMITATIONS',
      reasonCode: 'REPAIR_REPLACE_ITEM_NOT_IN_HOME_RECORD',
      blocks: [{
        type: 'SUMMARY', id: 'repair-replace-no-item', title: 'Choose a recorded appliance or home system first',
        body: `I could not resolve this request to one canonical inventory item. Ask will not manufacture a repair/replace calculation without the item’s condition, lifecycle, cost, and repair history.${allItems.length ? ` This home has ${allItems.length} recorded item${allItems.length === 1 ? '' : 's'}.` : ''}`,
        tone: 'CAUTION',
        actions: [{ id: 'open-inventory', label: allItems.length ? 'Choose from inventory' : 'Add an inventory item', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'PRIMARY' }],
      }],
      suggestions: allItems.slice(0, 3).map((item) => `Should I repair or replace ${item.name}?`),
    };
  }
  if (items.length > 1) {
    return {
      status: 'NEEDS_ENTITY',
      reasonCode: 'MULTIPLE_REPAIR_REPLACE_ITEMS',
      ...durableFreeTextClarification('REPLACEMENT_GUIDANCE', 'Which recorded appliance or home system should Ask analyze?'),
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'repair-replace-selection', title: 'Which item should I analyze?',
        description: 'Use the item’s exact name, room, brand, or model. Ask will not combine separate systems into one verdict.',
        sections: [{ id: 'matches', title: 'Possible matches', count: items.length, items: items.map((item) => ({
          id: item.id, title: item.name, description: [item.brand, item.model].filter(Boolean).join(' ') || null, status: item.condition, meta: [item.category.toLowerCase().replace(/_/g, ' ')],
          href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?openItemId=${encodeURIComponent(item.id)}`,
        })) }], actions: [],
      }],
      suggestions: items.slice(0, 3).map((item) => `Should I repair or replace ${item.name}?`),
    };
  }

  const item = items[0];
  if (item.category === 'HVAC') {
    return hvacDecisionStartResult(userId, propertyId, message, executionId, item.id);
  }
  const evaluation = await evaluateFeatureContext(propertyId, userId, {
    featureKey: 'REPAIR_REPLACE', operationKey: 'RUN_ANALYSIS', operationInput: { inventoryItemId: item.id },
  });
  const captureRequests: AskCaptureRequest[] = access.role === HouseholdRole.VIEWER ? [] : evaluation.requirements.slice(0, 1).map((requirement) => ({
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
    destinationLabel: 'Saved to this item’s Home Record',
    confirmationText: null,
    expectedContextVersion: evaluation.contextVersion,
  }));
  const analysis = await replaceRepairService.runItemAnalysis(propertyId, item.id, userId, undefined, evaluation.contextVersion);
  const verdict = analysis.verdict.toLowerCase().replace(/_/g, ' ');
  const rows = [
    { id: 'repair', values: { path: 'Estimated next repair', amount: analysis.estimatedNextRepairCostCents == null ? 'Not available' : money(analysis.estimatedNextRepairCostCents / 100), meaning: 'Modeled from category defaults, condition, and recorded repair history' } },
    { id: 'replace', values: { path: 'Estimated replacement', amount: analysis.estimatedReplacementCostCents == null ? 'Not available' : money(analysis.estimatedReplacementCostCents / 100), meaning: 'Planning estimate—not a contractor or retailer quote' } },
    { id: 'risk', values: { path: 'Annual repair risk', amount: analysis.expectedAnnualRepairRiskCents == null ? 'Not available' : money(analysis.expectedAnnualRepairRiskCents / 100), meaning: 'Probability-weighted planning exposure' } },
  ];
  return {
    status: captureRequests.length || analysis.confidence !== 'HIGH' ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length ? 'LIFECYCLE_CONTEXT_OPTIONAL' : analysis.confidence !== 'HIGH' ? 'REPAIR_REPLACE_CONFIDENCE_LIMITED' : undefined,
    contextVersion: evaluation.contextVersion,
    parameters: { inventoryItemId: item.id },
    captureRequests,
    blocks: [{
      type: 'SUMMARY', id: 'repair-replace-guidance', title: `${item.name}: ${verdict}`,
      body: `${analysis.summary ?? `The canonical model currently indicates ${verdict}.`} Confidence is ${analysis.confidence.toLowerCase()}.${analysis.breakEvenMonths == null ? '' : ` Modeled break-even is about ${analysis.breakEvenMonths} months.`}`,
      tone: ['REPLACE_NOW', 'REPLACE_SOON'].includes(analysis.verdict) ? 'CAUTION' : 'DEFAULT',
      actions: [{ id: 'open-repair-replace', label: 'Open Repair vs Replace', href: `/dashboard/replace-repair?propertyId=${encodeURIComponent(propertyId)}&inventoryItemId=${encodeURIComponent(item.id)}`, style: 'PRIMARY' }],
    }, { type: 'TABLE', id: 'repair-replace-costs', title: 'Modeled decision inputs', description: 'Amounts are planning estimates from the canonical Repair vs Replace engine.', columns: [{ key: 'path', label: 'Measure' }, { key: 'amount', label: 'Amount' }, { key: 'meaning', label: 'How to interpret it' }], rows, actions: [] },
    { type: 'GROUPED_LIST', filters: [], id: 'repair-replace-trace', title: 'Why the model reached this result', description: 'Decision factors are bounded to the item and its recorded history.', sections: [{ id: 'factors', title: 'Decision factors', count: analysis.decisionTrace.length, items: analysis.decisionTrace.slice(0, 12).map((factor, index) => ({ id: `factor-${index}`, title: factor.label, description: factor.detail, meta: [factor.impact], status: null, href: null })) }], actions: [] },
    { type: 'EVIDENCE', id: 'repair-replace-evidence', title: 'Record and model freshness', items: [{ label: item.name, source: 'Living Home Record and Repair vs Replace engine', observedAt: analysis.computedAt }] },
    { type: 'BOUNDARY', id: 'repair-replace-boundary', title: 'Planning guidance—not a diagnosis or quote', body: 'A qualified technician should diagnose safety, performance, and repairability. Actual repair and replacement prices, efficiency gains, warranties, and code requirements may differ.', severity: 'INFO', suggestions: [] }],
    suggestions: ['How much should I reserve for this item?', 'Show my capital timeline'],
  };
}

// Ask Intelligence FRD Phase 8A — HVAC Decision Thread foundation. Distinct
// from replacementGuidanceResult above: these operate on the Decision
// Platform's durable DecisionThread/RecommendationSnapshot models via the
// registered HVAC engine (services/decisionPlatform/), not the generic
// ReplaceRepairService heuristic.

function operationalWorkAction(message: string): 'ACCEPT' | 'DEFER' | 'SNOOZE' | 'COMPLETE' | null {
  if (/\bcomplete|done|finished\b/i.test(message)) return 'COMPLETE';
  if (/\bsnooze|hide reminders?\b/i.test(message)) return 'SNOOZE';
  if (/\bdefer|postpone|later\b/i.test(message)) return 'DEFER';
  if (/\baccept|take this on|track this\b/i.test(message)) return 'ACCEPT';
  return null;
}

export function operationalWorkCompletionObservedResult(
  message: string,
): 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' | null {
  return extractMaintenanceCompletionInput(message, undefined).outcomeHealth ?? null;
}

async function operationalWorkUpdateResult(propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const items = await listWorkItems({ propertyId });
  const selected = exactEntityMatch(items, message, launchContext);
  const action = operationalWorkAction(message);
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/home-actions`;
  if (!selected || !action) return { status: 'NEEDS_ENTITY', reasonCode: 'OPERATIONAL_WORK_TARGET_REQUIRED', blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'operational-work-targets', title: 'Choose tracked work and an action', description: 'Use the exact title or work-item id and say accept, defer, snooze, or complete.', sections: [{ id: 'work', title: 'Tracked Operational Work', count: items.length, items: items.slice(0, 50).map((item) => ({ id: item.id, title: item.title, description: `${String(item.state).toLowerCase().replace(/_/g, ' ')} · ${String(item.safetyTier).toLowerCase().replace(/_/g, ' ')}`, meta: [], status: String(item.state), href })) }], actions: [{ id: 'open-work', label: 'Manage Home Actions', href, style: 'SECONDARY' }] }], suggestions: [] };
  const execution = selected.executions.find((candidate) => candidate.role === 'PRIMARY');
  if (action === 'COMPLETE' && (selected.state !== 'ACCEPTED' || execution?.executionType !== 'MAINTENANCE_TASK')) return { status: 'BLOCKED', reasonCode: 'OPERATIONAL_WORK_COMPLETION_REQUIRES_DOMAIN_WORKFLOW', blocks: [{ type: 'BOUNDARY', id: 'operational-work-completion-boundary', title: 'Complete this in its linked workflow', severity: 'INFO', body: 'Quick completion is available only for accepted maintenance-backed work. Project, guidance, booking, safety, and regulated work must record evidence and completion in the linked workflow.', suggestions: [] }, { type: 'SUMMARY', id: 'operational-work-manage', title: selected.title, body: `Current state: ${String(selected.state).toLowerCase().replace(/_/g, ' ')}. No change was made.`, tone: 'CAUTION', actions: [{ id: 'open-work', label: 'Manage action', href, style: 'PRIMARY' }] }], suggestions: [] };
  const observedResult = action === 'COMPLETE'
    ? operationalWorkCompletionObservedResult(message)
    : null;
  if (action === 'COMPLETE' && !observedResult) {
    return {
      status: 'NEEDS_CLARIFICATION',
      reasonCode: 'OPERATIONAL_WORK_COMPLETION_RESULT_REQUIRED',
      ...durableFreeTextClarification(
        'OPERATIONAL_WORK_UPDATE',
        `After completing ${selected.title}, was it working as expected, still needing attention, or failed again?`,
      ),
      blocks: [{
        type: 'SUMMARY',
        id: 'operational-work-completion-result',
        title: `Record the result for ${selected.title}`,
        body: 'Ask will not infer a successful result from the word “complete.” State what you observed, then review the confirmation before anything changes.',
        tone: 'CAUTION',
        actions: [{ id: 'open-work', label: 'Manage action instead', href, style: 'SECONDARY' }],
      }],
      suggestions: [
        `Complete ${selected.title}; it is working as expected`,
        `Complete ${selected.title}; it still needs attention`,
        `Complete ${selected.title}; it failed again`,
      ],
    };
  }
  const targetState = action === 'ACCEPT' ? 'ACCEPTED' : action === 'DEFER' ? 'DEFERRED' : null;
  if (targetState) {
    try { assertUserWorkItemTransition(selected, targetState); } catch (error) { return { status: 'BLOCKED', reasonCode: 'OPERATIONAL_WORK_TRANSITION_NOT_ALLOWED', blocks: [{ type: 'BOUNDARY', id: 'operational-work-governance', title: 'This change belongs to the linked workflow', severity: 'INFO', body: error instanceof Error ? error.message : 'The requested transition is not available.', suggestions: [] }], suggestions: [] }; }
  }
  const until = new Date(Date.now() + (/\bnext month\b/i.test(message) ? 30 : /\bweek\b/i.test(message) ? 7 : 14) * 86_400_000);
  const contextVersion = createHash('sha256').update(`${selected.id}:${selected.state}:${selected.updatedAt.toISOString()}:${selected.snoozedUntil?.toISOString() ?? ''}`).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const observedResultLabel = observedResult === 'CONFIRMED_HEALTHY'
    ? 'Working as expected'
    : observedResult === 'NEEDS_ATTENTION'
      ? 'Needs attention'
      : observedResult === 'FAILED'
        ? 'Failed again'
        : null;
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'OPERATIONAL_WORK_CONFIRMATION_REQUIRED', contextVersion, parameters: { operationalWorkItemId: selected.id, operationalWorkAction: action, operationalWorkUntil: ['DEFER', 'SNOOZE'].includes(action) ? until.toISOString() : null, operationalWorkObservedResult: observedResult, operationalWorkContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() }, blocks: [{ type: 'SUMMARY', id: 'operational-work-review', title: `Review ${action.toLowerCase()} action`, body: action === 'SNOOZE' ? `Reminders will be suppressed until ${humanDate(until)} without changing the work state or due date.` : action === 'DEFER' ? `The work will move to deferred until ${humanDate(until)}.` : action === 'COMPLETE' ? 'The linked canonical maintenance task and Operational Work outcome will be completed together using the observed result shown below.' : 'The proposed work will become accepted homeowner work.', tone: 'CAUTION', actions: [{ id: 'open-work', label: 'Manage action', href, style: 'SECONDARY' }] }], confirmation: { confirmationId: `operational-work-${selected.id}-1`, version: 1, title: `${action[0]}${action.slice(1).toLowerCase()} ${selected.title}?`, description: 'Ask will recheck the current work state before applying this governed command.', fields: [{ label: 'Work', value: selected.title }, { label: 'Current state', value: String(selected.state).toLowerCase().replace(/_/g, ' ') }, { label: 'Action', value: action.toLowerCase() }, ...(observedResultLabel ? [{ label: 'Observed result', value: observedResultLabel }] : [])], editableFields: [], confirmLabel: `${action[0]}${action.slice(1).toLowerCase()} work`, consentText: action === 'COMPLETE' ? 'I authorize this update to the shared Operational Work record and confirm the observed result shown above is accurate.' : 'I authorize this update to the shared Operational Work record.', expiresAt: expiresAt.toISOString() }, suggestions: [] };
}

const HOME_CHANGE_SUMMARY_MAX_ITEMS = 10;

// Named explicitly in the empty-state response so "nothing changed" never
// reads as "the whole home was checked" -- FRD §16.4/§23.2: distinguish no
// material change from unavailable coverage.
const HOME_CHANGE_SUMMARY_COVERED_SOURCES = [
  'home events', 'property record updates', 'documents', 'insurance claims', 'projects',
  'maintenance records', 'Home Actions', 'HVAC repair/replace recommendations', 'saved decision preferences',
];

async function homeChangeSummaryResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const since = new Date(Date.now() - HOME_CHANGE_SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const changes = await listPropertyChanges({ propertyId, userId, since });
  const material = changes.filter((change) => change.materiality !== 'INFORMATIONAL').slice(0, HOME_CHANGE_SUMMARY_MAX_ITEMS);

  if (!material.length) {
    return {
      status: 'ANSWERED', reasonCode: 'HOME_CHANGE_SUMMARY_NONE',
      blocks: [{
        type: 'EMPTY_STATE', id: 'home-change-summary-empty', title: 'No material changes in the last 30 days',
        body: `This covers ${HOME_CHANGE_SUMMARY_COVERED_SOURCES.join(', ')}. It is not a confirmation that nothing at all happened at this property -- only that no material change was recorded in these sources.`,
        actions: [],
      }],
      suggestions: ['What should I do next?', 'Summarize my home record'],
    };
  }

  const homeHref = `/dashboard?propertyId=${encodeURIComponent(propertyId)}`;
  const blocks: AskPresentationBlock[] = await Promise.all(material.map(async (change) => {
    let detailOverride: string | null = null;
    if (change.sourceType === 'DECISION_PREFERENCE_VALUE') {
      const [detail] = await decisionPreferenceService.getPreferenceReferenceDetails([change.sourceRevision]);
      detailOverride = detail?.summary ?? null;
    }
    return {
      type: 'CHANGE_SUMMARY', id: `home-change-${change.id}`,
      title: sourceTypeLabel(change.sourceType),
      source: sourceTypeLabel(change.sourceType),
      changeType: change.changeType,
      summary: buildChangeSummaryText({ sourceType: change.sourceType, changeType: change.changeType, detailOverride }),
      effectiveAt: change.occurredAt ? change.occurredAt.toISOString() : null,
      detectedAt: change.detectedAt.toISOString(),
      materiality: change.materiality,
      materialityReasonCodes: change.materialityReasonCodes,
      confidence: change.confidence,
      linkedAction: change.canonicalAction ? { label: 'View home action', href: homeHref } : null,
    };
  }));

  return {
    status: 'ANSWERED', reasonCode: 'HOME_CHANGE_SUMMARY_FOUND',
    blocks,
    suggestions: ['What should I do next?'],
  };
}

function emergencyResult(): AskOperationResult {
  return {
    status: 'BLOCKED',
    reasonCode: 'IMMEDIATE_SAFETY',
    blocks: [{
      type: 'BOUNDARY', id: 'emergency-boundary', title: 'Treat this as an immediate safety issue', severity: 'EMERGENCY',
      body: 'Leave the affected area if you can do so safely. Call 911 or your local emergency service and the appropriate utility emergency line from a safe location. Do not operate switches, appliances, flames, or vehicles near a suspected gas leak.',
      suggestions: ['Follow instructions from emergency responders or the utility.', 'Do not wait for an app assessment when there may be immediate danger.'],
    }],
    suggestions: [],
  };
}

function outOfScopeResult(): AskOperationResult {
  return {
    status: 'OUT_OF_SCOPE',
    reasonCode: 'NOT_HOMEOWNER_DOMAIN',
    blocks: [{
      type: 'BOUNDARY', id: 'out-of-scope-boundary', title: 'Ask is focused on your home', severity: 'INFO',
      body: 'I can help with home records, maintenance, coverage, costs, tools, decisions, projects, and major home moments. I cannot create unrelated programs or general-purpose coding content here.',
      suggestions: ['What maintenance is pending?', 'Which items are missing coverage?', 'Is there a tool to help with refinancing?'],
    }],
    suggestions: [],
  };
}

function unsafeRestrictedResult(): AskOperationResult {
  return {
    status: 'BLOCKED',
    reasonCode: 'ASK_SAFETY_BLOCKED',
    blocks: [{
      type: 'BOUNDARY', id: 'unsafe-restricted-boundary', title: 'I can’t help bypass safety, legal, or professional controls', severity: 'CAUTION',
      body: 'I can help you understand the safe, documented path, prepare questions and records, or find the appropriate Contract to Cozy tool. I cannot help evade permits or inspections, disable safety equipment, conceal material facts, access another user’s private records, or guarantee a regulated, coverage, structural, or professional determination.',
      suggestions: ['Review the safe permit, inspection, or policy-verification path.', 'Open only the records available for your selected home.', 'Consult the appropriate authority or qualified professional for a controlling determination.'],
    }],
    suggestions: ['What is required before my renovation can start?', 'Which home records should I verify?'],
  };
}

async function groundedGuidanceResult(input: { userId: string; sessionId: string; message: string; propertyId?: string | null; launchContext?: { entityType?: string | null; entityId?: string | null } }, trace?: SkillExecutionTimingTrace): Promise<AskOperationResult> {
  // External review [P1] CTX-001: a launch entity (e.g. "Why is this
  // important?" clicked from an exact maintenance row) was previously
  // dropped entirely -- answerGroundedAsk only ever saw free message text
  // and selected facts from it across the WHOLE property, so two tasks
  // sharing a near-identical title ("Annual maintenance inspection" on two
  // different systems) were indistinguishable to it. Resolving the exact
  // task record here and folding its own identifying fields into both the
  // question text (so selectRelevantAskFacts's token-overlap scoring can
  // actually favor facts about that system/asset) and a dedicated evidence
  // line anchors the answer to the specific record without having to
  // change answerGroundedAsk's Gemini-backed claim-selection pipeline at
  // all. A missing/inaccessible task (deleted, wrong property) falls back
  // to the prior message-only behavior rather than failing the turn.
  let taskAnchor: { title: string; description: string | null; category: string | null; assetType: string | null; roomName: string | null; updatedAt: Date } | null = null;
  let taskAnchorMissing = false;
  if (input.propertyId && input.launchContext?.entityType === 'MAINTENANCE_TASK' && input.launchContext.entityId) {
    const task = await prisma.propertyMaintenanceTask.findFirst({
      where: { id: input.launchContext.entityId, propertyId: input.propertyId },
      select: { title: true, description: true, category: true, assetType: true, updatedAt: true, room: { select: { name: true } } },
    });
    // External review [P1] follow-up: folding only title/category/
    // assetType/room into the question left this task's OWN description
    // (task-specific rationale, homeowner or system-written) out of what
    // the guidance engine sees; and a missing/inaccessible task (deleted,
    // wrong property) used to fall back to an unscoped answer silently --
    // taskAnchorMissing now discloses that instead.
    if (task) taskAnchor = { title: task.title, description: task.description, category: task.category, assetType: task.assetType, roomName: task.room?.name ?? null, updatedAt: task.updatedAt };
    else taskAnchorMissing = true;
  }
  const groundedMessage = taskAnchor
    ? `${input.message} (Regarding the specific maintenance task "${taskAnchor.title}"${taskAnchor.category ? `, category ${taskAnchor.category}` : ''}${taskAnchor.assetType ? `, asset ${taskAnchor.assetType}` : ''}${taskAnchor.roomName ? `, in ${taskAnchor.roomName}` : ''}.${taskAnchor.description ? ` Task notes: ${taskAnchor.description.slice(0, 300)}` : ''})`
    : input.message;
  let answer: Awaited<ReturnType<typeof answerGroundedAsk>>;
  const modelStartedAt = process.hrtime.bigint();
  if (trace) {
    trace.modelUsage = 'OPERATION_GENERATION';
    trace.modelCharacters = groundedMessage.length;
  }
  let modelOutcome = 'failure';
  try {
    askRemoteGenerationCharactersTotal.inc({ direction: 'input' }, groundedMessage.length);
    answer = await answerGroundedAsk({
      userId: input.userId,
      sessionId: input.sessionId,
      message: groundedMessage,
      propertyId: input.propertyId ?? undefined,
      // External review [P1] follow-up (MAINT-008): folding the task's
      // description into groundedMessage only helps selectRelevantAskFacts
      // favor OTHER aggregation facts about the same system -- it never
      // makes the notes themselves usable by the answer. anchorFact routes
      // them through the same deterministic fact-candidate/Gemini-selection
      // pipeline as every other fact, so real task-specific rationale can
      // actually appear in the answer instead of only the unrelated
      // "Maintenance record (exact task)"/"task notes" evidence lines.
      ...(taskAnchor?.description ? {
        anchorFact: {
          key: 'maintenanceTask.notes',
          value: taskAnchor.description,
          source: 'USER_REPORTED',
          observedAt: taskAnchor.updatedAt.toISOString(),
          confidence: 0.75,
        },
      } : {}),
    });
    askRemoteGenerationCharactersTotal.inc({ direction: 'output' }, answer.text.length);
    askRemoteGenerationTotal.inc({ outcome: 'success' });
    modelOutcome = 'success';
  } catch (error) {
    askRemoteGenerationTotal.inc({ outcome: 'failure' });
    throw error;
  } finally {
    askModelDurationSeconds.observe(
      { stage: 'grounded_guidance', outcome: modelOutcome },
      Number(process.hrtime.bigint() - modelStartedAt) / 1_000_000_000,
    );
    if (trace) trace.modelLatencyMs = Number(process.hrtime.bigint() - modelStartedAt) / 1_000_000;
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'grounded-guidance', title: answer.groundingMode === 'PROPERTY' ? 'Guidance for this home' : 'General home guidance',
    // External review [P1]: a declared launch entity that no longer
    // resolves (task deleted, or access to it changed) used to fall back
    // to this same unscoped answer with no indication the specific task
    // it was meant to be about was missing -- disclosed explicitly rather
    // than silently presenting a property-wide answer as task-specific.
    body: taskAnchorMissing ? `The specific maintenance task this question was about is no longer available, so this answer is not scoped to it. ${answer.text}` : answer.text,
    tone: taskAnchorMissing || answer.confidence.label === 'LOW' ? 'CAUTION' : 'DEFAULT', actions: [],
  }];
  // External review [P1] follow-up (MAINT-008): the notes now flow through
  // answerGroundedAsk as a real anchorFact candidate (see the call above),
  // so when the model actually cites them, answer.evidence already carries
  // a "maintenanceTask.notes" entry -- adding a second, always-present line
  // here would just duplicate it. The standalone fallback line below only
  // fires when the pipeline did NOT cite the notes (irrelevant to this
  // specific question, or no property context at all), so the homeowner can
  // still see and verify the actual task instruction that was available but
  // not used, distinguished from Gemini-cited facts (the items below it)
  // and from a missing/unresolved task (taskAnchorMissing's disclosure).
  const notesCitedInAnswer = answer.evidence.some((item) => item.factKey === 'maintenanceTask.notes');
  const evidenceItems = [
    // External review [P1] follow-up: this used to stamp the current
    // request time rather than the task's own recorded observation time.
    ...(taskAnchor ? [{ label: taskAnchor.title, source: 'Maintenance record (exact task)', observedAt: taskAnchor.updatedAt.toISOString() }] : []),
    ...(taskAnchor?.description && !notesCitedInAnswer ? [{
      label: taskAnchor.description.length > 200 ? `${taskAnchor.description.slice(0, 200)}…` : taskAnchor.description,
      source: 'Maintenance record (task notes, not used in this answer)',
      observedAt: taskAnchor.updatedAt.toISOString(),
    }] : []),
    ...answer.evidence.map((item) => ({
      label: item.factKey === 'maintenanceTask.notes' ? 'Maintenance record (task notes)' : item.label,
      source: item.factKey === 'maintenanceTask.notes' ? 'Cited in this answer' : item.source,
      observedAt: item.observedAt,
    })),
  ];
  if (evidenceItems.length) {
    blocks.push({ type: 'EVIDENCE', id: 'grounded-evidence', title: 'Sources used', items: evidenceItems });
  }
  blocks.push({ type: 'BOUNDARY', id: 'grounded-professional-boundary', title: 'Educational guidance—not a controlling determination', body: answer.safetyBoundary, severity: 'INFO', suggestions: [] });
  // The remote fallback's own confidence was previously used only to set a
  // CAUTION tone, so a low-confidence, weakly-grounded answer was still
  // returned as an ordinary confident ANSWERED result. Matches the
  // low-confidence => READY_WITH_LIMITATIONS convention already used by
  // every other operation in this file (capital plan, repair/replace,
  // ownership costs, sell/hold/rent, refinance, etc.) rather than inventing
  // a separate contract just for this path.
  return {
    status: answer.confidence.label === 'LOW' ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: answer.confidence.label === 'LOW' ? 'GROUNDED_GUIDANCE_LOW_CONFIDENCE' : undefined,
    blocks,
    suggestions: [answer.nextAction].filter(Boolean),
  };
}

async function intelligenceEnvelopeQueryResult(userId: string, propertyId: string, message: string, cursor?: string | null, suppliedInput?: RadarEnvelopeQuerySuppliedInput): Promise<AskOperationResult> {
  const scope = resolveAskEnvelopeQueryScope(propertyId, message);
  const page = await queryIntelligenceEnvelope({
    propertyId,
    principal: { kind: 'HOMEOWNER_SESSION', userId },
    ...scope,
    ...(cursor ? { cursor } : {}),
    limit: 20,
  });
  const radarMatchId = suppliedInput?.radarMatchId ?? null;
  const scopedToRadarMatch = radarMatchId
    ? page.items.filter((item) => item.source.sourceRecordId === radarMatchId)
    : [];
  // Fall back to the unfiltered page rather than an artificially empty
  // result when the originating match's own item didn't come back on this
  // page (aged out, deleted) -- a broader answer beats a false "nothing
  // found" for a signal the homeowner was just notified about.
  const items = scopedToRadarMatch.length ? scopedToRadarMatch : page.items;

  if (!items.length && !page.diagnostics.length) {
    return {
      status: 'ANSWERED',
      contextVersion: page.contextVersion,
      blocks: [{
        type: 'EMPTY_STATE',
        id: 'intelligence-envelope-empty',
        title: 'No registered intelligence yet',
        body: 'The registered Envelope producers have not created intelligence for this property yet.',
        actions: [],
      }],
      suggestions: ['Summarize my home record'],
    };
  }

  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const existing = grouped.get(item.domain) ?? [];
    existing.push(item);
    grouped.set(item.domain, existing);
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'intelligence-envelope-summary',
    title: scopedToRadarMatch.length ? 'The event you were notified about' : 'Registered home intelligence',
    body: `${items.length} normalized intelligence item${items.length === 1 ? '' : 's'} from ${new Set(items.map((item) => item.source.sourceModel)).size} registered producer${new Set(items.map((item) => item.source.sourceModel)).size === 1 ? '' : 's'}${scopedToRadarMatch.length ? ' -- scoped to the specific monitored event that triggered this conversation.' : '.'}`,
    tone: page.diagnostics.length ? 'CAUTION' : 'DEFAULT',
    actions: [],
  }];
  if (items.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [],
      id: 'intelligence-envelope-items',
      title: 'Derived intelligence by domain',
      description: 'This is a normalized read of registered Envelope producers, not every Home Action or ordinary domain record.',
      sections: [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([domain, sectionItems]) => ({
        id: `envelope-${domain.toLowerCase()}`,
        title: domain.replace(/_/g, ' ').toLowerCase(),
        count: sectionItems.length,
        items: sectionItems.map((item) => ({
          id: item.envelopeKey,
          title: `${item.type.replace(/_/g, ' ').toLowerCase()} · ${item.source.producer}`,
          description: item.qualifiedClaim?.verdict ?? `${item.source.sourceModel} · ${item.freshness.currentness.toLowerCase()}`,
          meta: [item.severity ?? 'UNSPECIFIED', item.createdAt.slice(0, 10)],
          status: item.freshness.currentness,
          href: null,
        })),
      })),
      actions: [],
    });
    const evidence = items.flatMap((item) => item.evidence).slice(0, 20);
    if (evidence.length) {
      blocks.push({
        type: 'EVIDENCE',
        id: 'intelligence-envelope-evidence',
        title: 'Producer evidence',
        items: evidence.map((item) => ({ label: item.label, source: item.source, observedAt: item.observedAt })),
      });
    }
  }
  if (page.diagnostics.length) {
    blocks.push({
      type: 'BOUNDARY',
      id: 'intelligence-envelope-partial',
      title: 'Some registered intelligence was unavailable',
      body: page.diagnostics.map((diagnostic) => `${diagnostic.producerModel}: ${diagnostic.code}`).join('; '),
      severity: 'INFO',
      suggestions: ['Try the query again'],
    });
  }
  return {
    status: page.diagnostics.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: page.diagnostics.length ? 'INTELLIGENCE_ENVELOPE_PARTIAL' : undefined,
    contextVersion: page.contextVersion,
    blocks,
    suggestions: page.nextCursor ? ['Show more intelligence', 'Ask about a specific intelligence domain'] : [],
    parameters: page.nextCursor ? { nextCursor: page.nextCursor } : undefined,
  };
}

// Ask Cozy Stage 3, Phase 1 (implementation plan §7; FRD §16-17). Registers
// this file's 67 existing per-operation handlers as thin shims against the
// capability registry (capabilityHandlerRegistry.ts), keyed by each
// operation's own declared adapterKey (ASK_OPERATION_DEFINITIONS -- the
// authoritative source for all 67, independent of the separate, optional
// SkillAdapterDefinition table). Handler bodies are unchanged; each shim
// only adapts CapabilityInvocationEnvelope (+ CapabilityInvocationDependencies
// for the two handlers that need composed context or a trace object, neither
// of which belongs in the homeowner-shaped envelope) onto the handler's own,
// pre-existing positional signature -- exactly what used to be one line of a
// switch statement here, now one registration call. Adding capability #68
// means adding one new entry to this block (or, for a handler whose body
// lives in its own file, calling registerCapabilityHandler directly from
// there) -- never a new branch in dispatchOperationAdapterResult below,
// which no longer branches on operationId at all.
registerCapabilityHandler('boundary.emergency', async () => emergencyResult());

registerCapabilityHandler('boundary.unsafe-restricted', async () => unsafeRestrictedResult());

registerCapabilityHandler('boundary.out-of-scope', async () => outOfScopeResult());

// External review [P1]: `envelope.suppliedInput` was declared on
// CapabilityInvocationEnvelope but never read anywhere in the normal
// propose-time dispatch path (confirmed by grep before wiring this) --
// only submitAskCapture's own capture-edit flow passed a supplied-input
// equivalent, and only by calling maintenanceTaskCompleteResult directly,
// bypassing this registration entirely. Reading it here is what lets a
// resolved Maintenance monitor-continuation (askFollowUpContext.ts's
// suppliedInput.taskId) reach this handler at all.
// ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001/ACT-003: a fresh execution
// launched from an inline row action (not a same-session follow-up, which
// already reaches suppliedInput via askFollowUpContext.ts) carries its
// canonical target as launchContext.entityId/entityType, e.g. a
// "Complete"/"Reschedule" button on a maintenance card. Falling back to it
// here is what lets that button resolve the exact task instead of the
// generic message-text fuzzy match.
const launchMaintenanceTaskId = (envelope: CapabilityInvocationEnvelope): string | null =>
  envelope.launchContext?.entityType === 'MAINTENANCE_TASK' ? envelope.launchContext.entityId ?? null : null;

registerCapabilityHandler('maintenance.complete', async (envelope) => maintenanceTaskCompleteResult(envelope.userId, envelope.propertyId!, envelope.message, (envelope.suppliedInput as MaintenanceCompletionWorkflowInput | undefined) ?? (launchMaintenanceTaskId(envelope) ? { taskId: launchMaintenanceTaskId(envelope)! } : undefined), envelope.launchContext?.sourceExecutionId ?? null));

registerCapabilityHandler('maintenance.update', async (envelope) => maintenanceTaskUpdateResult(envelope.userId, envelope.propertyId!, envelope.message, launchMaintenanceTaskId(envelope), envelope.launchContext?.sourceExecutionId ?? null));

registerCapabilityHandler('intelligence-envelope.query', async (envelope) => intelligenceEnvelopeQueryResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.continuationCursor, envelope.suppliedInput as RadarEnvelopeQuerySuppliedInput | undefined));

registerCapabilityHandler('home-operations.update', async (envelope) => operationalWorkUpdateResult(envelope.propertyId!, envelope.message, envelope.launchContext));

registerCapabilityHandler('inventory.replacement', async (envelope) => replacementGuidanceResult(
  envelope.userId,
  envelope.propertyId!,
  envelope.message,
  envelope.launchContext?.entityType === 'INVENTORY_ITEM' ? envelope.launchContext.entityId : null,
  envelope.executionId,
));

registerCapabilityHandler('guidance.journey.create', async (envelope) => guidanceJourneyCreateResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('home-deadline.monitor', async (envelope) => homeDeadlineMonitorResult(envelope.userId, envelope.propertyId!, envelope.message));

// Passthrough category (FRD §16): receives the whole envelope, plus the
// trace object groundedGuidanceResult needs but which the envelope itself
// deliberately never carries (Stage 2 §11 correction).
registerCapabilityHandler('grounded.guidance', async (envelope, deps) => groundedGuidanceResult(envelope, deps.trace));

registerCapabilityHandler('home-change.summary', async (envelope) => homeChangeSummaryResult(envelope.userId, envelope.propertyId!));

// Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §19/§20/§22).
// CAPTURE_FACT_CONFIRM/CAPTURE_EVENT_CONFIRM are never reached through
// ordinary message routing -- a capture candidate is created directly in
// NEEDS_CONFIRMATION status by whatever produced it (Phase 3's extraction;
// a synthetic test harness in this phase), never proposed from a raw
// homeowner message. This handler exists only so Phase 1's capability
// registry has no coverage gap for these two operations; the real
// propose-time and confirm-time work is confirmAskExecution's job (the
// confirm-time registry, below).
export function captureNotDirectlyRoutableResult(kind: 'fact' | 'event' | 'warranty' | 'evidence'): AskOperationResult {
  return {
    status: 'OUT_OF_SCOPE',
    reasonCode: 'ASK_CAPTURE_NOT_DIRECTLY_ROUTABLE',
    blocks: [{
      type: 'BOUNDARY', id: `capture-${kind}-confirm-not-routable`, title: 'This isn\'t something you can ask for directly', severity: 'INFO',
      body: `A ${kind} capture confirmation is created automatically when Ask recognizes something you mentioned in conversation -- it can't be started directly.`,
      suggestions: [],
    }],
    suggestions: [],
  };
}

registerCapabilityHandler('capture.fact.confirm', async () => captureNotDirectlyRoutableResult('fact'));

registerCapabilityHandler('capture.event.confirm', async (envelope) => {
  const declaredAddAction = envelope.launchContext?.operationId === 'CAPTURE_EVENT_CONFIRM'
    && envelope.launchContext.surface !== 'ASK_REFRESH'
    && envelope.message === EVENT_ADD_MESSAGE;
  return declaredAddAction
    ? eventAddResult(envelope.userId, envelope.propertyId!, envelope.launchContext?.sourceExecutionId ?? null)
    : captureNotDirectlyRoutableResult('event');
});

registerCapabilityHandler('capture.warranty.confirm', async (envelope) => {
  const declaredAddAction = envelope.launchContext?.operationId === 'CAPTURE_WARRANTY_CONFIRM'
    && envelope.launchContext.surface !== 'ASK_REFRESH'
    && envelope.message === WARRANTY_ADD_MESSAGE;
  return declaredAddAction
    ? warrantyAddResult(envelope.userId, envelope.propertyId!, envelope.launchContext?.sourceExecutionId ?? null)
    : captureNotDirectlyRoutableResult('warranty');
});

// Phase 3 evidence-upload add slice (design approved 2026-09-22): a homeowner-initiated evidence attach, reached
// only from the declared "Attach evidence" control on a HomeEvent's inline detail. Unlike CAPTURE_EVIDENCE_CONFIRM's
// extraction path below (confirmCaptureEvidence's non-USER_ADD branch, which requires a freshly-confirmed sibling
// EVENT execution because extraction proposes an EVENT and its EVIDENCE together), this attaches to an EXISTING,
// already-confirmed event the homeowner chose from the timeline, so eventId is known up front and re-verified
// directly rather than resolved through a linked execution. The file itself was already uploaded out of band, via
// POST /api/documents/property/:propertyId/evidence-upload, by the time this runs -- documentId is all this needs.
// One-shot, like HOME_EVENT_VISIBILITY: propose builds the confirmation card directly, no separate form step,
// since the "form" (picking and uploading a file) already happened client-side before this call.
export const EVIDENCE_ATTACH_MESSAGE = 'Attach evidence to this home timeline entry.';

// A document is attached as evidence to an EXISTING event only from the declared "Attach evidence" control (see
// evidenceAttachResult above), which requires the file to already be uploaded (documentId) and the exact target
// event pinned (entityId) -- never resolved by fuzzy message matching. Every other call (an ASK_REFRESH re-run,
// which never carries operationId; a bare message naming the operation) keeps the original not-directly-routable
// boundary, same guard shape as the warranty/event add actions above.
registerCapabilityHandler('capture.evidence.confirm', async (envelope) => {
  const declaredAttachAction = envelope.launchContext?.operationId === 'CAPTURE_EVIDENCE_CONFIRM'
    && envelope.launchContext.surface !== 'ASK_REFRESH'
    && envelope.message === EVIDENCE_ATTACH_MESSAGE
    && envelope.launchContext.entityType === 'HOME_EVENT'
    && typeof envelope.launchContext.entityId === 'string'
    && typeof envelope.launchContext.documentId === 'string';
  return declaredAttachAction
    ? evidenceAttachResult(envelope.userId, envelope.propertyId!, envelope.launchContext!.entityId as string, envelope.launchContext!.documentId as string, envelope.launchContext?.sourceExecutionId ?? null)
    : captureNotDirectlyRoutableResult('evidence');
});
