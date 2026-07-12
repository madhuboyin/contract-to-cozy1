import { CheckCircle2, Clock3, FileText, Home, ReceiptText, ShieldCheck, TrendingUp, Users, Wrench } from 'lucide-react';

const MEMORY_NODES = [
  { label: 'Roof', detail: 'Warranty · repairs', icon: ShieldCheck },
  { label: 'Projects', detail: 'Photos · permits', icon: Wrench },
  { label: 'Finances', detail: '$18,420 invested', icon: ReceiptText },
  { label: 'Timeline', detail: '42 home events', icon: Clock3 },
  { label: 'People', detail: '7 trusted relationships', icon: Users },
  { label: 'Value', detail: 'Improvements preserved', icon: TrendingUp },
];

const ANSWERS = [
  ['Roof warranty?', 'Expires May 2042'],
  ['Last HVAC service?', 'March 2026 · due in 3 months'],
  ['Who painted the kitchen?', 'Bright Home Painting · invoice attached'],
  ['Ready to sell?', 'Buyer package 96% complete'],
];

const VALUE_FLOW = ['History', 'Context', 'Guidance', 'Decisions', 'Value'];

export default function HomeKnowledge() {
  return (
    <section className="bg-white px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="mb-2 text-xs font-semibold text-brand-700">One home. Every connection.</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">What your home knows</h2>
        </div>

        <div className="relative mx-auto mt-8 max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-8">
          <div className="pointer-events-none absolute left-1/2 top-12 hidden h-[calc(100%-6rem)] w-px -translate-x-1/2 bg-brand-200 lg:block" />
          <div className="pointer-events-none absolute left-12 right-12 top-1/2 hidden h-px -translate-y-1/2 bg-brand-200 lg:block" />

          <div className="relative grid gap-3 lg:grid-cols-[1fr_1.15fr_1fr] lg:items-center lg:gap-8">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {MEMORY_NODES.slice(0, 3).map((node) => <MemoryNode key={node.label} {...node} />)}
            </div>

            <div className="relative order-first mx-auto flex min-h-52 w-full max-w-xs flex-col items-center justify-center rounded-[28px] border border-brand-200 bg-white p-6 text-center shadow-[0_18px_38px_-28px_rgba(15,23,42,0.65)] lg:order-none">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm"><Home className="h-7 w-7" /></span>
              <p className="mb-0 mt-4 text-xs font-semibold text-brand-700">14 MAPLE STREET</p>
              <h3 className="mb-0 mt-1 text-xl font-semibold text-slate-950">This home remembers.</h3>
              <p className="mb-0 mt-2 text-xs leading-5 text-slate-600">9 years of connected history</p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Memory complete</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {MEMORY_NODES.slice(3).map((node) => <MemoryNode key={node.label} {...node} />)}
            </div>
          </div>

          <div className="mt-6 grid gap-2 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            {ANSWERS.map(([question, answer]) => (
              <div key={question} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-0 text-[11px] font-semibold text-slate-500">{question}</p>
                <p className="mb-0 mt-1 flex gap-1.5 text-xs font-medium text-slate-800"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{answer}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-2 text-xs font-semibold text-slate-700" aria-label="How home history creates value">
          {VALUE_FLOW.map((step, index) => (
            <div key={step} className="contents">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{step}</span>
              {index < VALUE_FLOW.length - 1 ? <span className="text-brand-400" aria-hidden="true">→</span> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MemoryNode({ label, detail, icon: Icon }: { label: string; detail: string; icon: typeof FileText }) {
  return (
    <div className="relative z-10 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-4 w-4" /></span>
      <div><p className="mb-0 text-xs font-semibold text-slate-900">{label}</p><p className="mb-0 mt-0.5 text-[11px] text-slate-500">{detail}</p></div>
    </div>
  );
}
