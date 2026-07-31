import Link from 'next/link';

export default function BuyerReportPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center p-6">
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-950">This Home Score share is no longer available</h1>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          Composite scores and buyer-facing grades have been retired. Property Brief sharing will return only
          after purpose selection, recipient preview, expiration, revocation, access logging, and limitation
          controls are in place.
        </p>
        <Link href="/" className="mt-5 inline-block text-sm font-semibold text-amber-950 underline">
          Return to ContractToCozy
        </Link>
      </section>
    </main>
  );
}
