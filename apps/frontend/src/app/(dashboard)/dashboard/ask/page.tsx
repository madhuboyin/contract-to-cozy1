import { AskWorkspace } from '@/components/ask/AskWorkspace';

export default async function AskPage({ searchParams }: { searchParams: Promise<{ sessionId?: string | string[]; executionId?: string | string[]; propertyId?: string | string[] }> }) {
  const params = await searchParams;
  const initialSessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const initialExecutionId = typeof params.executionId === 'string' ? params.executionId : '';
  const initialPropertyId = typeof params.propertyId === 'string' ? params.propertyId : '';
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">AI Home Concierge</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Ask about your home</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">One place to understand your records, find the right tool, and decide what to do next.</p>
      </div>
      <AskWorkspace mode="page" initialSessionId={initialSessionId} initialExecutionId={initialExecutionId} initialPropertyId={initialPropertyId} />
    </div>
  );
}
