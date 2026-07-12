import { resolveIconByToken } from '@/lib/icons';

const STEPS = [
  {
    number: '01',
    title: 'Buy',
    description: 'Bring inspections, closing records, and important decisions together from day one.',
    iconToken: 'building-2',
  },
  {
    number: '02',
    title: 'Move in',
    description: 'Organize utilities, appliances, warranties, and the details that make the home yours.',
    iconToken: 'search',
  },
  {
    number: '03',
    title: 'Own & improve',
    description: 'Plan maintenance, manage projects, track spending, and preserve every improvement.',
    iconToken: 'calendar',
  },
  {
    number: '04',
    title: 'Sell',
    description: 'Prepare with a complete home history and carry what you learned into what comes next.',
    iconToken: 'sparkles',
  },
];

export default function HowItWorks() {
  return (
    <section id="journey" className="bg-slate-50 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 text-center">
          <p className="mb-2 text-xs font-semibold tracking-normal text-brand-700">Built for the entire journey</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Your home never starts from scratch again</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">From the first signature to the final handoff, Contract to Cozy keeps your home knowledge intact.</p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => {
            const StepIcon = resolveIconByToken(step.iconToken);
            return (
              <article key={step.title} className="relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="absolute -left-3 -top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-md">
                  {step.number}
                </div>
                <div className="mt-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <StepIcon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.description}</p>
                {index < STEPS.length - 1 ? (
                  <span className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 text-lg text-slate-300 lg:block">→</span>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
