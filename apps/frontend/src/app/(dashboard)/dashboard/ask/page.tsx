import { AskWorkspace } from '@/components/ask/AskWorkspace';
import { resolveDashboardBackHref } from '@/lib/navigation/backNavigation';
import { askOriginBackLabel } from '@/lib/navigation/askNavigation';

type AskSearchParams = {
  sessionId?: string | string[];
  executionId?: string | string[];
  propertyId?: string | string[];
  question?: string | string[];
  backTo?: string | string[];
  from?: string | string[];
  launchSurface?: string | string[];
  launchCapabilityId?: string | string[];
};

const value = (candidate?: string | string[]) => typeof candidate === 'string' ? candidate : '';

export default async function AskPage({ searchParams }: { searchParams: Promise<AskSearchParams> }) {
  const params = await searchParams;
  const source = value(params.from);
  const requestedBackTo = value(params.backTo);
  const initialBackTo = resolveDashboardBackHref(
    requestedBackTo,
    source === 'notification' ? '/dashboard/notifications' : '',
  );
  return (
    <div className="mx-auto max-w-5xl">
      <AskWorkspace
        mode="page"
        initialSessionId={value(params.sessionId)}
        initialExecutionId={value(params.executionId)}
        initialPropertyId={value(params.propertyId)}
        initialQuestion={value(params.question)}
        initialBackTo={initialBackTo}
        initialBackLabel={askOriginBackLabel(initialBackTo, source)}
        launchSurface={value(params.launchSurface)}
        launchCapabilityId={value(params.launchCapabilityId)}
      />
    </div>
  );
}
