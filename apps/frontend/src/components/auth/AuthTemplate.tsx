'use client';

import Link from 'next/link';
import { ShieldCheck, Sparkles, Timer } from 'lucide-react';
import { ReactNode } from 'react';
import { resolveIconByConcept } from '@/lib/icons';
import { CTC_INTERACTION_RULES_V1, CTC_TEMPLATE_SURFACES_V1 } from '@/lib/design-system/tokenGovernance';

interface AuthTemplateProps {
  title: string;
  subtitle: string;
  activeRoute: 'signup' | 'login';
  children: ReactNode;
  footer?: ReactNode;
}

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    label: 'Private and secure',
    detail: 'Your home profile is protected end-to-end.',
  },
  {
    icon: Timer,
    label: 'Fast setup',
    detail: 'Get your first personalized guidance in about 2 minutes.',
  },
  {
    icon: Sparkles,
    label: 'Actionable insights',
    detail: 'Clear next steps for maintenance, risk, and savings.',
  },
] as const;

export default function AuthTemplate({ title, subtitle, activeRoute, children, footer }: AuthTemplateProps) {
  const BrandIcon = resolveIconByConcept('property');

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.2),transparent_45%),linear-gradient(160deg,#f8fafc,#ecfeff_45%,#f0fdfa)]">
      <nav className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className={`no-brand-style inline-flex items-center gap-2 text-slate-900 transition-opacity hover:opacity-90 ${CTC_INTERACTION_RULES_V1.focusRing}`}
          >
            <BrandIcon className="h-6 w-6 text-brand-primary" />
            <span className="text-base font-semibold">Contract to Cozy</span>
          </Link>

          <div className="flex items-center gap-4 text-sm">
            {activeRoute === 'signup' ? (
              <Link href="/login" className="font-medium text-slate-600 hover:text-brand-700">
                Sign in
              </Link>
            ) : (
              <Link href="/signup" className="font-medium text-slate-600 hover:text-brand-700">
                Create account
              </Link>
            )}
            <Link href="/providers/join" className="hidden font-medium text-slate-600 hover:text-brand-700 sm:inline">
              For providers
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-12 lg:px-8">
        <section className="hidden lg:block">
          <div className={`${CTC_TEMPLATE_SURFACES_V1.elevatedCard} bg-white/90 p-8`}>
            <p className="mb-2 text-xs font-semibold tracking-normal text-brand-700">Homeowner Intelligence Platform</p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-950">
              Run your home with less stress and more confidence.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Contract to Cozy helps homeowners reduce surprises with clear guidance for maintenance,
              protection, and financial decisions.
            </p>

            <div className="mt-6 space-y-4">
              {TRUST_ITEMS.map(({ icon: Icon, label, detail }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3"
                >
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
            <header className="mb-6 text-center sm:text-left">
              <p className="mb-2 text-xs font-semibold tracking-normal text-brand-700">Welcome Home</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h2>
              <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
            </header>

            <div className="mb-6 grid grid-cols-1 gap-2 rounded-2xl border border-brand-100 bg-brand-50/55 p-3 sm:grid-cols-3 sm:p-2">
              <p className="rounded-xl bg-white px-3 py-2 text-center text-xs font-medium text-slate-700">Encrypted account</p>
              <p className="rounded-xl bg-white px-3 py-2 text-center text-xs font-medium text-slate-700">No setup fees</p>
              <p className="rounded-xl bg-white px-3 py-2 text-center text-xs font-medium text-slate-700">Mobile-first workflow</p>
            </div>

            {children}
            {footer ? <div className="mt-6">{footer}</div> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
