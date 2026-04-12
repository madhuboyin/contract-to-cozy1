'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { ReactNode } from 'react';

interface ProofItem {
  label: string;
  detail: string;
}

interface MarketingHeroTemplateProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  proofItems: ProofItem[];
  screenshotSrc?: string;
  screenshotAlt?: string;
}

export default function MarketingHeroTemplate({
  eyebrow,
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  proofItems,
  screenshotSrc = '/contract-to-cozy-dashboard.png',
  screenshotAlt = 'Contract to Cozy dashboard preview',
}: MarketingHeroTemplateProps) {
  return (
    <section className="relative overflow-hidden border-b border-slate-200/70 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.14),transparent_45%),linear-gradient(175deg,#f8fafc,#ecfeff_52%,#ffffff)] px-4 pb-14 pt-10 sm:px-6 sm:pb-16 sm:pt-12 lg:px-8 lg:pb-20">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.02fr_1fr] lg:gap-12">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            {eyebrow || 'Homeowner Intelligence'}
          </div>

          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-[3.35rem]">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">{subtitle}</p>

          <div className="mt-7">
            <Link
              href={ctaHref}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-16px_rgba(13,148,136,0.75)] transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
            {proofItems.slice(0, 3).map((item) => (
              <article key={item.label} className="rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-sm">
                <p className="mb-0 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{item.label}</p>
                <p className="mt-1 mb-0 text-sm text-slate-700">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-3 hidden rounded-[28px] bg-gradient-to-br from-brand-100/60 to-cyan-100/50 blur-2xl lg:block" />
          <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_28px_55px_-35px_rgba(15,23,42,0.65)]">
            <div className="flex items-center gap-1 border-b border-slate-200 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              <p className="ml-2 mb-0 text-[11px] font-medium text-slate-500">Contract to Cozy Preview</p>
            </div>
            <div className="relative aspect-[16/10] bg-slate-100">
              <Image
                src={screenshotSrc}
                alt={screenshotAlt}
                fill
                className="object-cover object-top"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
