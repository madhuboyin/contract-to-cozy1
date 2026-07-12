// apps/frontend/src/components/landing/ValuePropositionComparison.tsx
// Final Integrated Value Section: All differentiators and capabilities in one crisp table.

import { resolveIconByToken } from '@/lib/icons';

export default function ValuePropositionComparison() {
  const comparisonPoints = [
    // --- DIFFERENTIATORS (The UVPs) ---
    {
      iconToken: 'key',
      title: 'Home records',
      cozy: 'One permanent record', competitor: 'Folders · emails · paper'
    },
    {
      iconToken: 'layout-grid',
      title: 'Home history',
      cozy: 'Complete timeline', competitor: 'Memory and guesswork'
    },
    {
      iconToken: 'bell-ring',
      title: 'What comes next',
      cozy: 'Always visible', competitor: 'Forgotten tasks'
    },
    {
      iconToken: 'badge-check',
      title: 'Home knowledge',
      cozy: 'Context preserved', competitor: 'Context disappears'
    },

    // --- CORE CAPABILITIES (The Necessities - Added from Features.tsx) ---
    {
      iconToken: 'dollar-sign',
      title: 'Money & savings',
      cozy: 'Opportunities found', competitor: 'Savings missed'
    },
    {
      iconToken: 'zap',
      title: 'Prepared ownership',
      cozy: 'Answers ready', competitor: 'Start over every time'
    },
    {
      iconToken: 'shield-check',
      title: 'Future decisions',
      cozy: 'Full context', competitor: 'Incomplete information'
    },
    {
      iconToken: 'shield-check',
      title: 'What your home becomes',
      cozy: 'More valuable each year', competitor: 'Value lost over time'
    },
  ];

  return (
    <section className="py-10 md:py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Contract to Cozy vs. today
          </h2>
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
      </div>
    </section>
  );
}
