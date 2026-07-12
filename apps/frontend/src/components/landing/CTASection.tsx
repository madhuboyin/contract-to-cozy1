import Link from 'next/link';

export default function CTASection() {
  return (
    <section className="bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-12 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white">Your home deserves a permanent memory.</h2>

        <div className="mt-7 flex justify-center">
          <Link
            href="/signup"
            className="inline-flex min-h-[46px] items-center justify-center rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-slate-100"
          >
            Start my home&apos;s history
          </Link>
        </div>
      </div>
    </section>
  );
}
