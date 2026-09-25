// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { readableCode } from '../askFormatting';
import { diyService } from '../../diy.service';

// DIY Project Center capability-card slice (FRD v1.58): the tenth new operation for a capability with none. Reads
// diyService.listProjects with the page's own filter (planning and in progress, the service's default page of 20) --
// the call GET /properties/:id/diy/projects makes for the page's "Active Projects" list. The page shows only that first
// page; Ask says when there are more. Read-only: starting, stepping through, completing and abandoning a project, and
// the AI guide, stay on the page.
export const DIY_ACTIVE_STATUSES = ['PLANNING', 'IN_PROGRESS'];
type DiyProjectListView = Awaited<ReturnType<typeof diyService.listProjects>>;
// The page's own labels (components/features/diy/DiyUtils).
const DIY_STATUS_LABELS: Record<string, string> = { PLANNING: 'Planning', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', ABANDONED: 'Abandoned', HIRED_OUT: 'Hired Out' };
const DIY_CATEGORY_LABELS: Record<string, string> = {
  HVAC: 'HVAC', PLUMBING: 'Plumbing', ELECTRICAL: 'Electrical', PAINTING: 'Painting', GENERAL: 'General', EXTERIOR: 'Exterior',
  FLOORING: 'Flooring', APPLIANCE: 'Appliances', LANDSCAPING: 'Landscaping', OTHER: 'Other',
};
const DIY_VERDICT_LABELS: Record<string, string> = { DIY_RECOMMENDED: 'DIY Recommended', BORDERLINE: 'Borderline', HIRE_RECOMMENDED: 'Hire Recommended', HIRE_REQUIRED: 'Hire Required' };

export function diyProjectsFromView(view: DiyProjectListView, propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/diy`;
  const openAction = { id: 'open-diy', label: 'Open DIY Project Center', href: pageHref, style: 'PRIMARY' as const };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'diy-boundary', title: 'Only for reviewed low-risk projects',
    // The five exclusions the DIY eligibility policy enforces (diy/eligibilityPolicy EXCLUDED_*).
    body: 'DIY guidance covers reviewed, low-risk projects. Electrical panel or wiring work, gas lines, structural work, active leaks or flooding, and hazardous materials such as asbestos, lead paint or mold are for a licensed professional. Stop if anything feels unsafe.',
    severity: 'INFO', suggestions: [],
  };
  const items = view.items;
  if (!items.length) {
    return {
      status: 'ANSWERED', reasonCode: 'DIY_NO_ACTIVE_PROJECTS',
      blocks: [{
        type: 'SUMMARY', id: 'diy-summary', title: 'No DIY projects in progress',
        body: 'You have no DIY projects in planning or in progress. Open the DIY Project Center to start a reviewed low-risk project.',
        tone: 'DEFAULT', actions: [openAction],
      }, boundary],
      suggestions: ['What maintenance is due?'],
    };
  }
  const inProgress = items.filter((item) => item.status === 'IN_PROGRESS').length;
  const planning = items.filter((item) => item.status === 'PLANNING').length;
  const hireFlagged = items.filter((item) => item.decisionVerdict === 'HIRE_RECOMMENDED' || item.decisionVerdict === 'HIRE_REQUIRED').length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'diy-summary',
    title: `${items.length}${view.nextCursor ? '+' : ''} active DIY project${items.length === 1 && !view.nextCursor ? '' : 's'}`,
    body: [
      [inProgress ? `${inProgress} in progress` : null, planning ? `${planning} in planning` : null].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase()) + '.',
      hireFlagged ? `${hireFlagged} ${hireFlagged === 1 ? 'was' : 'were'} assessed as better hired out.` : null,
    ].filter(Boolean).join(' '),
    tone: hireFlagged ? 'CAUTION' : 'DEFAULT',
    actions: [openAction],
  }];
  if (view.nextCursor) {
    blocks.push({
      type: 'LIMITATION', id: 'diy-limit', title: `Showing the ${items.length} most recently started projects`,
      body: 'You have more active DIY projects than this. The rest are in the DIY Project Center.', severity: 'INFO',
    });
  }
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'diy-projects', title: 'Active DIY projects', description: 'Newest first, as on the page. Open a project for its steps.',
    sections: [{
      id: 'diy-active', title: 'Active projects', count: items.length,
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        description: null,
        meta: [
          DIY_CATEGORY_LABELS[item.category] ?? readableCode(item.category),
          `${item.completedStepCount}/${item.requiredStepCount} steps`,
          ...(item.decisionVerdict ? [DIY_VERDICT_LABELS[item.decisionVerdict] ?? readableCode(item.decisionVerdict)] : []),
        ],
        status: DIY_STATUS_LABELS[item.status] ?? readableCode(item.status),
        href: `/dashboard/diy/projects/${encodeURIComponent(item.id)}?propertyId=${encodeURIComponent(propertyId)}`,
      })),
    }],
    actions: [],
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'DIY_PROJECTS_READY', blocks, suggestions: ['What maintenance is due?'] };
}

async function diyProjectsResult(propertyId: string): Promise<AskOperationResult> {
  return diyProjectsFromView(await diyService.listProjects(propertyId, { status: DIY_ACTIVE_STATUSES }), propertyId);
}

registerCapabilityHandler('diy.projects', async (envelope) => diyProjectsResult(envelope.propertyId!));
