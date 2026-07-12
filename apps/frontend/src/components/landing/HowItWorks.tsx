import { resolveIconByToken } from '@/lib/icons';

const STEPS = [
  {
    number: '01',
    title: 'Buy',
    description: 'Inspection · closing · warranties',
    iconToken: 'building-2',
  },
  {
    number: '02',
    title: 'Move in',
    description: 'Appliances · utilities · setup',
    iconToken: 'search',
  },
  {
    number: '03',
    title: 'Own',
    description: 'Costs · systems · neighborhood',
    iconToken: 'calendar',
  },
  {
    number: '04',
    title: 'Maintain',
    description: 'Service · repair · next care',
    iconToken: 'wrench',
  },
  {
    number: '05',
    title: 'Improve',
    description: 'Projects · proof · value',
    iconToken: 'sparkles',
  },
  {
    number: '06',
    title: 'Sell',
    description: 'Complete history transfers',
    iconToken: 'key',
  },
];

export default function HowItWorks() {
  return (
    <section id="journey" className="bg-slate-50 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 text-center">
          <p className="mb-2 text-xs font-semibold tracking-normal text-brand-700">Built for the entire journey</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Your home never starts from scratch again</h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
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
