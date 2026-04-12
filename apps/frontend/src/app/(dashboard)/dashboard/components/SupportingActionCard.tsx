'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface SupportingActionCardProps {
  title: string;
  detail: string;
  href?: string;
  impact?: string | null;
}

export default function SupportingActionCard({ title, detail, href, impact }: SupportingActionCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-indigo-700">Supporting Move</p>
          <h3 className="mb-0 text-base font-semibold text-slate-900">{title}</h3>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 text-slate-500" />
      </div>
      <p className="mt-2 mb-0 text-sm text-slate-600">{detail}</p>
      {impact ? <p className="mt-2 mb-0 text-xs font-medium text-emerald-700">{impact}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="no-brand-style block rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/75 via-white to-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
      >
        {content}
      </Link>
    );
  }

  return (
    <section className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/75 via-white to-white p-4 shadow-sm">
      {content}
    </section>
  );
}
