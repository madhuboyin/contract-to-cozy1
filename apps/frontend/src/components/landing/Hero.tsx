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
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200/80 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="no-brand-style inline-flex items-center gap-2 text-slate-900">
            <BrandIcon className="h-6 w-6 text-brand-primary" />
            <span className="text-base font-semibold">Contract to Cozy</span>
          </Link>

          <div className="hidden items-center gap-6 md:flex">
            <button onClick={() => scrollToSection('features')} className="text-sm font-medium text-slate-600 hover:text-brand-700">
              Product
            </button>
            <button onClick={() => scrollToSection('journey')} className="text-sm font-medium text-slate-600 hover:text-brand-700">
              Your journey
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
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle navigation"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {isMenuOpen ? (
          <div className="border-t border-slate-200 bg-white md:hidden">
            <div className="space-y-1 px-4 py-4">
              <button onClick={() => scrollToSection('features')} className="flex min-h-[44px] w-full items-center text-left text-sm font-medium text-slate-700">
                Product
              </button>
              <button onClick={() => scrollToSection('journey')} className="flex min-h-[44px] w-full items-center text-left text-sm font-medium text-slate-700">
                Your journey
              </button>
              <button onClick={() => scrollToSection('calculator')} className="flex min-h-[44px] w-full items-center text-left text-sm font-medium text-slate-700">
                Savings
              </button>
              <Link href="/providers/join" onClick={() => setIsMenuOpen(false)} className="flex min-h-[44px] items-center text-sm font-medium text-slate-700">
                For providers
              </Link>
              <Link href="/login" onClick={() => setIsMenuOpen(false)} className="flex min-h-[44px] items-center text-sm font-medium text-slate-700">
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

      <div className="pt-16">
      <MarketingHeroTemplate
        eyebrow="The operating system for homeownership"
        title={
          <>
            Finally, one place to
            <span className="text-brand-700"> run your home.</span>
          </>
        }
        subtitle="Homeownership gets more complicated every year. Contract to Cozy gives every document, repair, project, expense, and decision one connected place—so you can run your home with confidence."
        ctaLabel="Create free account"
        ctaHref="/signup"
        secondaryCtaLabel="Explore product"
        secondaryCtaHref="#features"
        proofItems={[
          {
            label: 'Everything together',
            detail: 'Records, plans, finances, and trusted help in one home.',
          },
          {
            label: 'Built for years',
            detail: 'A permanent history that grows with your home.',
          },
          {
            label: 'Always prepared',
            detail: 'Know what happened, what matters, and what comes next.',
          },
        ]}
      />
      </div>
    </div>
  );
}
