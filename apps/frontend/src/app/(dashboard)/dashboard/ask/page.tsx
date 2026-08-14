import { AskWorkspace } from '@/components/ask/AskWorkspace';

export default async function AskPage({ searchParams }: { searchParams: Promise<{ sessionId?: string | string[]; executionId?: string | string[]; propertyId?: string | string[] }> }) {
  const params = await searchParams;
  const initialSessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const initialExecutionId = typeof params.executionId === 'string' ? params.executionId : '';
  const initialPropertyId = typeof params.propertyId === 'string' ? params.propertyId : '';
  return (
    <div className="mx-auto max-w-5xl">
      <AskWorkspace mode="page" initialSessionId={initialSessionId} initialExecutionId={initialExecutionId} initialPropertyId={initialPropertyId} />
    </div>
  );
}
