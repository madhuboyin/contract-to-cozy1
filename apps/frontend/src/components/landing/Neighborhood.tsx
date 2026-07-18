import Link from 'next/link';
import { Check, MapPin } from 'lucide-react';
import { landingStyles } from './landingStyles';

const BENEFITS = ['Help in context', 'Local knowledge', 'History preserved'];

export default function Neighborhood() {
  return (
    <section className={`bg-white ${landingStyles.section}`}>
      <div className={landingStyles.container}>
        <div className="grid items-center gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
          <div>
            <h2 className={landingStyles.heading}>The people who know your home stay connected to its history</h2>
            <p className={`mt-3 ${landingStyles.body}`}>Save trusted providers, service visits, reports, receipts, photos, recommendations, and project history directly to your home.</p>
            <div className="mt-7 space-y-4">
              {BENEFITS.map((benefit) => (
                <div key={benefit} className="flex items-center gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                  <h3 className="mb-0 text-lg font-semibold text-slate-900">{benefit}</h3>
                </div>
              ))}
            </div>
          </div>

          <div className={`${landingStyles.productCard} space-y-5 p-6`} aria-label="Example provider relationship">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold text-brand-700">EXAMPLE PROVIDER RELATIONSHIP</p>
                <h3 className="mb-2 text-xl font-semibold text-slate-900">Home inspection service</h3>
              </div>
              <span className="w-fit rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">Home context ready</span>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-brand-900">
              <MapPin className="h-5 w-5 shrink-0" />
              <span className="text-sm font-semibold">Serves your neighborhood · 2 prior visits to your home</span>
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-600">Last home visit</dt><dd className="font-semibold text-slate-900">May 18, 2025</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-600">Records preserved</dt><dd className="font-semibold text-brand-700">Report, receipt, photos</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-600">Connected project</dt><dd className="font-semibold text-slate-900">Annual inspection</dd></div>
            </dl>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/signup" className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-brand-300 px-5 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50">View details</Link>
              <Link href="/signup" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700">Save to home</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
