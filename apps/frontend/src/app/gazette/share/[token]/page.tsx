// apps/frontend/src/app/gazette/share/[token]/page.tsx
import Link from 'next/link';

export default function GazetteSharePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-950">This shared Gazette edition is unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Whole-edition public sharing has been retired. Home Briefing now creates a separate
          expiring link containing only the share-eligible items a homeowner explicitly selects.
        </p>
        <Link href="/" className="mt-5 inline-block text-sm font-semibold text-slate-900 underline">
          Return to ContractToCozy
        </Link>
      </section>
    </main>
  );
}
