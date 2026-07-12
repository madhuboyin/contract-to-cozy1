import Link from 'next/link';
import { resolveIconByConcept } from '@/lib/icons';
import type { IconConcept } from '@/lib/icons';

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
    <section id="features" className="bg-white px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center">
          <p className="mb-2 text-xs font-semibold tracking-normal text-brand-700">One connected home</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">One memory. Every part of your home.</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {FEATURES.map((feature) => {
            const FeatureIcon = resolveIconByConcept(feature.concept);
            return (
              <article key={feature.title} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <FeatureIcon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{feature.description}</p>
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
