// Recommended maintenance tasks inside Ask (FRD v1.249), replacing the desktop Maintenance Setup page. A READ-ONLY, launch-only list of the reviewed task
// templates (the same MaintenanceService.getMaintenanceTemplates call the page makes, with its per-home applicability): the ones this home can add now,
// the ones already on its list, and the ones that need a home detail first. A contributor or owner gets an "Add to my maintenance" action on each addable
// row, which starts the ordinary add-a-task form pre-filled from the template (MAINTENANCE_TASK_CREATE); nothing is created until that is confirmed.
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { MaintenanceService } from '../../maintenance.service';
import { maintenanceTemplateActionKey } from '../../maintenance/applicabilityPolicy';
import { MAINTENANCE_TEMPLATE_ADD_ACTION, MAINTENANCE_TEMPLATE_ENTITY_TYPE } from '../support/maintenanceTemplateConstants';

const MAX_TEMPLATES = 60;
export const MAINTENANCE_TEMPLATES_BOUNDARY_ID = 'maintenance-templates-boundary';

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: 'Daily', WEEKLY: 'Weekly', BIWEEKLY: 'Every two weeks', MONTHLY: 'Monthly', QUARTERLY: 'Every 3 months',
  SEMI_ANNUALLY: 'Twice a year', ANNUALLY: 'Every year', BIENNIALLY: 'Every two years',
};
const readable = (value: string): string => value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
const frequencyLabel = (value: string | null | undefined): string | null => (value ? FREQUENCY_LABELS[value] ?? readable(value) : null);
// "safety.hasSmokeDetectors" -> "Has smoke detectors": the last segment of a recorded-fact key, in words.
const factLabel = (key: string): string => readable((key.split('.').pop() ?? key).replace(/([a-z])([A-Z])/g, '$1 $2'));

export interface BrowsableTemplate {
  id: string;
  title: string;
  description: string | null;
  defaultFrequency: string | null;
  serviceCategory: string | null;
  applicability?: { status: 'APPLICABLE' | 'UNKNOWN' | 'NOT_APPLICABLE' | string; missingFactKeys?: string[] } | null;
}

/** Pure: the card. `existingTemplateIds` are templates whose task is already on the home's list; `canAdd` is whether the person may change the home. */
export function maintenanceTemplatesFromView(
  templates: BrowsableTemplate[], existingTemplateIds: ReadonlySet<string>, canAdd: boolean,
): AskOperationResult {
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: MAINTENANCE_TEMPLATES_BOUNDARY_ID, title: 'Suggestions, not an inspection',
    body: 'These are standard recurring tasks that fit what is recorded about this home. They are not a diagnosis, and a task is added only after you review and confirm it.',
    severity: 'INFO', suggestions: [],
  };
  const applicable = templates.filter((template) => template.applicability?.status === 'APPLICABLE');
  const unknown = templates.filter((template) => template.applicability?.status === 'UNKNOWN');
  const left = templates.length - applicable.length - unknown.length;
  const ready = applicable.filter((template) => !existingTemplateIds.has(template.id));
  const onList = applicable.filter((template) => existingTemplateIds.has(template.id));
  if (!ready.length && !onList.length && !unknown.length) {
    return {
      status: 'ANSWERED', reasonCode: 'MAINTENANCE_TEMPLATES_EMPTY',
      blocks: [{
        type: 'EMPTY_STATE', id: 'maintenance-templates-empty', title: 'No recommended tasks fit this home right now',
        body: 'None of the standard recurring tasks apply to what is recorded about this home. Adding details about the home can change that.', actions: [],
      }, boundary],
      suggestions: [],
    };
  }
  const row = (template: BrowsableTemplate, kind: 'READY' | 'ON_LIST' | 'NEEDS_DETAIL') => ({
    id: template.id,
    title: template.title,
    description: template.description,
    meta: [frequencyLabel(template.defaultFrequency), template.serviceCategory ? readable(template.serviceCategory) : null].filter((value): value is string => Boolean(value)),
    status: kind === 'ON_LIST' ? 'Already on your list' : kind === 'NEEDS_DETAIL' ? 'Needs a home detail' : null,
    entityType: MAINTENANCE_TEMPLATE_ENTITY_TYPE,
    ...(kind === 'NEEDS_DETAIL' && template.applicability?.missingFactKeys?.length
      ? { description: `${template.description ? `${template.description} ` : ''}To offer this, confirm: ${template.applicability.missingFactKeys.slice(0, 3).map(factLabel).join(', ')}.`.trim() }
      : {}),
    ...(kind === 'READY' && canAdd ? {
      actions: [{
        id: MAINTENANCE_TEMPLATE_ADD_ACTION.id, label: MAINTENANCE_TEMPLATE_ADD_ACTION.label, message: MAINTENANCE_TEMPLATE_ADD_ACTION.message,
        style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'MAINTENANCE_TASK_CREATE',
      }],
    } : {}),
  });
  const sections = [
    { id: 'maintenance-templates-ready', title: 'You can add now', rows: ready.map((template) => row(template, 'READY')) },
    { id: 'maintenance-templates-on-list', title: 'Already on your list', rows: onList.map((template) => row(template, 'ON_LIST')) },
    { id: 'maintenance-templates-needs-detail', title: 'Needs a home detail first', rows: unknown.map((template) => row(template, 'NEEDS_DETAIL')) },
  ].filter((section) => section.rows.length > 0);
  const shown = ready.length + onList.length + unknown.length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'maintenance-templates-summary',
    title: ready.length
      ? `${ready.length} recommended task${ready.length === 1 ? '' : 's'} you can add`
      : 'Every recommended task that fits is already on your list',
    body: [
      canAdd ? 'Choose one to review its details; nothing is added until you confirm.' : 'A contributor or owner of this home can add one. Nothing is added by viewing this list.',
      onList.length ? `${onList.length} ${onList.length === 1 ? 'is' : 'are'} already on your list.` : null,
      unknown.length ? `${unknown.length} need${unknown.length === 1 ? 's' : ''} a detail about the home first.` : null,
      left > 0 ? `${left} that do not apply to this home ${left === 1 ? 'is' : 'are'} left out.` : null,
    ].filter(Boolean).join(' '),
    tone: 'DEFAULT', actions: [],
  }];
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'maintenance-templates-list', title: 'Recommended maintenance tasks', description: `${shown} task${shown === 1 ? '' : 's'}, in the order the catalogue lists them.`,
    sections: sections.map((section) => ({ id: section.id, title: section.title, count: section.rows.length, items: section.rows })),
    actions: [],
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'MAINTENANCE_TEMPLATES_READY', blocks, suggestions: [] };
}

registerCapabilityHandler('maintenance.templates-browse', async (envelope) => {
  const propertyId = envelope.propertyId!;
  const access = await ensurePropertyAccess(envelope.userId, propertyId);
  const templates = (await MaintenanceService.getMaintenanceTemplates(envelope.userId, propertyId)) as unknown as BrowsableTemplate[];
  const shown = templates.slice(0, MAX_TEMPLATES);
  const tasks = shown.length
    ? await prisma.propertyMaintenanceTask.findMany({
      where: { propertyId, actionKey: { in: shown.map((template) => maintenanceTemplateActionKey(template.id)) }, status: { not: 'CANCELLED' } },
      select: { actionKey: true },
    })
    : [];
  const onList = new Set(shown.filter((template) => tasks.some((task) => task.actionKey === maintenanceTemplateActionKey(template.id))).map((template) => template.id));
  const result = maintenanceTemplatesFromView(shown, onList, access.role !== HouseholdRole.VIEWER);
  if (templates.length > MAX_TEMPLATES && result.blocks.every((block) => block.id !== 'maintenance-templates-limit')) {
    const index = result.blocks.findIndex((block) => block.id === 'maintenance-templates-list');
    result.blocks.splice(index < 0 ? result.blocks.length : index, 0, { type: 'LIMITATION', id: 'maintenance-templates-limit', title: `Showing the first ${MAX_TEMPLATES}`, body: 'There are more recommended tasks than are shown here.', severity: 'INFO' });
  }
  return result;
});
