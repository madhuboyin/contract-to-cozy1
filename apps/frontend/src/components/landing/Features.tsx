import Link from 'next/link';
import { resolveIconByToken } from '@/lib/icons';
import { landingStyles } from './landingStyles';

const CAPABILITIES = [
  {
    iconToken: 'calendar',
    title: 'Stay Ahead',
    description: 'Keep maintenance, renewals, warranties, inspections, recalls, and home risks visible before they become urgent.',
    examples: ['Upcoming maintenance', 'Warranty expirations', 'Seasonal tasks'],
    cta: 'See what needs attention',
    href: '/signup',
  },
  {
    iconToken: 'dollar-sign',
    title: 'Save Money',
    description: 'Find rebates, tax credits, insurance savings, refinancing opportunities, and other benefits connected to your property.',
    examples: ['Tax credits', 'Utility rebates', 'Insurance savings'],
    cta: 'Find savings',
    href: '#calculator',
  },
  {
    iconToken: 'sparkles',
    title: 'Make Better Decisions',
    description: "Use your home's history and context to make more informed choices about repairs, projects, improvements, buying, and selling.",
    examples: ['Repair versus replace', 'Prioritize improvements', 'Prepare to sell'],
    cta: 'Explore home guidance',
    href: '/signup',
  },
];

export default function Features() {
  return (
    <section id="features" className={`bg-slate-50 ${landingStyles.section}`}>
      <div className={landingStyles.container}>
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className={landingStyles.eyebrow}>Built around the way homeowners think</p>
          <h2 className={landingStyles.heading}>What can ContractToCozy help you do?</h2>
          <p className={`mt-3 ${landingStyles.body}`}>Get timely guidance for the things that protect your home, reduce costs, and improve your next decision.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {CAPABILITIES.map((capability) => {
            const CapabilityIcon = resolveIconByToken(capability.iconToken);
            return (
              <article key={capability.title} className={`${landingStyles.featureCard} flex min-h-64 flex-col`}>
                <CapabilityIcon className="h-5 w-5 text-slate-800" aria-hidden="true" />
                <h3 className="mb-0 mt-4 text-base font-semibold text-slate-900">{capability.title}</h3>
                <p className="mb-0 mt-3 text-sm leading-6 text-slate-600">{capability.description}</p>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  {capability.examples.map((example) => <li key={example}>• {example}</li>)}
                </ul>
                <Link href={capability.href} className="mt-auto pt-5 text-sm font-semibold text-brand-700 hover:text-brand-800">{capability.cta} →</Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
