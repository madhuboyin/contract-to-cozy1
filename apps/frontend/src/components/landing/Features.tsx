import Link from 'next/link';
import { resolveIconByConcept } from '@/lib/icons';
import type { IconConcept } from '@/lib/icons';
import { landingStyles } from './landingStyles';

const FEATURES: Array<{ concept: IconConcept; title: string; description: string }> = [
  {
    concept: 'property',
    title: 'Home Vault',
    description: 'Documents · warranties · receipts',
  },
  {
    concept: 'notifications',
    title: 'Home Timeline',
    description: 'Every event, in order',
  },
  {
    concept: 'expenses',
    title: 'Home Planner',
    description: 'What comes next',
  },
  {
    concept: 'providers',
    title: 'Home Care',
    description: 'Service history',
  },
  {
    concept: 'expenses',
    title: 'Home Finances',
    description: 'Costs · savings · value',
  },
  {
    concept: 'property',
    title: 'Property Health',
    description: 'Condition · risk · priorities',
  },
  {
    concept: 'providers',
    title: 'Projects',
    description: 'Plans · people · proof',
  },
  {
    concept: 'notifications',
    title: 'Insurance',
    description: 'Policies · claims · coverage',
  },
  {
    concept: 'property',
    title: 'Neighborhood',
    description: 'People · place · context',
  },
];

export default function Features() {
  return (
    <section id="features" className={`bg-white ${landingStyles.section}`}>
      <div className={landingStyles.container}>
        <div className="mb-7 text-left">
          <p className={landingStyles.eyebrow}>One connected home</p>
          <h2 className={landingStyles.heading}>One memory. Every part of your home.</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const FeatureIcon = resolveIconByConcept(feature.concept);
            return (
              <article key={feature.title} className={landingStyles.featureCard}>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <FeatureIcon className="h-4.5 w-4.5" />
                </span>
                <h3 className="mb-0 mt-3 text-base font-semibold text-slate-900">{feature.title}</h3>
                <p className="mb-0 mt-1 text-xs leading-5 text-slate-600">{feature.description}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/signup"
            className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Start your home&apos;s history
          </Link>
        </div>
      </div>
    </section>
  );
}
