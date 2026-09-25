// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { listProjects as listTrackedProjects } from '../../projectTracker.service';

// Project Tracker capability-card slice (FRD v1.59): the eleventh new operation for a capability with none. Reads
// projectTracker.service listProjects, the call GET /properties/:id/projects makes for the Project Tracker page (the
// route also returns a compliance envelope the page ignores, and emits TOOL_USED analytics, which Ask does not). Shown
// the way the page shows it: active, completed and cancelled sections, each project with its type, contractor (or DIY),
// contract, paid and remaining amounts, due date or warranty expiry, plus the page's lifetime-spend figure. Read-only:
// creating projects and recording milestones, payments, change orders and issues stay on the page.
type TrackedProjectView = Awaited<ReturnType<typeof listTrackedProjects>>[number];
// The page's own labels (projects/page.tsx and ProjectTrackerHelpers).
const PROJECT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', PLANNING: 'Planning', IN_PROGRESS: 'In Progress', PAUSED: 'Paused', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Disputed',
};
const PROJECT_TYPE_LABELS: Record<string, string> = {
  ROOF_REPLACEMENT: 'Roof Replacement', HVAC_REPLACEMENT: 'HVAC Replacement', HVAC_REPAIR: 'HVAC Repair', KITCHEN_REMODEL: 'Kitchen Remodel',
  BATHROOM_REMODEL: 'Bathroom Remodel', ELECTRICAL_PANEL: 'Electrical Panel', PLUMBING_REPIPING: 'Plumbing Repiping', WATER_HEATER: 'Water Heater',
  FOUNDATION_WORK: 'Foundation Work', WINDOW_REPLACEMENT: 'Window Replacement', FLOORING: 'Flooring', PAINTING_INTERIOR: 'Interior Painting',
  PAINTING_EXTERIOR: 'Exterior Painting', DECK_PATIO: 'Deck / Patio', ADDITION: 'Addition', SEWER_LINE: 'Sewer Line',
  SOLAR_INSTALLATION: 'Solar Installation', LANDSCAPING_MAJOR: 'Major Landscaping', GENERAL_REPAIR: 'General Repair', CUSTOM: 'Custom Project',
};
const projectMoney = (cents: number | null | undefined) => (cents == null ? '—' : `$${Math.round(cents / 100).toLocaleString('en-US')}`);

export function trackedProjectsFromView(projects: readonly TrackedProjectView[], propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/projects`;
  const openAction = { id: 'open-project-tracker', label: 'Open Project Tracker', href: pageHref, style: 'PRIMARY' as const };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'project-tracker-boundary', title: 'Your records, not a contract review',
    body: 'Amounts, dates and warranty expirations are what was recorded for each project. Check the signed contract and receipts before relying on them, and record payments and change orders on the project.',
    severity: 'INFO', suggestions: [],
  };
  if (!projects.length) {
    return {
      status: 'ANSWERED', reasonCode: 'PROJECT_TRACKER_NO_PROJECTS',
      blocks: [{
        type: 'SUMMARY', id: 'project-tracker-summary', title: 'No projects yet',
        body: 'Project Tracker follows a contractor project from signed contract through completion and warranty: milestones, payments, change orders and progress photos. Open it to start one.',
        tone: 'DEFAULT', actions: [openAction],
      }, boundary],
      suggestions: ['What maintenance is due?'],
    };
  }
  const active = projects.filter((project) => !['COMPLETED', 'CANCELLED'].includes(project.status));
  const done = projects.filter((project) => project.status === 'COMPLETED');
  const cancelled = projects.filter((project) => project.status === 'CANCELLED');
  const totalSpend = done.reduce((sum, project) => sum + (project.paidToDateCents ?? 0), 0);
  const disputed = active.filter((project) => project.status === 'DISPUTED').length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'project-tracker-summary',
    title: `${active.length} active project${active.length === 1 ? '' : 's'}, ${done.length} completed`,
    body: [
      totalSpend > 0 ? `Lifetime spend on completed projects: ${projectMoney(totalSpend)}.` : null,
      disputed ? `${disputed} ${disputed === 1 ? 'is' : 'are'} marked disputed.` : null,
      cancelled.length ? `${cancelled.length} cancelled.` : null,
    ].filter(Boolean).join(' ') || 'No spend recorded on completed projects yet.',
    tone: disputed ? 'CAUTION' : 'DEFAULT',
    actions: [openAction],
  }];
  const row = (project: TrackedProjectView) => ({
    id: project.id,
    title: project.name,
    description: null,
    meta: [
      `${PROJECT_TYPE_LABELS[project.projectType] ?? readableCode(project.projectType)} · ${project.contractorName ?? (project.fulfillmentMode === 'DIY' ? 'DIY / household' : 'Provider not recorded')}`,
      `Contract ${projectMoney(project.currentContractAmountCents)}`,
      `Paid ${projectMoney(project.paidToDateCents)}`,
      ...(project.status !== 'COMPLETED' ? [`Remaining ${projectMoney((project.currentContractAmountCents ?? 0) - (project.paidToDateCents ?? 0))}`] : []),
      ...(project.expectedEndDate && project.status !== 'COMPLETED' ? [`Due ${humanDate(new Date(project.expectedEndDate))}`] : []),
      ...(project.warrantyExpiresAt && project.status === 'COMPLETED' ? [`Warranty expires ${humanDate(new Date(project.warrantyExpiresAt))}`] : []),
    ],
    status: PROJECT_STATUS_LABELS[project.status] ?? readableCode(project.status),
    href: `${pageHref}/${encodeURIComponent(project.id)}`,
  });
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'project-tracker-projects', title: 'Projects', description: 'Newest first within each group, as on the page. Open a project for milestones, payments and change orders.',
    sections: [
      ...(active.length ? [{ id: 'project-tracker-active', title: 'Active projects', count: active.length, items: active.map(row) }] : []),
      ...(done.length ? [{ id: 'project-tracker-completed', title: 'Completed', count: done.length, items: done.map(row) }] : []),
      ...(cancelled.length ? [{ id: 'project-tracker-cancelled', title: 'Cancelled', count: cancelled.length, items: cancelled.map(row) }] : []),
    ],
    actions: [],
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'PROJECT_TRACKER_PROJECTS_READY', blocks, suggestions: ['What maintenance is due?'] };
}

async function trackedProjectsResult(propertyId: string): Promise<AskOperationResult> {
  return trackedProjectsFromView(await listTrackedProjects(propertyId), propertyId);
}

registerCapabilityHandler('project-tracker.projects', async (envelope) => trackedProjectsResult(envelope.propertyId!));
