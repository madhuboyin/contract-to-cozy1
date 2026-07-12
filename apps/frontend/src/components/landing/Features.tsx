import Link from 'next/link';
import { resolveIconByConcept } from '@/lib/icons';
import type { IconConcept } from '@/lib/icons';

const FEATURES: Array<{ concept: IconConcept; title: string; description: string }> = [
  {
    concept: 'property',
    title: 'Home Vault',
    description: 'Keep documents, warranties, receipts, manuals, and inspections where they belong.',
  },
  {
    concept: 'notifications',
    title: 'Home Timeline',
    description: 'Preserve every repair, upgrade, inspection, and milestone in one lasting history.',
  },
  {
    concept: 'expenses',
    title: 'Home Planner',
    description: 'Stay ahead of maintenance, renewals, seasonal work, and future projects.',
  },
  {
    concept: 'providers',
    title: 'Home Care',
    description: 'Keep maintenance, seasonal work, repairs, and trusted help in rhythm.',
  },
  {
    concept: 'expenses',
    title: 'Home Finances',
    description: 'Understand spending, budgets, home value, and opportunities to save.',
  },
  {
    concept: 'property',
    title: 'Property Health',
    description: 'See the condition, risks, and priorities that shape what your home needs next.',
  },
  {
    concept: 'providers',
    title: 'Projects',
    description: 'Keep plans, estimates, decisions, progress, and completed work together.',
  },
  {
    concept: 'notifications',
    title: 'Insurance',
    description: 'Keep policies, renewals, coverage details, and claims connected to the home.',
  },
  {
    concept: 'property',
    title: 'Neighborhood',
    description: 'Connect local knowledge, community context, and trusted relationships to your home.',
  },
];

export default function Features() {
  return (
    <section id="features" className="bg-white px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center">
          <p className="mb-2 text-xs font-semibold tracking-normal text-brand-700">One connected home</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Every part of homeownership, working together</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">Not separate features. One operating system, built around your home.</p>
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
            Build your home system
          </Link>
        </div>
      </div>
    </section>
  );
}
