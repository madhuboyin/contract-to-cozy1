'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface SupportingActionCardProps {
  title: string;
  detail: string;
  href?: string;
  impact?: string | null;
  actionLabel?: string;
}

export default function SupportingActionCard({
  title,
  detail,
  href,
  impact,
  actionLabel = 'Review move',
}: SupportingActionCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Supporting Move
          </p>
          <h3 className="mb-0 text-lg font-semibold leading-tight text-slate-900">{title}</h3>
        </div>
      </div>
      <p className="mb-0 mt-2 text-sm leading-relaxed text-slate-600">{detail}</p>
      {impact ? <p className="mb-0 mt-2 text-xs font-medium text-emerald-700">{impact}</p> : null}
      <p className="mb-0 mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="no-brand-style group block rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_18px_35px_-28px_rgba(15,23,42,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_25px_40px_-26px_rgba(15,23,42,0.5)]"
      >
        {content}
      </Link>
    );
  }

  return (
    <section className="group rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_18px_35px_-28px_rgba(15,23,42,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_25px_40px_-26px_rgba(15,23,42,0.5)]">
      {content}
    </section>
  );
}
