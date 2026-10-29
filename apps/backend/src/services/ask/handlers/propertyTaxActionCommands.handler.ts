// Record a decision on a property tax exemption or correction step, and check for those steps (register "Property Tax"; FRD v1.485). Reached only by the
// declared actions on the appeal-readiness answer, through the PROPERTY_TAX_APPEAL_COMMAND capability, so its contributor floor, mutation impact and
// governance already apply. Every write is propertyTaxHomeownerActionService's own (`decide`, `listAndRefresh`), the calls the routes make, behind a review
// and a confirmation bound to the step's last change. The service serves the home's primary owner only; Ask says that instead of erroring. Cozy records
// the decision and never applies or files with the authority.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { propertyTaxHomeownerActionService } from '../../propertyTax/propertyTaxHomeownerAction.service';
import { propertyTaxRecordService } from '../../propertyTax/propertyTaxRecord.service';
import { propertyTaxRuleService } from '../../propertyTax/propertyTaxRule.service';
import {
  PROPERTY_TAX_ACTION_CAPTURE_KEY, PROPERTY_TAX_ACTION_DECISIONS, PROPERTY_TAX_ACTION_DECISION_LABELS, PROPERTY_TAX_ACTION_ENTITY_TYPE, PROPERTY_TAX_ACTION_IDS,
  PROPERTY_TAX_ACTION_MESSAGES, PROPERTY_TAX_ACTION_STATUS_LABELS, parsePropertyTaxActionDecision, parsePropertyTaxRecordForm, type PropertyTaxActionId,
} from '../support/propertyTaxActionCommand';
import { APPEAL_PROPERTY_ENTITY_TYPE } from '../support/propertyTaxAppealCommand';

const database = prisma as any;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const back = { id: 'property-tax-appeal-back', label: 'Back to my appeal', interactionType: 'START_WORKFLOW' as const, message: 'Show my property tax appeal readiness', operationId: 'PROPERTY_TAX_APPEAL_READINESS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'tax-action-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});

export interface PropertyTaxActionLaunch { actionId: PropertyTaxActionId; entityId: string | null; sourceExecutionId: string | null }

interface ActionRow {
  id: string; type: string; title: string; explanation: string; status: string; officialUrl: string; checklistJson: unknown; decisionJson: unknown; decidedAt: Date | null; updatedAt: Date;
}
const ACTION_SELECT = { id: true, type: true, title: true, explanation: true, status: true, officialUrl: true, checklistJson: true, decisionJson: true, decidedAt: true, updatedAt: true };
const rowVersion = (row: ActionRow) => sha(`tax-action:${row.id}:${row.status}:${row.updatedAt.toISOString()}`);
const isPrimaryOwner = async (userId: string, propertyId: string) =>
  Boolean(await database.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));
const host = (url: string) => { try { return new URL(url).hostname; } catch { return null; } };

async function refreshVersion(propertyId: string): Promise<string> {
  const latest = await database.propertyTaxHomeownerAction.findFirst({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
  return sha(`tax-actions-refresh:${propertyId}:${latest?.updatedAt?.toISOString() ?? 'none'}`);
}

async function recordVersion(propertyId: string): Promise<string> {
  const [assessment, bill] = await Promise.all([
    database.propertyTaxAssessmentRecord.findFirst({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    database.propertyTaxBillRecord.findFirst({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
  ]);
  return sha(`tax-record:${propertyId}:${assessment?.updatedAt?.toISOString() ?? 'none'}:${bill?.updatedAt?.toISOString() ?? 'none'}`);
}

const money = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
function recordFormCapture(contextVersion: string, entered: Record<string, unknown>): AskCaptureRequest {
  const num = (key: string, label: string, max: number) => ({ key, label, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max } });
  return {
    requirementId: 'property-tax-record-inputs', captureKey: PROPERTY_TAX_ACTION_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', sensitivity: 'FINANCIAL',
    title: 'Your property tax figures', question: 'What do your tax papers say?',
    helpText: 'Enter what you know from your assessment notice or tax bill; at least one figure besides the year. They are saved as figures you reported, not verified by Cozy. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'taxYear', label: 'Tax year', required: true, inputSchema: { type: 'NUMBER', min: 1900, max: new Date().getFullYear() + 2 } },
      { key: 'parcelId', label: 'Parcel number', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
      num('totalAssessedValue', 'Assessed value ($)', 1_000_000_000),
      num('taxRatePercent', 'Tax rate (%)', 100),
      num('billAmount', 'Bill amount ($)', 1_000_000_000),
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== undefined && v !== null && v !== '')),
    allowNotSure: false, destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

function formCapture(contextVersion: string, entered: Record<string, unknown>, title: string): AskCaptureRequest {
  return {
    requirementId: 'property-tax-action-inputs', captureKey: PROPERTY_TAX_ACTION_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', sensitivity: 'FINANCIAL',
    title: `Your decision: ${title}`, question: 'Where does this step stand?',
    helpText: 'This records your decision in Cozy. Cozy does not apply for an exemption or file a correction; do that on the official site first. A completed step needs the confirmation reference you were given. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'status', label: 'Decision', required: true, inputSchema: { type: 'SINGLE_SELECT', options: PROPERTY_TAX_ACTION_DECISIONS.map((value) => ({ label: PROPERTY_TAX_ACTION_DECISION_LABELS[value], value })) } },
      { key: 'note', label: 'Your decision and why', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } },
      { key: 'externalReference', label: 'Confirmation reference (required when completed)', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 500 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== undefined && v !== null && v !== '')),
    allowNotSure: false, destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function propertyTaxActionCommandResult(userId: string, propertyId: string, launch: PropertyTaxActionLaunch, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'tax-action-permission', title: 'A contributor or owner can record this', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  if (!await isPrimaryOwner(userId, propertyId)) {
    return { status: 'BLOCKED', reasonCode: 'PROPERTY_TAX_ACTION_PRIMARY_OWNER_ONLY', blocks: [{ type: 'SUMMARY', id: 'tax-action-primary-owner', title: 'Only the home’s primary owner can record these decisions', body: 'Exemption and correction steps are kept for the home’s primary account holder. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const launchParameters = { propertyTaxActionLaunch: { actionId: launch.actionId, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (contextVersion: string, command: Record<string, unknown>, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>, consentText: string, id: string): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: 'PROPERTY_TAX_ACTION_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { propertyTaxActionCommand: command, propertyTaxActionContextVersion: contextVersion, ...launchParameters, ...base },
    blocks: [{ type: 'SUMMARY', id: 'tax-action-review', title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `property-tax-action-${id}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel, consentText, expiresAt: expiresAt.toISOString() },
    suggestions: [],
  });

  if (launch.actionId === PROPERTY_TAX_ACTION_IDS.REFRESH) {
    const contextVersion = await refreshVersion(propertyId);
    return confirmation(contextVersion, { actionId: launch.actionId }, 'Check for exemption and correction steps?',
      'This looks up the reviewed steps for your jurisdiction and lists them on your appeal readiness answer. It changes none of your decisions.', 'Check for steps',
      [{ label: 'What changes', value: 'The list of steps is refreshed' }], 'I authorize refreshing the list of steps.', `refresh-${contextVersion.slice(0, 12)}`);
  }

  if (launch.actionId === PROPERTY_TAX_ACTION_IDS.RECORD) {
    const contextVersion = await recordVersion(propertyId);
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'PROPERTY_TAX_RECORD_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'tax-record-input', title: 'Enter your property tax figures', body: 'Nothing has been saved.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [recordFormCapture(contextVersion, {})], suggestions: [],
      };
    }
    const entered = parsePropertyTaxRecordForm(supplied);
    if (!entered.success) {
      return unavailable(entered.reason === 'NOTHING_ENTERED' ? 'PROPERTY_TAX_RECORD_NOTHING_ENTERED' : 'PROPERTY_TAX_RECORD_INPUT_INVALID', 'Check your figures',
        entered.reason === 'NOTHING_ENTERED' ? 'Enter at least one figure besides the year: parcel number, assessed value, tax rate or bill amount. Nothing has changed.' : 'The year or a figure is out of range. Nothing has changed.');
    }
    const f = entered.data;
    return {
      ...confirmation(contextVersion, { actionId: launch.actionId, input: f }, `Save your ${f.taxYear} property tax figures?`,
        'This saves the figures as ones you reported. Cozy does not check them against the county, and they replace any earlier figures you typed in for the same year.', 'Save figures',
        [{ label: 'Tax year', value: String(f.taxYear) }, ...(f.parcelId ? [{ label: 'Parcel number', value: f.parcelId }] : []),
          ...(f.totalAssessedValue !== undefined ? [{ label: 'Assessed value', value: money(f.totalAssessedValue) }] : []),
          ...(f.taxRatePercent !== undefined ? [{ label: 'Tax rate', value: `${f.taxRatePercent}%` }] : []),
          ...(f.billAmount !== undefined ? [{ label: 'Bill amount', value: money(f.billAmount) }] : [])],
        'I authorize saving these figures.', `record-${sha(JSON.stringify(f)).slice(0, 12)}`),
      captureRequests: [recordFormCapture(contextVersion, f)],
    };
  }

  const row = launch.entityId
    ? await database.propertyTaxHomeownerAction.findFirst({ where: { id: launch.entityId, propertyId, property: { homeownerProfile: { userId } } }, select: ACTION_SELECT }) as ActionRow | null
    : null;
  if (!row) return unavailable('PROPERTY_TAX_ACTION_NOT_FOUND', 'That step is not available', 'It may have been replaced when the jurisdiction rules were updated. Check for steps again. Nothing has changed.');
  const contextVersion = rowVersion(row);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'PROPERTY_TAX_ACTION_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'tax-action-input', title: row.title, body: `Currently: ${PROPERTY_TAX_ACTION_STATUS_LABELS[row.status] ?? row.status}. Nothing has been saved.`, tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(contextVersion, {}, row.title)], suggestions: [],
    };
  }
  const parsed = parsePropertyTaxActionDecision(supplied);
  if (!parsed.success) {
    return unavailable(parsed.reason === 'REFERENCE_REQUIRED' ? 'PROPERTY_TAX_ACTION_REFERENCE_REQUIRED' : 'PROPERTY_TAX_ACTION_INPUT_INVALID', 'Check your decision',
      parsed.reason === 'REFERENCE_REQUIRED' ? 'A completed step needs the confirmation reference you were given. Nothing has changed.' : 'Add a note of at least three characters and choose a decision. Nothing has changed.');
  }
  const v = parsed.data;
  return {
    ...confirmation(contextVersion, { actionId: launch.actionId, entityId: row.id, input: v }, `Record “${PROPERTY_TAX_ACTION_STATUS_LABELS[v.status]}” for this step?`,
      'This records your decision on the step. Cozy does not apply for an exemption or file a correction with the authority.', 'Record decision',
      [{ label: 'Step', value: row.title }, { label: 'Status', value: `${PROPERTY_TAX_ACTION_STATUS_LABELS[row.status] ?? row.status} → ${PROPERTY_TAX_ACTION_STATUS_LABELS[v.status]}` }, { label: 'Your note', value: v.note },
        ...(v.externalReference ? [{ label: 'Confirmation reference', value: v.externalReference }] : [])],
      'I authorize recording this decision.', `decide-${sha(`${row.id}:${v.status}:${v.note}`).slice(0, 12)}`),
    captureRequests: [formCapture(contextVersion, v, row.title)],
  };
}

export async function confirmPropertyTaxActionCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  if (ctx.access.role === HouseholdRole.VIEWER) throw stale('A contributor or owner is required to record this.', 'ASK_PERMISSION_REQUIRED');
  const propertyId = execution.propertyId;
  if (!await isPrimaryOwner(userId, propertyId)) throw stale('Only the home’s primary owner can record these decisions.', 'ASK_PERMISSION_REQUIRED');
  const stored = parameters.propertyTaxActionCommand as { actionId?: unknown; entityId?: unknown; input?: unknown } | undefined;
  const actionId = stored?.actionId as PropertyTaxActionId | undefined;
  let title: string; let description: string; let artifactId = propertyId;
  const details: Array<{ label: string; value: string }> = [];
  try {
    if (actionId === PROPERTY_TAX_ACTION_IDS.REFRESH) {
      if (parameters.propertyTaxActionContextVersion !== await refreshVersion(propertyId)) throw stale('The steps changed while the confirmation was open. Review again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const out = await propertyTaxHomeownerActionService.listAndRefresh(propertyId, userId);
      if (out.coverage !== 'REVIEWED') {
        title = 'No reviewed steps for this home yet'; description = out.reason ?? 'No reviewed exemption or correction workflow is available for this property.';
      } else {
        title = 'Steps refreshed'; description = `${out.actions.length} step${out.actions.length === 1 ? '' : 's'} listed on your appeal readiness answer.`;
      }
    } else if (actionId === PROPERTY_TAX_ACTION_IDS.RECORD) {
      if (parameters.propertyTaxActionContextVersion !== await recordVersion(propertyId)) throw stale('Your tax record changed while the confirmation was open. Review again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const parsed = parsePropertyTaxRecordForm(stored?.input);
      if (!parsed.success) throw stale('The figures to save are invalid.');
      const f = parsed.data;
      await propertyTaxRecordService.recordHomeownerValues(propertyId, userId, {
        taxYear: f.taxYear, parcelId: f.parcelId, totalAssessedValue: f.totalAssessedValue, billAmount: f.billAmount,
        effectiveTaxRate: f.taxRatePercent === undefined ? undefined : f.taxRatePercent / 100,
      } as never);
      title = 'Figures saved'; description = `Your ${f.taxYear} property tax figures are saved as figures you reported.`;
      details.push({ label: 'Tax year', value: String(f.taxYear) });
    } else if (actionId === PROPERTY_TAX_ACTION_IDS.DECIDE) {
      const rowId = typeof stored?.entityId === 'string' ? stored.entityId : null;
      const row = rowId ? await database.propertyTaxHomeownerAction.findFirst({ where: { id: rowId, propertyId, property: { homeownerProfile: { userId } } }, select: ACTION_SELECT }) as ActionRow | null : null;
      if (!row || !rowId) throw stale('That step is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (parameters.propertyTaxActionContextVersion !== rowVersion(row)) throw stale('This step changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const parsed = parsePropertyTaxActionDecision(stored?.input);
      if (!parsed.success) throw stale('The decision to save is invalid.');
      await propertyTaxHomeownerActionService.decide({ propertyId, actionId: rowId, userId, status: parsed.data.status, note: parsed.data.note, externalReference: parsed.data.externalReference });
      artifactId = rowId; title = 'Decision recorded'; description = 'It is listed with the step. Nothing has been filed or applied.';
      details.push({ label: 'Step', value: row.title }, { label: 'Status', value: PROPERTY_TAX_ACTION_STATUS_LABELS[parsed.data.status] });
    } else {
      throw stale('The change to make is invalid.');
    }
  } catch (error) {
    // The service's own refusals are written for a person; coded errors pass through.
    if (error instanceof Error && !(error as { code?: unknown }).code) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'PROPERTY_TAX_ACTION_UPDATED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `tax-action-${actionId}-${artifactId}`, title, status: 'COMPLETED', description, details, actions: [{ ...back, label: 'See my appeal readiness', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `tax-action-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'PROPERTY_TAX_APPEAL_CASE', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

/** The reviewed steps beside the appeal readiness check, read from what is stored (a read never writes); the primary owner can record a decision on each. */
export async function propertyTaxActionBlocks(userId: string, propertyId: string, canChange: boolean): Promise<Array<Record<string, any>>> {
  // A read beside the answer: if the owner lookup fails, the steps still show, without actions.
  const ownerCanChange = canChange && await isPrimaryOwner(userId, propertyId).catch(() => false);
  const recordBlock: Array<Record<string, any>> = ownerCanChange ? [{
    type: 'SUMMARY', id: 'tax-record-enter', title: 'Your own tax figures', body: 'No bill to upload? Type in the figures you know. They are kept as figures you reported.', tone: 'DEFAULT',
    actions: [{
      id: PROPERTY_TAX_ACTION_IDS.RECORD, label: 'Enter my tax figures', interactionType: 'START_WORKFLOW' as const, message: PROPERTY_TAX_ACTION_MESSAGES[PROPERTY_TAX_ACTION_IDS.RECORD],
      operationId: 'PROPERTY_TAX_APPEAL_COMMAND' as const, actionId: PROPERTY_TAX_ACTION_IDS.RECORD, entityType: APPEAL_PROPERTY_ENTITY_TYPE, entityId: propertyId, style: 'SECONDARY' as const,
    }],
  }] : [];
  let profileId: string | null = null;
  try {
    const rules: any = await propertyTaxRuleService.getForProperty(propertyId, userId);
    if (rules.coverage === 'REVIEWED' && rules.profile) profileId = rules.profile.id;
  } catch { return recordBlock; }
  if (!profileId) return recordBlock;
  const rows: ActionRow[] = await database.propertyTaxHomeownerAction.findMany({ where: { propertyId, ruleProfileId: profileId }, orderBy: [{ status: 'asc' }, { type: 'asc' }], select: ACTION_SELECT });
  const refreshAction = ownerCanChange ? [{
    id: PROPERTY_TAX_ACTION_IDS.REFRESH, label: rows.length ? 'Refresh the steps' : 'Check for steps', interactionType: 'START_WORKFLOW' as const, message: PROPERTY_TAX_ACTION_MESSAGES[PROPERTY_TAX_ACTION_IDS.REFRESH],
    operationId: 'PROPERTY_TAX_APPEAL_COMMAND' as const, actionId: PROPERTY_TAX_ACTION_IDS.REFRESH, entityType: APPEAL_PROPERTY_ENTITY_TYPE, entityId: propertyId, style: 'SECONDARY' as const,
  }] : [];
  return [...recordBlock, {
    type: 'GROUPED_LIST', filters: [], id: 'tax-actions', title: 'Exemption and correction steps',
    description: rows.length
      ? 'Eligibility is never assumed. Do each step on the official site, then record your decision here.'
      : ownerCanChange ? 'No steps are listed yet. Check for the reviewed steps for your jurisdiction.' : 'No steps are listed yet.',
    sections: rows.length ? [{
      id: 'tax-actions-all', title: 'Steps', count: rows.length,
      items: rows.map((row) => {
        const checklist = Array.isArray(row.checklistJson) ? row.checklistJson.map(String) : [];
        const decision = row.decisionJson && typeof row.decisionJson === 'object' ? row.decisionJson as { note?: unknown; externalReference?: unknown } : null;
        const official = host(row.officialUrl);
        return {
          id: row.id, title: row.title, description: row.explanation, status: PROPERTY_TAX_ACTION_STATUS_LABELS[row.status] ?? row.status, href: null,
          meta: [
            ...checklist.map((item, index) => `${index + 1}. ${item}`),
            official ? `Official instructions: ${official}` : null,
            row.decidedAt ? `Decided ${humanDate(row.decidedAt)}${typeof decision?.externalReference === 'string' && decision.externalReference ? ` (reference ${decision.externalReference})` : ''}` : null,
          ].filter(Boolean),
          actions: ownerCanChange ? [{
            id: PROPERTY_TAX_ACTION_IDS.DECIDE, label: 'Record my decision', interactionType: 'MUTATE_RECORD' as const, message: PROPERTY_TAX_ACTION_MESSAGES[PROPERTY_TAX_ACTION_IDS.DECIDE],
            operationId: 'PROPERTY_TAX_APPEAL_COMMAND' as const, actionId: PROPERTY_TAX_ACTION_IDS.DECIDE, entityType: PROPERTY_TAX_ACTION_ENTITY_TYPE, entityId: row.id, style: 'SECONDARY' as const,
          }] : [],
        };
      }),
    }] : [],
    actions: refreshAction,
  }];
}
