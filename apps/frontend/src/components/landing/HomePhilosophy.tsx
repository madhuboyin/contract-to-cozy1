import { ArrowDown, CheckCircle2, FileText, Lightbulb, PiggyBank, ShieldCheck } from 'lucide-react';

const TRANSFORMATION = [
  { title: 'Documents', detail: 'Scattered facts', icon: FileText },
  { title: 'Permanent history', detail: 'Everything connected', icon: CheckCircle2 },
  { title: 'Knowledge', detail: 'The home has context', icon: Lightbulb },
  { title: 'Guidance', detail: 'What matters next', icon: ShieldCheck },
  { title: 'Savings', detail: 'Opportunities found', icon: PiggyBank },
  { title: 'Prepared ownership', detail: 'No starting over', icon: CheckCircle2 },
];

export default function HomePhilosophy() {
  return (
    <section className="border-b border-slate-200/70 bg-white px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-2 text-xs font-semibold text-brand-700">Homeownership gets more complicated every year</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Your home should not depend on your memory.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 sm:text-base">Scattered information becomes lasting knowledge—and lasting knowledge changes what happens next.</p>
        </div>

        <div className="mt-9 grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">
          {TRANSFORMATION.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="contents">
                <div className={`rounded-2xl border p-4 text-center ${index === 0 ? 'border-slate-200 bg-slate-50' : index === TRANSFORMATION.length - 1 ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'}`}>
                  <Icon className={`mx-auto h-5 w-5 ${index === 0 ? 'text-slate-500' : 'text-brand-700'}`} />
                  <h3 className="mb-0 mt-2 text-xs font-semibold text-slate-900">{item.title}</h3>
                  <p className="mb-0 mt-1 text-[10px] leading-4 text-slate-500">{item.detail}</p>
                </div>
                {index < TRANSFORMATION.length - 1 ? <ArrowDown className="mx-auto h-4 w-4 text-brand-400 md:-rotate-90" aria-hidden="true" /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
