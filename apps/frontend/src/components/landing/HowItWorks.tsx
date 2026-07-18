import { resolveIconByToken } from '@/lib/icons';
import { landingStyles } from './landingStyles';

const STEPS = [
  {
    number: '01',
    title: 'Buy',
    description: "Inspections, closing records, warranties, and purchase decisions begin the home's history.",
    iconToken: 'building-2',
  },
  {
    number: '02',
    title: 'Move in',
    description: 'Add utilities, appliances, service providers, setup tasks, and essential property details.',
    iconToken: 'search',
  },
  {
    number: '03',
    title: 'Own',
    description: 'Track systems, costs, insurance, warranties, savings opportunities, and neighborhood context.',
    iconToken: 'calendar',
  },
  {
    number: '04',
    title: 'Maintain',
    description: 'Stay ahead of recurring care, repairs, service records, and replacement planning.',
    iconToken: 'wrench',
  },
  {
    number: '05',
    title: 'Improve',
    description: 'Plan projects, preserve proof of work, track costs, and understand long-term value.',
    iconToken: 'sparkles',
  },
  {
    number: '06',
    title: 'Sell',
    description: "Prepare disclosures, repairs, improvements, and records without rebuilding the home's story.",
    iconToken: 'key',
  },
];

export default function HowItWorks() {
  return (
    <section id="journey" className={`bg-slate-50 ${landingStyles.section}`}>
      <div className={landingStyles.container}>
        <div className="mb-7 text-center">
          <p className={landingStyles.eyebrow}>Built for the entire journey</p>
          <h2 className={landingStyles.heading}>Your home never starts from scratch again</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => {
            const StepIcon = resolveIconByToken(step.iconToken);
            return (
              <article key={step.title} className={`relative ${landingStyles.featureCard}`}>
                <div className="absolute -left-3 -top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-md">
                  {step.number}
                </div>
                <div className="mt-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <StepIcon className="h-4.5 w-4.5" />
                </div>
                <h3 className="mb-0 mt-3 text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mb-0 mt-1 text-xs leading-5 text-slate-600">{step.description}</p>
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
