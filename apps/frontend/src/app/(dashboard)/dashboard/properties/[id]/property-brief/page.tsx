import Link from 'next/link';
import { FileCheck2, ShieldAlert } from 'lucide-react';

type PropertyBriefPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PropertyBriefPage({ params }: PropertyBriefPageProps) {
  const { id } = await params;
  const propertyId = encodeURIComponent(id);

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 pb-24 sm:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sky-700">
          <FileCheck2 className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-semibold uppercase tracking-wide">Property Brief</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-950">Prepare a selective property summary</h1>
        <p className="text-sm leading-6 text-slate-600">
          Property Brief will use selected verified facts, known history, evidence, source dates, and explicit
          unknowns. The previous composite Home Score and grade are retired.
        </p>
      </header>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-amber-950">Sharing remains disabled during the policy cutover</h2>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              A future brief will require purpose selection, recipient preview, expiration, revocation, access
              logging, sensitive-field warnings, and a conspicuous statement that it is not an inspection,
              appraisal, certification, title report, or disclosure.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href={`/dashboard/properties/${propertyId}`}
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Review Home Record
        </Link>
        <Link
          href={`/dashboard/properties/${propertyId}/timeline`}
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Review Home Timeline
        </Link>
        <Link
          href={`/dashboard/properties/${propertyId}/status-board`}
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Review Status Board
        </Link>
      </div>
    </main>
  );
}
