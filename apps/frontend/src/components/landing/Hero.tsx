'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

import MarketingHeroTemplate from '@/components/landing/MarketingHeroTemplate';
import { resolveIconByConcept } from '@/lib/icons';

export default function Hero() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const BrandIcon = resolveIconByConcept('property');

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="relative w-full overflow-hidden bg-white">
      <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="no-brand-style inline-flex items-center gap-2 text-slate-900">
            <BrandIcon className="h-6 w-6 text-brand-primary" />
            <span className="text-base font-semibold">Contract to Cozy</span>
          </Link>

          <div className="hidden items-center gap-6 md:flex">
            <button onClick={() => scrollToSection('features')} className="text-sm font-medium text-slate-600 hover:text-brand-700">
              Product
            </button>
            <button onClick={() => scrollToSection('how-it-works')} className="text-sm font-medium text-slate-600 hover:text-brand-700">
              How it works
            </button>
            <button onClick={() => scrollToSection('calculator')} className="text-sm font-medium text-slate-600 hover:text-brand-700">
              Savings
            </button>
            <Link href="/providers/join" className="text-sm font-medium text-slate-600 hover:text-brand-700">
              For providers
            </Link>
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-brand-700">
              Sign in
            </Link>
            <Link href="/signup" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
              Create account
            </Link>
          </div>

          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle navigation"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {isMenuOpen ? (
          <div className="border-t border-slate-200 bg-white md:hidden">
            <div className="space-y-3 px-4 py-5">
              <button onClick={() => scrollToSection('features')} className="block w-full text-left text-sm font-medium text-slate-700">
                Product
              </button>
              <button onClick={() => scrollToSection('how-it-works')} className="block w-full text-left text-sm font-medium text-slate-700">
                How it works
              </button>
              <button onClick={() => scrollToSection('calculator')} className="block w-full text-left text-sm font-medium text-slate-700">
                Savings
              </button>
              <Link href="/providers/join" onClick={() => setIsMenuOpen(false)} className="block text-sm font-medium text-slate-700">
                For providers
              </Link>
              <Link href="/login" onClick={() => setIsMenuOpen(false)} className="block text-sm font-medium text-slate-700">
                Sign in
              </Link>
              <Link
                href="/signup"
                onClick={() => setIsMenuOpen(false)}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Create account
              </Link>
            </div>
          </div>
        ) : null}
      </nav>

      <MarketingHeroTemplate
        eyebrow="Homeowner confidence, minus the guesswork"
        title={
          <>
            Know your next home move in under
            <span className="text-brand-700"> two minutes</span>.
          </>
        }
        subtitle="Contract to Cozy turns scattered home data into clear, prioritized decisions so you can protect value, lower risk, and avoid expensive surprises."
        ctaLabel="Start free homeowner account"
        ctaHref="/signup"
        proofItems={[
          {
            label: 'Decision clarity',
            detail: 'One ranked next step instead of dashboard overload.',
          },
          {
            label: 'Trust signals',
            detail: 'Confidence, source, and recency attached to recommendations.',
          },
          {
            label: 'Mobile ready',
            detail: 'Manage your home from your phone with calm, guided workflows.',
          },
        ]}
      />
    </div>
  );
}
