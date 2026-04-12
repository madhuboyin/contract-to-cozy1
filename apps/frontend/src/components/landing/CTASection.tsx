import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

export default function CTASection() {
  return (
    <section className="bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-12 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white">Ready to run your home with confidence?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-base text-teal-50">
          Start free, get your highest-priority move, and take action with clear trust signals.
        </p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex min-h-[46px] items-center justify-center rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-slate-100"
          >
            Create free account
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex min-h-[46px] items-center justify-center rounded-lg border border-white/35 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Explore marketplace
          </Link>
        </div>

        <div className="mt-8 border-t border-white/30 pt-5">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-teal-50">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              No credit card required
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Homeowner-first guidance
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Cancel anytime
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
