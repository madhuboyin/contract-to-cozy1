// apps/frontend/src/components/landing/ValuePropositionComparison.tsx
// Final Integrated Value Section: All differentiators and capabilities in one crisp table.

import Link from 'next/link';
import { resolveIconByToken } from '@/lib/icons';

export default function ValuePropositionComparison() {
  const comparisonPoints = [
    // --- DIFFERENTIATORS (The UVPs) ---
    {
      iconToken: 'key',
      title: 'Home records',
      cozy: 'Every document, receipt, warranty, and record is organized in one trusted place.',
      competitor: 'Scattered folders, old emails, paper files, and missing attachments.'
    },
    {
      iconToken: 'layout-grid',
      title: 'Home history',
      cozy: 'A complete timeline preserves what changed, when it happened, and who did the work.',
      competitor: 'Trying to remember when something was repaired or searching for an old receipt.'
    },
    {
      iconToken: 'bell-ring',
      title: 'What comes next',
      cozy: 'Maintenance, renewals, and seasonal work stay visible before they become urgent.',
      competitor: 'Sticky notes, forgotten tasks, and catching up after something goes wrong.'
    },
    {
      iconToken: 'badge-check',
      title: 'Home knowledge',
      cozy: 'Information stays connected to the home and remains useful for years.',
      competitor: 'Knowledge disappears across inboxes, spreadsheets, and changing owners.'
    },

    // --- CORE CAPABILITIES (The Necessities - Added from Features.tsx) ---
    {
      iconToken: 'dollar-sign',
      title: 'Money & savings',
      cozy: 'Spending, budgets, rebates, tax credits, and savings opportunities live together.',
      competitor: 'Disconnected spreadsheets and opportunities discovered too late.'
    },
    {
      iconToken: 'zap',
      title: 'Prepared ownership',
      cozy: 'You can answer questions about your home with confidence, whether maintaining or selling.',
      competitor: 'Starting the search from scratch every time a question comes up.'
    },
    {
      iconToken: 'shield-check',
      title: 'Future decisions',
      cozy: 'Every document and improvement adds context for what you decide next.',
      competitor: 'Every new question begins with another search through incomplete information.'
    },
    {
      iconToken: 'shield-check',
      title: 'What your home becomes',
      cozy: 'A living home record that becomes more valuable every year.',
      competitor: 'Disconnected home information that loses value over time.'
    },
  ];

  return (
    <section className="py-10 md:py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Homeownership feels different when everything is connected
          </h2>
          <p className="text-base text-gray-600 max-w-3xl mx-auto">
            Less searching. Less remembering. More confidence in the home you own.
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
                  <p className="text-[11px] font-semibold tracking-wide text-blue-600 uppercase mb-1">With Contract to Cozy</p>
                  <div className="flex items-start gap-2">
                    <CozyIcon className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 leading-snug">{point.cozy}</p>
                  </div>
                </div>
                {/* Old way */}
                <div className="px-4 py-3">
                  <p className="text-[11px] font-semibold tracking-wide text-red-500 uppercase mb-1">Current experience</p>
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
            <div className="p-4 border-r border-gray-200">The experience</div>
            <div className="p-4 border-r border-gray-200 text-center text-blue-600">With Contract to Cozy</div>
            <div className="p-4 text-center text-red-600">Current experience</div>
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
