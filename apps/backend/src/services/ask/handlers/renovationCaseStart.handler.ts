// Start a renovation case inside Ask (register section 3, "Start a renovation case"; FRD v1.303).
//
// Reached by the declared "Start a renovation case" action on the readiness answer's empty state, or a typed "start a renovation case". One form (name,
// type, objective, who is responsible, spaces, budget, target dates), a review card, and a write only after the homeowner confirms, through the same
// createRenovationCase the page's exploration conversion calls: the case, its first draft scope and its owner participant in ONE transaction.
//
// Idempotency: the canonical create is keyed by (property, idempotencyKey). The key is `ask:<confirming execution id>:renovation-case-start`, so a replay,
// a reclaimed worker or a double click returns the case already made; a separate execution is a deliberate second case.
//
// A case is organization, not approval: nothing here applies for a permit, contacts an authority or a contractor, or starts work. Not here: the
// exploration (option generation), governance tier (defaults to LOW_CONSEQUENCE, as the page's own conversion does), scope editing and documents.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, money } from '../askFormatting';
import { createRenovationCase } from '../../renovationCase.service';
import {
  isRenovationCaseStartRequest, parseRenovationCaseStartAnswer, RENOVATION_CASE_START_CAPTURE_KEY, RENOVATION_CASE_START_MESSAGE, RENOVATION_CASE_TYPES,
  RENOVATION_CASE_TYPE_LABELS, RENOVATION_RESPONSIBILITIES, RENOVATION_RESPONSIBILITY_LABELS, renovationCaseCreatePayload, type RenovationCaseStartInput,
} from '../support/renovationCaseStart';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export const renovationCaseStartContextVersion = (propertyId: string) => sha(`renovation-case-start:${propertyId}`);
/** The key the create is bound to: the confirming Ask execution, so any retry of that confirmation returns the case already made. */
export const renovationCaseStartIdempotencyKey = (executionId: string) => `ask:${executionId}:renovation-case-start`;

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'renovation-case-start-permission', title: 'A contributor or owner can start a renovation case', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_RENOVATION_CASE_START_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'renovation-case-start-not-routable', title: 'Ask to start a renovation case', body: 'A renovation case is started by asking to start one. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
  suggestions: [],
});

function captureRequest(contextVersion: string, entered?: RenovationCaseStartInput): AskCaptureRequest {
  const text = (key: string, label: string, max: number, help?: string, required = false) => ({ key, label, ...(help ? { helpText: help } : {}), required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  return {
    requirementId: 'renovation-case-start-inputs', captureKey: RENOVATION_CASE_START_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Start a renovation case', question: 'What do you want to do to the home?',
    helpText: 'A name and a type are enough to start. A case organizes the work and its approvals; it does not apply for a permit or start anything. You will review it before it is saved.',
    inputSchema: { type: 'GROUP', fields: [
      text('name', 'Name', 240, 'For example: Kitchen remodel', true),
      { key: 'caseType', label: 'What kind of work?', required: true, inputSchema: { type: 'SINGLE_SELECT', options: RENOVATION_CASE_TYPES.map((value) => ({ label: RENOVATION_CASE_TYPE_LABELS[value], value })) } },
      { key: 'objective', label: 'What are you trying to achieve?', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } },
      { key: 'responsibilityContext', label: 'Who is responsible for this part of the home?', required: false,
        inputSchema: { type: 'SINGLE_SELECT', options: RENOVATION_RESPONSIBILITIES.map((value) => ({ label: RENOVATION_RESPONSIBILITY_LABELS[value], value })) } },
      text('spaces', 'Rooms or areas affected', 400, 'Separate with commas, for example: kitchen, dining room'),
      { key: 'targetBudget', label: 'Target budget ($)', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 100_000_000 } },
      { key: 'targetStartDate', label: 'Hoped-for start', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
      { key: 'targetEndDate', label: 'Hoped-for finish', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered ? Object.fromEntries(Object.entries({
      name: entered.name, caseType: entered.caseType, objective: entered.objective, responsibilityContext: entered.responsibilityContext,
      spaces: entered.spacesAffected.join(', '), targetBudget: entered.targetBudgetDollars, targetStartDate: entered.targetStartDate, targetEndDate: entered.targetEndDate,
    }).filter(([, value]) => value !== null && value !== undefined && value !== '')) : { responsibilityContext: 'UNKNOWN' },
    allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this case; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function renovationCaseStartResult(
  userId: string, propertyId: string, launch: { sourceExecutionId: string | null }, supplied?: RenovationCaseStartInput,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  const contextVersion = renovationCaseStartContextVersion(propertyId);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'RENOVATION_CASE_START_INPUT_REQUIRED', contextVersion,
      parameters: { renovationCaseStartLaunch: { sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'renovation-case-start-input', title: 'Start a renovation case', body: 'Nothing has been saved yet. Enter what you know, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [captureRequest(contextVersion)], suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const detail = (label: string, value: string | null) => (value ? [{ label, value }] : []);
  const date = (value: string | null) => (value ? humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value : null);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'RENOVATION_CASE_START_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      renovationCaseStart: {
        name: supplied.name, caseType: supplied.caseType, objective: supplied.objective, responsibilityContext: supplied.responsibilityContext,
        spaces: supplied.spacesAffected.join(', '), targetBudget: supplied.targetBudgetDollars, targetStartDate: supplied.targetStartDate, targetEndDate: supplied.targetEndDate,
      },
      renovationCaseStartContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'renovation-case-start-review', title: 'Review this renovation case', body: 'You entered these details. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `renovation-case-start-${sha(`${propertyId}:${supplied.name}:${supplied.caseType}`).slice(0, 12)}-1`, version: 1,
      title: `Start "${supplied.name}"?`,
      description: 'This creates a renovation case with a first draft scope in the shared home record, the same record the renovation planner creates. It does not apply for a permit, contact anyone or start work.',
      fields: [
        { label: 'Name', value: supplied.name }, { label: 'Kind of work', value: RENOVATION_CASE_TYPE_LABELS[supplied.caseType] ?? supplied.caseType },
        { label: 'Responsible', value: RENOVATION_RESPONSIBILITY_LABELS[supplied.responsibilityContext] ?? supplied.responsibilityContext },
        ...detail('Goal', supplied.objective),
        ...detail('Areas', supplied.spacesAffected.join(', ')),
        ...(supplied.targetBudgetDollars !== null ? [{ label: 'Target budget', value: money(supplied.targetBudgetDollars) }] : []),
        ...detail('Hoped-for start', date(supplied.targetStartDate)),
        ...detail('Hoped-for finish', date(supplied.targetEndDate)),
      ],
      editableFields: [], confirmLabel: 'Start case', consentText: 'I authorize adding this renovation case to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [captureRequest(contextVersion, supplied)],
    suggestions: [],
  };
}

registerCapabilityHandler('renovation-case.start', async (envelope) => {
  const launch = envelope.launchContext;
  if (launch?.surface === 'ASK_REFRESH') return notRoutable();
  const declared = launch?.operationId === 'RENOVATION_CASE_START' && envelope.message === RENOVATION_CASE_START_MESSAGE;
  if (declared || isRenovationCaseStartRequest(envelope.message)) {
    return renovationCaseStartResult(envelope.userId, envelope.propertyId!, { sourceExecutionId: launch?.sourceExecutionId ?? null });
  }
  return notRoutable();
});

async function confirmRenovationCaseStart(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  // Re-validate what was stored: the confirmation is the only thing between these parameters and the canonical write.
  const candidate = parseRenovationCaseStartAnswer(parameters.renovationCaseStart);
  if (!candidate.success) throw Object.assign(new Error('The renovation case to start is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const input = candidate.data;
  const propertyId = execution.propertyId;
  const created: any = await createRenovationCase(propertyId, userId, renovationCaseCreatePayload(input, renovationCaseStartIdempotencyKey(execution.id), execution.id));
  const caseId = String(created.id);
  const name = String(created.name ?? input.name);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'RENOVATION_CASE_STARTED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `renovation-case-started-${caseId}`, title: 'Renovation case started', status: 'COMPLETED',
      description: 'The case and its first draft scope are saved. Nothing has been applied for or started.',
      details: [{ label: 'Case', value: name }, { label: 'Kind of work', value: RENOVATION_CASE_TYPE_LABELS[input.caseType] ?? input.caseType }],
      actions: [{
        id: 'renovation-case-readiness', label: 'Check readiness', interactionType: 'START_WORKFLOW' as const, message: `Is ${name} ready to start?`.slice(0, 300),
        operationId: 'RENOVATION_PERMIT_READINESS', style: 'PRIMARY' as const,
      }],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `renovation-case-refresh-failed-${caseId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The case was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'RENOVATION_CASE', artifactId: caseId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('renovation-case.start', confirmRenovationCaseStart);
