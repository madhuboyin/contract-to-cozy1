// apps/frontend/src/components/landing/ValuePropositionComparison.tsx
// Final Integrated Value Section: All differentiators and capabilities in one crisp table.

import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function ValuePropositionComparison() {
  const comparisonPoints = [
    {
      title: 'Home records',
      cozy: 'Every document and warranty lives in one trusted place.',
      without: 'Scattered across folders, emails, and paper files.',
    },
    {
      title: 'Home history',
      cozy: 'A complete timeline shows what changed and when.',
      without: 'Searching old receipts to remember a repair date.',
    },
    {
      title: 'What comes next',
      cozy: 'Maintenance and renewals stay visible before they’re urgent.',
      without: 'Sticky notes and catching up after something breaks.',
    },
    {
      title: 'Money and savings',
      cozy: 'Rebates and tax credits surface automatically.',
      without: 'Opportunities discovered too late, if at all.',
    },
    {
      title: 'Selling your home',
      cozy: 'The full history carries forward to the next owner.',
      without: 'Starting the paperwork search from scratch.',
    },
  ];

  return (
    <section className="py-10 md:py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-4">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Homeownership feels different when everything is connected
          </h2>
          <p className="text-base text-gray-600">Less searching. Less remembering. More confidence in the home you own.</p>
        </div>

        {/* Mobile: stacked feature cards (< md) */}
        <div className="mt-6 space-y-3 md:hidden">
          {comparisonPoints.map((point, index) => (
            <div key={index} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">{point.title}</h3>
              </div>
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[11px] font-semibold tracking-wide text-blue-600 uppercase mb-1">With Contract to Cozy</p>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700 leading-snug">{point.cozy}</p>
                </div>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase mb-1">Without it</p>
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700 leading-snug">{point.without}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: 3-column table (>= md) */}
        <div className="mt-6 hidden md:block border border-gray-200 rounded-xl overflow-hidden shadow-xl bg-white">
          {/* Table Header */}
          <div className="grid grid-cols-3 font-bold text-sm sm:text-base bg-gray-100 text-gray-700 tracking-normal">
            <div className="p-4 border-r border-gray-200">The experience</div>
            <div className="p-4 border-r border-gray-200 text-blue-600">With Contract to Cozy</div>
            <div className="p-4 text-gray-900">Without it</div>
          </div>

          {/* Table Rows */}
          {comparisonPoints.map((point, index) => (
            <div
              key={index}
              className={`grid grid-cols-3 items-center bg-white ${index > 0 ? 'border-t border-gray-200' : ''}`}
            >
              <div className="p-4 border-r border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 leading-snug">{point.title}</h3>
              </div>
              <div className="p-4 border-r border-gray-200">
                <div className="flex items-start space-x-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700 leading-snug">{point.cozy}</p>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start space-x-3">
                  <XCircle className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700 leading-snug">{point.without}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Keep your home knowledge for good
          </h3>
          <Link
            href="/signup"
            className="inline-block px-6 py-3 bg-blue-600 text-white text-base font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
          >
            Create your free home →
          </Link>
        </div>
      </div>
    </section>
  );
}
