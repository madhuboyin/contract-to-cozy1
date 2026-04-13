'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { BriefcaseBusiness, ShieldCheck, Timer, TrendingUp } from 'lucide-react';
import { CTC_INTERACTION_RULES_V1, CTC_TEMPLATE_SURFACES_V1 } from '@/lib/design-system/tokenGovernance';
import TrustStrip from '@/components/system/TrustStrip';

interface ProviderAuthTemplateProps {
  title: string;
  subtitle: string;
  activeRoute: 'join' | 'login';
  children: ReactNode;
  footer?: ReactNode;
}

const TRUST_ROWS = [
  {
    icon: ShieldCheck,
    label: 'Trusted operations',
    detail: 'Profiles, coverage details, and bookings are protected with role-based access.',
  },
  {
    icon: Timer,
    label: 'Fast booking response',
    detail: 'Priority queue helps you answer homeowner requests quickly and clearly.',
  },
  {
    icon: TrendingUp,
    label: 'Conversion-focused setup',
    detail: 'Clear trust and availability signals improve homeowner confidence and booking rate.',
  },
] as const;

export default function ProviderAuthTemplate({
  title,
  subtitle,
  activeRoute,
  children,
  footer,
}: ProviderAuthTemplateProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(14,116,144,0.14),transparent_45%),linear-gradient(155deg,#f8fafc,#f0f9ff_48%,#ecfeff)]">
      <nav className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className={`no-brand-style inline-flex items-center gap-2 text-slate-900 transition-opacity hover:opacity-90 ${CTC_INTERACTION_RULES_V1.focusRing}`}
          >
            <BriefcaseBusiness className="h-6 w-6 text-brand-primary" />
            <span className="text-base font-semibold">Contract to Cozy</span>
          </Link>

          <div className="flex items-center gap-4 text-sm">
            {activeRoute === 'join' ? (
              <Link href="/providers/login" className="font-medium text-slate-600 hover:text-brand-700">
                Provider sign in
              </Link>
            ) : (
              <Link href="/providers/join" className="font-medium text-slate-600 hover:text-brand-700">
                Join as provider
              </Link>
            )}
            <Link href="/login" className="hidden font-medium text-slate-600 hover:text-brand-700 sm:inline">
              Homeowner sign in
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.04fr_1fr] lg:items-center lg:gap-12 lg:px-8">
        <section className="hidden lg:block">
          <div className={`${CTC_TEMPLATE_SURFACES_V1.elevatedCard} bg-white/95 p-8`}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Provider Workspace</p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-950">
              Build homeowner trust before the first visit.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Manage availability, respond faster, and keep your service profile clear so homeowners can book with confidence.
            </p>

            <div className="mt-6 space-y-4">
              {TRUST_ROWS.map(({ icon: Icon, label, detail }) => (
                <div key={label} className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{label}</p>
                      <p className="text-sm text-slate-600">{detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full">
          <div className={`${CTC_TEMPLATE_SURFACES_V1.elevatedCard} p-5 sm:p-8`}>
            <header className="mb-5 text-center sm:text-left">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.13em] text-brand-700">Provider Access</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h2>
              <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
            </header>

            <TrustStrip
              className="mb-5"
              title="Provider Trust Signals"
              confidenceLabel="Profile quality and response speed drive homeowner booking confidence."
              freshnessLabel="Availability and booking queue update in near real-time."
              sourceLabel="Provider profile, booking telemetry, and homeowner request history."
              rationale="Transparent profile and queue signals reduce homeowner drop-off before booking."
            />

            {children}
            {footer ? <div className="mt-6">{footer}</div> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
