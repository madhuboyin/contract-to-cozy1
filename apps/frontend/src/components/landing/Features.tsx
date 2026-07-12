import { resolveIconByToken } from '@/lib/icons';
import { landingStyles } from './landingStyles';

const CAPABILITIES = [
  {
    iconToken: 'file-text',
    title: 'Records and history',
    description: 'Documents, closing records, warranties, home timeline',
  },
  {
    iconToken: 'wrench',
    title: 'Care and planning',
    description: 'Maintenance, seasonal planning, repairs, projects',
  },
  {
    iconToken: 'dollar-sign',
    title: 'Money and value',
    description: 'Budgets, insurance, home value, savings and rebates',
  },
  {
    iconToken: 'users',
    title: 'People and place',
    description: 'Trusted providers, neighborhood, local recommendations',
  },
];

export default function Features() {
  return (
    <section id="features" className={`bg-slate-50 ${landingStyles.section}`}>
      <div className={landingStyles.container}>
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className={landingStyles.eyebrow}>Everything your home knows, connected</p>
          <h2 className={landingStyles.heading}>One memory. Every part of your home.</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((capability) => {
            const CapabilityIcon = resolveIconByToken(capability.iconToken);
            return (
              <article key={capability.title} className={`${landingStyles.featureCard} min-h-44`}>
                <CapabilityIcon className="h-5 w-5 text-slate-800" />
                <h3 className="mb-0 mt-4 text-base font-semibold text-slate-900">{capability.title}</h3>
                <p className="mb-0 mt-3 text-sm leading-6 text-slate-600">{capability.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
