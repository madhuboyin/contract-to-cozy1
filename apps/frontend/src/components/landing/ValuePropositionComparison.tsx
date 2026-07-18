// apps/frontend/src/components/landing/ValuePropositionComparison.tsx
// Final Integrated Value Section: All differentiators and capabilities in one crisp table.

import { CheckCircle2, XCircle } from 'lucide-react';
import { landingStyles } from './landingStyles';

export default function ValuePropositionComparison() {
  const comparisonPoints = [
    {
      title: 'Finding an important record',
      cozy: 'Documents, receipts, warranties, and reports are tied to the home and easy to find.',
      without: 'Search across email, folders, cloud drives, paper files, and old messages.',
    },
    {
      title: 'Knowing what comes next',
      cozy: 'Maintenance, renewals, warranties, and seasonal needs stay visible before they become urgent.',
      without: 'Depend on memory, sticky notes, calendars, or wait until something fails.',
    },
    {
      title: 'Finding savings',
      cozy: 'Relevant rebates, tax credits, insurance savings, and homeowner programs can surface from property context.',
      without: 'Opportunities are often discovered too late or missed entirely.',
    },
    {
      title: 'Making a repair or project decision',
      cozy: "Use the home's age, prior work, costs, and records to make a more informed decision.",
      without: 'Make decisions with incomplete information and limited context.',
    },
    {
      title: 'Preparing to sell',
      cozy: 'Repairs, improvements, warranties, documents, and home history are already organized.',
      without: 'Reconstruct years of property information shortly before listing.',
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
          <table className="w-full table-fixed text-left">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600"><tr><th scope="col" className="border-r border-slate-200 px-5 py-3">The experience</th><th scope="col" className="border-r border-slate-200 px-5 py-3 text-brand-700">With Contract to Cozy</th><th scope="col" className="px-5 py-3">Without it</th></tr></thead>
            <tbody>
          {comparisonPoints.map((point) => (
            <tr key={point.title} className="border-t border-slate-200 bg-white align-top transition-colors hover:bg-slate-50/60">
              <th scope="row" className="border-r border-slate-200 px-5 py-4 text-sm font-semibold leading-snug text-slate-900">{point.title}</th>
              <td className="border-r border-slate-200 px-5 py-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="mb-0 text-sm leading-snug text-slate-700">{point.cozy}</p>
                </div>
              </td>
              <td className="px-5 py-4">
                <div className="flex items-start space-x-3">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <p className="mb-0 text-sm leading-snug text-slate-600">{point.without}</p>
                </div>
              </td>
            </tr>
          ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
