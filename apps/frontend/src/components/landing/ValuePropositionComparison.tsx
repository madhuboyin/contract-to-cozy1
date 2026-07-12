// apps/frontend/src/components/landing/ValuePropositionComparison.tsx
// Final Integrated Value Section: All differentiators and capabilities in one crisp table.

import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { landingStyles } from './landingStyles';

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
    <section className={`bg-slate-50 ${landingStyles.section}`}>
      <div className={landingStyles.container}>
        <div className="mb-5 text-center">
          <h2 className={landingStyles.heading}>
            Homeownership feels different when everything is connected
          </h2>
          <p className={`mx-auto mt-3 max-w-xl ${landingStyles.body}`}>Less searching. Less remembering. More confidence.</p>
        </div>

        {/* Mobile: stacked feature cards (< md) */}
        <div className="mt-6 space-y-3 md:hidden">
          {comparisonPoints.map((point, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
        <div className="mt-7 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_42px_-32px_rgba(15,23,42,0.55)] md:block">
          {/* Table Header */}
          <div className="grid grid-cols-3 bg-slate-50 text-xs font-semibold text-slate-600">
            <div className="border-r border-slate-200 px-5 py-3">The experience</div>
            <div className="border-r border-slate-200 px-5 py-3 text-brand-700">With Contract to Cozy</div>
            <div className="px-5 py-3">Without it</div>
          </div>

          {/* Table Rows */}
          {comparisonPoints.map((point, index) => (
            <div
              key={index}
              className={`grid grid-cols-3 items-center bg-white transition-colors hover:bg-slate-50/60 ${index > 0 ? 'border-t border-slate-200' : ''}`}
            >
              <div className="border-r border-slate-200 px-5 py-4">
                <h3 className="mb-0 text-sm font-semibold leading-snug text-slate-900">{point.title}</h3>
              </div>
              <div className="border-r border-slate-200 px-5 py-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="mb-0 text-sm leading-snug text-slate-700">{point.cozy}</p>
                </div>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-start space-x-3">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <p className="mb-0 text-sm leading-snug text-slate-600">{point.without}</p>
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
