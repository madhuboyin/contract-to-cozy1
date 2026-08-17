import type { BuyerClosingHomeOverview } from '../../productFramework/buyerAcquisition.contract';
import type { BuyerPlanContext } from '../skills/context/buyerPlanContext.contract';
import type { AskOperationResult } from './askOperationRegistry';

function buyerTaskHref(propertyId: string, task: BuyerClosingHomeOverview['nextAction']): string {
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}/buyer-plan`;
  if (!task) return base;
  const query = new URLSearchParams({ taskId: task.id });
  if (task.checklistSection) query.set('section', task.checklistSection);
  return `${base}?${query.toString()}`;
}

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(value));
}

export function buildBuyerPlanHomeActionsResult(context: BuyerPlanContext): AskOperationResult | null {
  if (
    context.presentationMode === 'HOMEOWNER'
    || context.presentationMode === 'RECENT_OWNER'
    || context.presentationMode === 'NEW_HOME'
  ) return null;

  const planHref = `/dashboard/properties/${encodeURIComponent(context.propertyId)}/buyer-plan`;
  if (context.presentationMode === 'CANDIDATE' || !context.overview) {
    return {
      status: 'READY_WITH_LIMITATIONS',
      reasonCode: 'BUYER_PLAN_NOT_ACTIVE',
      contextVersion: context.contextVersion,
      blocks: [{
        type: 'SUMMARY',
        id: 'buyer-plan-not-active',
        title: 'Start the Buyer Plan to get a closing next step',
        body: 'This purchase property does not have an active Buyer Plan yet. Ask will not substitute homeowner recommendations before the purchase journey is established.',
        tone: 'CAUTION',
        actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: planHref, style: 'PRIMARY' }],
      }],
      suggestions: ['Summarize this home record before closing.'],
    };
  }

  const { overview } = context;
  const nextAction = overview.nextAction;
  const nextHref = buyerTaskHref(context.propertyId, nextAction);
  const dueLabel = nextAction ? dateLabel(nextAction.dueAt) : null;
  const remaining = Math.max(overview.journey.progress.total - overview.journey.progress.completed, 0);
  const distinctBlockers = overview.blockers.filter((task) => task.id !== nextAction?.id);
  const sections = [];

  if (nextAction) {
    sections.push({
      id: 'next',
      title: 'Do this next',
      count: 1,
      items: [{
        id: nextAction.id,
        title: nextAction.title,
        description: nextAction.description,
        meta: [nextAction.priority === 'NOW' ? 'Now' : nextAction.priority, dueLabel ? `Due ${dueLabel}` : null, nextAction.phase.toLowerCase().replace(/_/g, ' ')].filter((value): value is string => Boolean(value)),
        status: nextAction.status,
        href: nextHref,
      }],
    });
  }
  if (distinctBlockers.length) {
    sections.push({
      id: 'blockers',
      title: 'Also watch before closing',
      count: distinctBlockers.length,
      items: distinctBlockers.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        meta: [task.priority === 'NOW' ? 'Now' : task.priority, dateLabel(task.dueAt) ? `Due ${dateLabel(task.dueAt)}` : null].filter((value): value is string => Boolean(value)),
        status: task.status,
        href: buyerTaskHref(context.propertyId, task),
      })),
    });
  }

  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY',
    id: 'buyer-plan-summary',
    title: nextAction ? `Next before closing: ${nextAction.title}` : 'No open next task is currently recorded',
    body: nextAction
      ? `This comes directly from the canonical Buyer Plan. ${remaining} of ${overview.journey.progress.total} applicable pre-close tasks remain, and the plan is ${overview.journey.progress.percent}% complete.`
      : `The canonical Buyer Plan has no executable pre-close task right now. It is ${overview.journey.progress.percent}% complete; review any blocked work with the responsible professional.`,
    tone: distinctBlockers.length ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: nextAction ? 'open-next-buyer-task' : 'open-buyer-plan', label: nextAction ? 'Open exact next task' : 'Open Buyer Plan', href: nextHref, style: 'PRIMARY' }],
  }];
  if (sections.length) {
    blocks.push({
      type: 'GROUPED_LIST',
      id: 'buyer-plan-actions',
      title: 'Buyer Plan guidance',
      description: 'Task order, status, and deadlines come from the selected property’s canonical Buyer Plan.',
      sections,
      actions: [{ id: 'open-buyer-plan', label: 'View full Buyer Plan', href: planHref, style: 'SECONDARY' }],
    });
  }
  blocks.push({
    type: 'BOUNDARY',
    id: 'buyer-plan-professional-boundary',
    title: 'Confirm transaction decisions with your professionals',
    body: 'Ask is summarizing recorded plan state. Confirm legal, lending, title, insurance, inspection, funds, and settlement decisions with the responsible licensed or transaction professional.',
    severity: 'INFO',
    suggestions: [],
  });

  return {
    status: distinctBlockers.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: distinctBlockers.length ? 'BUYER_PLAN_HAS_BLOCKERS' : undefined,
    contextVersion: context.contextVersion,
    blocks,
    suggestions: ['Summarize this home record before closing.', 'What are the ownership costs for this home after purchase?'],
  };
}
