import { AskWorkspace } from '@/components/ask/AskWorkspace';
import { resolveDashboardBackHref } from '@/lib/navigation/backNavigation';
import { askOriginBackLabel } from '@/lib/navigation/askNavigation';

export type AskSearchParams = {
  sessionId?: string | string[];
  executionId?: string | string[];
  propertyId?: string | string[];
  question?: string | string[];
  backTo?: string | string[];
  from?: string | string[];
  launchSurface?: string | string[];
  launchCapabilityId?: string | string[];
  launchOperationId?: string | string[];
  launchEntityType?: string | string[];
  launchEntityId?: string | string[];
  launchActionId?: string | string[];
  launchDecisionThreadId?: string | string[];
  launchWorkItemId?: string | string[];
  launchJourneyId?: string | string[];
  launchContextVersion?: string | string[];
  /** What to show on arrival: `export` opens the export review block, `history` shows the conversation list. */
  view?: string | string[];
};

const value = (candidate?: string | string[]) => typeof candidate === 'string' ? candidate : '';

export async function AskRoutePage({
  searchParams,
  initialHistoryOpen = false,
}: {
  searchParams: Promise<AskSearchParams>;
  initialHistoryOpen?: boolean;
}) {
  const params = await searchParams;
  const source = value(params.from);
  const requestedBackTo = value(params.backTo);
  const initialBackTo = resolveDashboardBackHref(
    requestedBackTo,
    source === 'notification' ? '/dashboard/notifications' : '',
  );
  const viewKind = value(params.view);
  const initialView = viewKind === 'export' ? { kind: 'export' } as const : undefined;
  const operationId = value(params.launchOperationId);
  const entityType = value(params.launchEntityType);
  const entityId = value(params.launchEntityId);
  const launchRecord = operationId && entityType && entityId ? { operationId, entityType, entityId, actionId: value(params.launchActionId) || undefined, decisionThreadId: value(params.launchDecisionThreadId) || undefined, workItemId: value(params.launchWorkItemId) || undefined, journeyId: value(params.launchJourneyId) || undefined, contextVersion: value(params.launchContextVersion) || undefined } : undefined;
  return (
    <div className="h-full min-h-0">
      <AskWorkspace
        mode="page"
        initialSessionId={value(params.sessionId)}
        initialExecutionId={value(params.executionId)}
        initialPropertyId={value(params.propertyId)}
        initialQuestion={value(params.question)}
        initialBackTo={initialBackTo}
        initialBackLabel={askOriginBackLabel(initialBackTo, source)}
        initialHistoryOpen={initialHistoryOpen || viewKind === 'history'}
        initialView={initialView}
        launchSurface={value(params.launchSurface)}
        launchCapabilityId={value(params.launchCapabilityId)}
        launchRecord={launchRecord}
      />
    </div>
  );
}
