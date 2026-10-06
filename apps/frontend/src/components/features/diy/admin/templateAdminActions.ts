import type { LifecycleAction } from '@/lib/api/adminContentGovernance';
import type { DiyLiveRevision, DiyTemplateStatus } from '@/types';

export type TemplateAction = { action: LifecycleAction; label: string; tone: string };

const SUBMIT: TemplateAction = { action: 'SUBMIT_FOR_REVIEW', label: 'Submit for review', tone: 'text-green-700 hover:bg-green-50' };
const APPROVE: TemplateAction = { action: 'APPROVE', label: 'Approve', tone: 'text-green-700 hover:bg-green-50' };
const RETURN: TemplateAction = { action: 'RETURN_TO_DRAFT', label: 'Return to draft', tone: 'hover:bg-neutral-50' };
const PUBLISH: TemplateAction = { action: 'PUBLISH', label: 'Publish', tone: 'text-green-700 hover:bg-green-50' };
const UNPUBLISH: TemplateAction = { action: 'UNPUBLISH', label: 'Unpublish', tone: 'hover:bg-neutral-50' };
const ARCHIVE: TemplateAction = { action: 'ARCHIVE', label: 'Archive', tone: 'text-yellow-700 hover:bg-yellow-50' };
const REVIVE: TemplateAction = { action: 'REVIVE_TO_DRAFT', label: 'Revive to draft', tone: 'text-green-700 hover:bg-green-50' };

/**
 * The lifecycle actions to offer for a template. They mirror the server's rules (the server stays the authority and enforces each capability):
 * a reviewer can send an APPROVED template back to draft, and a template with a live head can ALWAYS be unpublished or archived, in any status,
 * so a live template can be pulled at once even while its draft is being edited or reviewed.
 */
export function actionsForTemplate(status: DiyTemplateStatus, liveRevision?: DiyLiveRevision | null): TemplateAction[] {
  const live = Boolean(liveRevision);
  switch (status) {
    case 'DRAFT': return [SUBMIT, ...(live ? [UNPUBLISH, ARCHIVE] : [])];
    case 'REVIEW': return [APPROVE, RETURN, ...(live ? [UNPUBLISH, ARCHIVE] : [])];
    case 'APPROVED': return [PUBLISH, RETURN, ...(live ? [UNPUBLISH] : []), ARCHIVE];
    case 'ACTIVE': return [UNPUBLISH, ARCHIVE];
    case 'ARCHIVED': return [REVIVE];
    default: return [];
  }
}
