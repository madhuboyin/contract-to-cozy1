import { AskWorkspace } from '@/components/ask/AskWorkspace';

export default function AskPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">AI Home Concierge</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Ask about your home</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">One place to understand your records, find the right tool, and decide what to do next.</p>
      </div>
      <AskWorkspace mode="page" />
    </div>
  );
}
