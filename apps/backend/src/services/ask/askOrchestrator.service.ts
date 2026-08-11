import { AskExecutionStatus, MaintenanceTaskStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  AskExecutionResponseSchema,
  type AskCaptureRequest,
  type AskExecutionResponse,
  type AskPresentationBlock,
  type CreateAskExecutionRequest,
  type SubmitAskCaptureRequest,
} from '../../productFramework/ask/ask.contract';
import { resolvePropertyAccess } from '../propertyAccess.service';
import { PropertyMaintenanceTaskService } from '../PropertyMaintenanceTask.service';
import { detectCoverageGaps } from '../coverageGap.service';
import { answerGroundedAsk } from '../groundedAsk.service';
import {
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  type CapabilityCatalogItem,
} from '../../productFramework/capabilities';
import { createToolDiscoveryCapabilityAvailabilityAdapter } from '../toolDiscoveryAvailability.service';
import {
  resolveAskOperation,
  type AskOperationResolution,
  type AskOperationResult,
} from './askOperationRegistry';
import { evaluateFeatureContext } from '../../modules/propertyContext/application/evaluateFeatureContext';
import { captureFeatureContext } from '../../modules/propertyContext/application/captureFeatureContext';

const SESSION_TTL_DAYS = 30;
const MAX_RESULT_ITEMS = 50;

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function humanDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(value);
}

function propertyLabel(property: { name: string | null; address: string; city: string; state: string }): string {
  return property.name?.trim() || `${property.address}, ${property.city}, ${property.state}`;
}

function terminalStatus(status: AskOperationResult['status']): boolean {
  return ['ANSWERED', 'COMPLETED', 'NOT_APPLICABLE', 'UNAVAILABLE', 'OUT_OF_SCOPE', 'BLOCKED', 'FAILED_TERMINAL'].includes(status);
}

async function ensurePropertyAccess(userId: string, propertyId: string) {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) {
    const error = new Error('Property not found or access denied.');
    (error as Error & { code?: string }).code = 'ASK_PROPERTY_NOT_FOUND';
    throw error;
  }
  return access;
}

async function propertySummary(propertyId: string | null | undefined) {
  if (!propertyId) return null;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true, address: true, city: true, state: true },
  });
  return property ? { id: property.id, label: propertyLabel(property) } : null;
}

function needsPropertyResult(): AskOperationResult {
  return {
    status: 'NEEDS_PROPERTY',
    reasonCode: 'PROPERTY_REQUIRED',
    blocks: [{
      type: 'SUMMARY',
      id: 'property-required',
      title: 'Select a home to continue',
      body: 'This question needs a specific Living Home Record. Select a home, then Ask will continue with the same question.',
      tone: 'CAUTION',
      actions: [{ id: 'select-property', label: 'Select a home', href: '/dashboard/properties', style: 'PRIMARY' }],
    }],
    suggestions: ['You can also ask a general home-care question without selecting a property.'],
  };
}

async function maintenanceResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const tasks = await PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true });
  const completed = tasks.filter((task) => task.status === MaintenanceTaskStatus.COMPLETED);
  const pending = tasks.filter((task) => task.status !== MaintenanceTaskStatus.COMPLETED && task.status !== MaintenanceTaskStatus.CANCELLED);
  const wantsCompletedOnly = /\bcompleted|finished|done\b/i.test(message) && !/\bpending|remaining|still|overdue\b/i.test(message);
  const wantsPendingOnly = /\bpending|remaining|still|overdue|due soon\b/i.test(message) && !/\bcompleted|finished|done\b/i.test(message);
  const sections = [
    ...(!wantsPendingOnly ? [{ id: 'completed', title: 'Completed', records: completed }] : []),
    ...(!wantsCompletedOnly ? [{ id: 'pending', title: 'Pending', records: pending }] : []),
  ].map((section) => ({
    id: section.id,
    title: section.title,
    count: section.records.length,
    items: section.records.slice(0, MAX_RESULT_ITEMS).map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description ?? null,
      status: task.status,
      meta: [
        task.inventoryItem?.name ?? task.category ?? task.assetType ?? '',
        task.status === MaintenanceTaskStatus.COMPLETED
          ? humanDate(task.lastCompletedDate) ? `Completed ${humanDate(task.lastCompletedDate)}` : 'Completed date not recorded'
          : humanDate(task.nextDueDate) ? `Due ${humanDate(task.nextDueDate)}` : 'No due date',
        `${task.priority.toLowerCase()} priority`,
      ].filter(Boolean),
      href: `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`,
    })),
  }));

  return {
    status: 'ANSWERED',
    blocks: [{
      type: 'SUMMARY',
      id: 'maintenance-summary',
      title: pending.length ? `${pending.length} maintenance task${pending.length === 1 ? '' : 's'} still need attention` : 'No pending maintenance tasks found',
      body: `${completed.length} completed and ${pending.length} pending task${pending.length === 1 ? '' : 's'} are recorded for this home. Cancelled tasks are excluded.`,
      tone: pending.some((task) => task.nextDueDate && task.nextDueDate < new Date()) ? 'CAUTION' : 'DEFAULT',
      actions: [{ id: 'open-maintenance', label: 'Open maintenance', href: `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`, style: 'PRIMARY' }],
    }, {
      type: 'GROUPED_LIST',
      id: 'maintenance-groups',
      title: 'Maintenance record',
      description: tasks.length > MAX_RESULT_ITEMS ? `Showing up to ${MAX_RESULT_ITEMS} items per section.` : null,
      sections,
      actions: [],
    }],
    suggestions: ['Show overdue tasks only', 'What maintenance is coming up next?', 'Create a maintenance task'],
  };
}

async function coverageResult(propertyId: string): Promise<AskOperationResult> {
  const gaps = await detectCoverageGaps(propertyId);
  const grouped = new Map<string, typeof gaps>();
  for (const gap of gaps) grouped.set(gap.gapType, [...(grouped.get(gap.gapType) ?? []), gap]);
  const labels: Record<string, string> = {
    NO_COVERAGE: 'No coverage recorded',
    WARRANTY_ONLY: 'Warranty only',
    INSURANCE_ONLY: 'Insurance only',
    EXPIRED_WARRANTY: 'Expired warranty',
    EXPIRED_INSURANCE: 'Expired insurance',
  };
  const sections = [...grouped.entries()].map(([gapType, records]) => ({
    id: gapType.toLowerCase(),
    title: labels[gapType] ?? gapType,
    count: records.length,
    items: records.slice(0, MAX_RESULT_ITEMS).map((gap) => ({
      id: gap.inventoryItemId,
      title: gap.itemName,
      description: gap.reasons.join(' '),
      status: gap.gapType,
      meta: [
        gap.roomName ?? '',
        gap.itemCategory ? gap.itemCategory.toLowerCase().replace(/_/g, ' ') : '',
        gap.exposureCents > 0 ? `${new Intl.NumberFormat('en-US', { style: 'currency', currency: gap.currency, maximumFractionDigits: 0 }).format(gap.exposureCents / 100)} estimated exposure` : '',
      ].filter(Boolean),
      href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items&smart=gaps`,
    })),
  }));

  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'coverage-summary',
    title: gaps.length ? `${gaps.length} item${gaps.length === 1 ? '' : 's'} need coverage review` : 'No actionable coverage gaps found',
    body: gaps.length
      ? 'These are record-based coverage gaps or expirations. Unknown coverage is not treated as confirmed protection.'
      : 'No currently actionable item-level gap was found in the recorded policies, warranties, and inventory values.',
    tone: gaps.length ? 'CAUTION' : 'POSITIVE',
    actions: [{ id: 'open-coverage', label: 'Review coverage', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items&smart=gaps`, style: 'PRIMARY' }],
  }];
  if (sections.length) blocks.push({ type: 'GROUPED_LIST', id: 'coverage-groups', title: 'Items to review', description: null, sections, actions: [] });
  return {
    status: 'ANSWERED',
    blocks,
    suggestions: ['Which gaps have the largest exposure?', 'Show warranties expiring soon', 'Open Coverage & Premium Review'],
  };
}

function yearsSince(value: Date | null): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
}

async function replacementGuidanceResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const items = await prisma.inventoryItem.findMany({
    where: {
      propertyId,
      OR: [
        { name: { contains: 'refrigerator', mode: 'insensitive' } },
        { name: { contains: 'fridge', mode: 'insensitive' } },
        { assetType: { contains: 'refrigerator', mode: 'insensitive' } },
      ],
    },
    orderBy: [{ isVerified: 'desc' }, { updatedAt: 'desc' }],
    take: 2,
    select: { id: true, name: true, condition: true, installedOn: true, purchasedOn: true, expectedExpiryDate: true },
  });
  if (!items.length) {
    return {
      status: 'READY_WITH_LIMITATIONS',
      reasonCode: 'REFRIGERATOR_NOT_IN_HOME_RECORD',
      blocks: [{
        type: 'SUMMARY', id: 'refrigerator-general-estimate', title: 'Most refrigerators last about 10–15 years',
        body: 'Replacement timing also depends on condition, repair frequency, energy use, and parts availability. I could not find a refrigerator in this home’s inventory, so this is general guidance rather than a home-specific recommendation.',
        tone: 'CAUTION',
        actions: [{ id: 'add-refrigerator', label: 'Add refrigerator to inventory', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'PRIMARY' }],
      }],
      suggestions: ['What signs mean a refrigerator should be replaced?', 'Open Repair vs Replace'],
    };
  }
  if (items.length > 1) {
    return {
      status: 'NEEDS_ENTITY',
      reasonCode: 'MULTIPLE_REFRIGERATORS',
      blocks: [{
        type: 'GROUPED_LIST', id: 'refrigerator-selection', title: 'Which refrigerator do you mean?',
        description: 'Open the matching inventory record, or make its name more specific, then ask again.',
        sections: [{ id: 'matches', title: 'Possible matches', count: items.length, items: items.map((item) => ({
          id: item.id, title: item.name, description: null, status: item.condition, meta: [],
          href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`,
        })) }], actions: [],
      }],
      suggestions: ['Open home inventory'],
    };
  }

  const item = items[0];
  const lifecycleDate = item.installedOn ?? item.purchasedOn;
  const age = yearsSince(lifecycleDate);
  const evaluation = await evaluateFeatureContext(propertyId, userId, {
    featureKey: 'REPAIR_REPLACE', operationKey: 'RUN_ANALYSIS', operationInput: { inventoryItemId: item.id },
  });
  const captureRequests: AskCaptureRequest[] = evaluation.requirements.map((requirement) => ({
    requirementId: requirement.requirementId,
    captureKey: requirement.capture.captureKey,
    classification: requirement.classification,
    state: requirement.state,
    title: requirement.capture.title,
    question: requirement.capture.question,
    helpText: requirement.capture.helpText ?? null,
    inputSchema: requirement.capture.inputSchema,
    allowNotSure: requirement.capture.allowNotSure,
    sensitivity: requirement.capture.sensitivity,
    expectedContextVersion: evaluation.contextVersion,
  }));
  const remainingYears = age === null ? null : Math.max(0, 12 - age);
  const conditionCopy = item.condition === 'POOR'
    ? 'Its recorded condition is poor, so replacement planning should begin now.'
    : item.condition === 'FAIR'
      ? 'Its recorded condition is fair; compare any major repair against replacement cost and efficiency.'
      : 'Continue monitoring cooling performance, noise, seals, and repair frequency.';
  return {
    status: captureRequests.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length ? 'LIFECYCLE_CONTEXT_OPTIONAL' : undefined,
    contextVersion: evaluation.contextVersion,
    parameters: { inventoryItemId: item.id },
    captureRequests,
    blocks: [{
      type: 'SUMMARY', id: 'refrigerator-replacement-guidance', title: age === null
        ? `${item.name}: add its age for a home-specific replacement window`
        : remainingYears === 0
          ? `${item.name} is in the typical replacement window`
          : `${item.name} may have roughly ${remainingYears} year${remainingYears === 1 ? '' : 's'} before the typical replacement window`,
      body: age === null
        ? `Most refrigerators last about 10–15 years. ${conditionCopy} Add an approximate install or purchase date below and I’ll update this answer immediately.`
        : `The home record indicates an age of about ${age} year${age === 1 ? '' : 's'}. Most refrigerators last about 10–15 years, but this is a planning range—not a guaranteed failure date. ${conditionCopy}`,
      tone: item.condition === 'POOR' || (age !== null && age >= 12) ? 'CAUTION' : 'DEFAULT',
      actions: [{ id: 'open-repair-replace', label: 'Open Repair vs Replace', href: `/dashboard/replace-repair?propertyId=${encodeURIComponent(propertyId)}&inventoryItemId=${encodeURIComponent(item.id)}`, style: 'PRIMARY' }],
    }],
    suggestions: ['What replacement warning signs should I watch?', 'How much should I budget for replacement?'],
  };
}

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
}

function capabilityScore(message: string, capability: CapabilityCatalogItem): number {
  const query = tokenize(message);
  const text = tokenize([capability.label, capability.shortDescription, ...capability.intentAliases].join(' '));
  let score = 0;
  for (const token of query) if (text.has(token)) score += token.length > 7 ? 3 : 1;
  if (/refinanc/i.test(message) && capability.id === 'mortgage-refinance-radar') score += 20;
  if (/sell.*rent|rent.*sell/i.test(message) && capability.id === 'sell-hold-rent') score += 20;
  if (/quote/i.test(message) && capability.id === 'quote-comparison') score += 20;
  if (/saving|rebate|benefit/i.test(message) && capability.id === 'savings-benefits') score += 15;
  return score;
}

async function capabilityResult(userId: string, propertyId: string | null | undefined, message: string): Promise<AskOperationResult> {
  const catalog = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability: createToolDiscoveryCapabilityAvailabilityAdapter(canonicalCapabilityRegistry),
    userId,
    propertyId: propertyId ?? undefined,
    includeWorkflowContext: false,
  });
  const ranked = catalog.capabilities
    .map((capability) => ({ capability, score: capabilityScore(message, capability) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.capability.label.localeCompare(right.capability.label))
    .slice(0, 3);
  if (!ranked.length) {
    return {
      status: 'ANSWERED',
      blocks: [{
        type: 'SUMMARY', id: 'no-capability-match', title: 'Tell me what outcome you want',
        body: 'I could not identify one specific tool yet. Describe the decision, task, risk, savings goal, or major home moment you want help with.',
        tone: 'DEFAULT', actions: [{ id: 'explore-tools', label: 'Explore home tools', href: '/dashboard/tools', style: 'SECONDARY' }],
      }],
      suggestions: ['Help me compare contractor quotes', 'I want to plan future replacements', 'Can you monitor refinance rates?'],
    };
  }
  return {
    status: 'ANSWERED',
    contextVersion: catalog.registryVersion,
    blocks: [{
      type: 'CAPABILITY_LIST',
      id: 'capability-matches',
      title: ranked.length === 1 ? 'This tool matches your goal' : 'Tools that match your goal',
      description: 'Availability comes from the current ContractToCozy capability registry.',
      capabilities: ranked.map(({ capability }) => ({
        id: capability.id,
        label: capability.label,
        description: capability.shortDescription,
        expectedOutput: capability.expectedOutput,
        href: capability.href,
        readiness: propertyId || !capability.routeTemplate.includes('[id]') ? 'READY' : 'NEEDS_PROPERTY',
        releaseStage: capability.releaseStage,
      })),
    }],
    suggestions: ['What information does this tool need?', 'What result will I get?', 'Show another option'],
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

async function groundedGuidanceResult(input: { userId: string; sessionId: string; message: string; propertyId?: string | null }): Promise<AskOperationResult> {
  const answer = await answerGroundedAsk({
    userId: input.userId,
    sessionId: input.sessionId,
    message: input.message,
    propertyId: input.propertyId ?? undefined,
  });
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'grounded-guidance', title: answer.groundingMode === 'PROPERTY' ? 'Guidance for this home' : 'General home guidance',
    body: answer.text, tone: answer.confidence.label === 'LOW' ? 'CAUTION' : 'DEFAULT', actions: [],
  }];
  if (answer.evidence.length) {
    blocks.push({ type: 'EVIDENCE', id: 'grounded-evidence', title: 'Sources used', items: answer.evidence.map((item) => ({ label: item.label, source: item.source, observedAt: item.observedAt })) });
  }
  return { status: 'ANSWERED', blocks, suggestions: [answer.nextAction].filter(Boolean) };
}

async function executeOperation(input: { userId: string; sessionId: string; message: string; propertyId?: string | null; operation: AskOperationResolution }): Promise<AskOperationResult> {
  if (input.operation.requiresProperty && !input.propertyId) return needsPropertyResult();
  switch (input.operation.operationId) {
    case 'EMERGENCY_BOUNDARY': return emergencyResult();
    case 'OUT_OF_SCOPE_BOUNDARY': return outOfScopeResult();
    case 'MAINTENANCE_STATUS': return maintenanceResult(input.userId, input.propertyId!, input.message);
    case 'COVERAGE_GAPS': return coverageResult(input.propertyId!);
    case 'REPLACEMENT_GUIDANCE': return replacementGuidanceResult(input.userId, input.propertyId!);
    case 'CAPABILITY_DISCOVERY': return capabilityResult(input.userId, input.propertyId, input.message);
    case 'GROUNDED_GUIDANCE': return groundedGuidanceResult(input);
  }
}

function mapPersistedExecution(execution: {
  id: string; sessionId: string; message: string; status: AskExecutionStatus; propertyId: string | null; operationId: string | null;
  operationVersion: string | null; intentFamily: string | null; contextVersion: string | null; resultJson: Prisma.JsonValue | null;
  createdAt: Date; updatedAt: Date;
}, property: { id: string; label: string } | null): AskExecutionResponse {
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { blocks?: unknown; captureRequests?: unknown; suggestions?: unknown }
    : {};
  return AskExecutionResponseSchema.parse({
    executionId: execution.id,
    sessionId: execution.sessionId,
    question: execution.message,
    status: execution.status,
    property,
    operation: execution.operationId ? { id: execution.operationId, version: execution.operationVersion ?? '1.0', family: execution.intentFamily ?? 'UNKNOWN' } : null,
    contextVersion: execution.contextVersion,
    blocks: stored.blocks ?? [],
    captureRequests: stored.captureRequests ?? [],
    suggestions: stored.suggestions ?? [],
    createdAt: execution.createdAt.toISOString(),
    updatedAt: execution.updatedAt.toISOString(),
  });
}

export async function createAskExecution(userId: string, input: CreateAskExecutionRequest): Promise<AskExecutionResponse> {
  if (input.propertyId) await ensurePropertyAccess(userId, input.propertyId);
  const duplicate = await prisma.askExecution.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } } });
  if (duplicate) return mapPersistedExecution(duplicate, await propertySummary(duplicate.propertyId));

  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const existingSession = await prisma.askSession.findUnique({ where: { id: input.sessionId } });
  if (existingSession && existingSession.userId !== userId) {
    const error = new Error('Ask session not found.');
    (error as Error & { code?: string }).code = 'ASK_SESSION_NOT_FOUND';
    throw error;
  }
  const session = existingSession
    ? await prisma.askSession.update({
      where: { id: existingSession.id },
      data: { propertyId: input.propertyId ?? undefined, lastActiveAt: new Date(), expiresAt },
    })
    : await prisma.askSession.create({
      data: { id: input.sessionId, userId, propertyId: input.propertyId ?? null, title: input.message.slice(0, 120), expiresAt },
    });
  const execution = await prisma.askExecution.create({
    data: {
      sessionId: session.id,
      userId,
      propertyId: input.propertyId ?? null,
      clientRequestId: input.clientRequestId,
      message: input.message,
      launchContextJson: input.launchContext ? asInputJson(input.launchContext) : undefined,
      status: 'ROUTING',
      expiresAt,
    },
  });
  await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'RECEIVED', metadataJson: asInputJson({ surface: input.launchContext?.surface ?? 'unknown' }) } });

  const operation = resolveAskOperation(input.message);
  await prisma.askExecution.update({
    where: { id: execution.id },
    data: { operationId: operation.operationId, operationVersion: operation.version, intentFamily: operation.family, intentConfidence: operation.confidence, status: 'RUNNING' },
  });
  try {
    const result = await executeOperation({ userId, sessionId: session.id, message: input.message, propertyId: input.propertyId, operation });
    const completedAt = terminalStatus(result.status) ? new Date() : undefined;
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : undefined,
        resultJson: asInputJson({ blocks: result.blocks, captureRequests: result.captureRequests ?? [], suggestions: result.suggestions }),
        completedAt,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: result.status, metadataJson: asInputJson({ operationId: operation.operationId, blockTypes: result.blocks.map((block) => block.type) }) } });
    return mapPersistedExecution(saved, await propertySummary(input.propertyId));
  } catch (caught) {
    await prisma.askExecution.update({ where: { id: execution.id }, data: { status: 'FAILED_RETRYABLE', errorCode: caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED' } });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'FAILED_RETRYABLE', metadataJson: asInputJson({ operationId: operation.operationId }) } });
    throw caught;
  }
}

export async function submitAskCapture(userId: string, executionId: string, input: SubmitAskCaptureRequest): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await ensurePropertyAccess(userId, execution.propertyId);
  if (execution.operationId !== 'REPLACEMENT_GUIDANCE') {
    const error = new Error('This execution does not have an active inline capture.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  const inventoryItemId = parameters.inventoryItemId;
  if (typeof inventoryItemId !== 'string') {
    const error = new Error('The inventory item for this capture is no longer available.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { captureRequests?: Array<{ requirementId?: unknown; captureKey?: unknown }> }
    : {};
  const active = stored.captureRequests?.some((request) => request.requirementId === input.requirementId && request.captureKey === input.captureKey);
  if (!active) {
    const error = new Error('This capture requirement is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }

  const capture = await captureFeatureContext(execution.propertyId, userId, {
    ...input,
    featureKey: 'REPAIR_REPLACE',
    operationKey: 'RUN_ANALYSIS',
    operationInput: { inventoryItemId },
  });
  if (!capture || typeof capture !== 'object' || Array.isArray(capture)
    || !('captureId' in capture) || typeof capture.captureId !== 'string'
    || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
    throw new Error('Property context capture did not return a valid receipt.');
  }
  const operation = resolveAskOperation(execution.message);
  const result = await executeOperation({
    userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
  });
  const saved = await prisma.askExecution.update({
    where: { id: execution.id },
    data: {
      status: result.status,
      reasonCode: result.reasonCode,
      contextVersion: result.contextVersion ?? capture.contextVersion,
      parametersJson: result.parameters ? asInputJson(result.parameters) : execution.parametersJson ?? undefined,
      resultJson: asInputJson({ blocks: result.blocks, captureRequests: result.captureRequests ?? [], suggestions: result.suggestions }),
      completedAt: terminalStatus(result.status) ? new Date() : null,
    },
  });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONTEXT_CAPTURED', metadataJson: asInputJson({ captureId: capture.captureId, captureKey: input.captureKey, resumedStatus: result.status }) },
  });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function getAskSession(userId: string, sessionId: string): Promise<AskExecutionResponse[]> {
  const session = await prisma.askSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
  if (!session) return [];
  const executions = await prisma.askExecution.findMany({ where: { sessionId, userId }, orderBy: { createdAt: 'asc' } });
  const propertyIds = [...new Set(executions.map((execution) => execution.propertyId).filter((value): value is string => Boolean(value)))];
  const properties = await prisma.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, name: true, address: true, city: true, state: true } });
  const labels = new Map(properties.map((property) => [property.id, { id: property.id, label: propertyLabel(property) }]));
  return executions.map((execution) => mapPersistedExecution(execution, execution.propertyId ? labels.get(execution.propertyId) ?? null : null));
}
