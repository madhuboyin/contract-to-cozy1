// apps/frontend/src/components/landing/ValuePropositionComparison.tsx
// Final Integrated Value Section: All differentiators and capabilities in one crisp table.

import Link from 'next/link';
import { resolveIconByToken } from '@/lib/icons';

export default function ValuePropositionComparison() {
  const comparisonPoints = [
    // --- DIFFERENTIATORS (The UVPs) ---
    {
      iconToken: 'key',
      title: 'Unified Closure Services',
      cozy: 'One platform for inspection, attorney, and insurance vendor coordination.',
      competitor: 'Separate vendors, manual communication, and disjointed scheduling required.'
    },
    {
      iconToken: 'layout-grid',
      title: 'Single Pane Dashboard',
      cozy: 'All bookings, property documents, and budget history in one beautiful interface.',
      competitor: 'Tracking services using spreadsheets, emails, and phone notes.'
    },
    {
      iconToken: 'bell-ring',
      title: 'Annual Reminders',
      cozy: 'Automatic reminders for maintenance (e.g., duct cleaning, pest control).',
      competitor: 'Homeowner must manually track and remember service cycles.'
    },
    {
      iconToken: 'badge-check',
      title: 'Neighborhood Trust',
      cozy: 'Pros vetted and rated by your actual neighbors with local job history.',
      competitor: 'Generic city-wide reviews and simple rating systems.'
    },

    // --- CORE CAPABILITIES (The Necessities - Added from Features.tsx) ---
    {
      iconToken: 'dollar-sign',
      title: 'Transparent Pricing',
      cozy: 'See upfront costs and guaranteed quotes before booking.',
      competitor: 'Hidden fees, estimated quotes that often change upon arrival.'
    },
    {
      iconToken: 'zap',
      title: 'Book Fast',
      cozy: 'Find, compare, and book qualified pros in minutes.',
      competitor: 'Calling multiple vendors and waiting days for callbacks or quotes.'
    },
    {
      iconToken: 'shield-check',
      title: 'Trusted & Verified',
      cozy: 'All pros are background-checked, licensed, and insured for your peace of mind.',
      competitor: 'User must manually verify license and insurance details themselves.'
    },
  ];

  return (
    <section className="py-10 md:py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            The Cozy Way vs. The Old Way
          </h2>
          <p className="text-base text-gray-600 max-w-3xl mx-auto">
            See how we transform the chaos of home services into a simple, managed experience.
          </p>
        </div>

        {/* Mobile: stacked feature cards (< md) */}
        <div className="space-y-3 md:hidden">
          {comparisonPoints.map((point, index) => {
            const PointIcon = resolveIconByToken(point.iconToken);
            const CozyIcon = resolveIconByToken('badge-check');
            const CompetitorIcon = resolveIconByToken('shield-alert');
            return (
              <div key={index} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                {/* Feature header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <PointIcon className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold text-gray-900">{point.title}</h3>
                </div>
                {/* Cozy way */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-[11px] font-semibold tracking-wide text-blue-600 uppercase mb-1">The Cozy Way</p>
                  <div className="flex items-start gap-2">
                    <CozyIcon className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 leading-snug">{point.cozy}</p>
                  </div>
                </div>
                {/* Old way */}
                <div className="px-4 py-3">
                  <p className="text-[11px] font-semibold tracking-wide text-red-500 uppercase mb-1">The Old Way</p>
                  <div className="flex items-start gap-2">
                    <CompetitorIcon className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 leading-snug">{point.competitor}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: original 3-column table (>= md) */}
        <div className="hidden md:block border border-gray-200 rounded-xl overflow-hidden shadow-xl bg-white">
          {/* Table Header */}
          <div className="grid grid-cols-3 font-bold text-sm sm:text-base bg-gray-100 text-gray-700 tracking-normal">
            <div className="p-4 border-r border-gray-200">Key Feature</div>
            <div className="p-4 border-r border-gray-200 text-center text-blue-600">The Cozy Way</div>
            <div className="p-4 text-center text-red-600">The Old Way</div>
          </div>

          {/* Table Rows */}
          {comparisonPoints.map((point, index) => {
            const PointIcon = resolveIconByToken(point.iconToken);
            const CozyIcon = resolveIconByToken('badge-check');
            const CompetitorIcon = resolveIconByToken('shield-alert');
            return (
              <div
                key={index}
                className={`grid grid-cols-3 items-center ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-t border-gray-200 transition-all hover:bg-blue-50`}
              >
                <div className="p-4 border-r border-gray-200 flex items-center">
                  <span className="mr-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <PointIcon className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold text-gray-900 leading-snug">{point.title}</h3>
                </div>
                <div className="p-4 border-r border-gray-200">
                  <div className="flex items-start space-x-3">
                    <CozyIcon className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 leading-snug">{point.cozy}</p>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start space-x-3">
                    <CompetitorIcon className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 leading-snug">{point.competitor}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Ready to simplify your home management?
          </h3>
          <Link
            href="/signup"
            className="inline-block px-6 py-3 bg-blue-600 text-white text-base font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
          >
            Create Your Free Account →
          </Link>
        </div>
      </div>
    </section>
  );
}
