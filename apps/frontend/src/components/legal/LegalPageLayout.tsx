import Link from 'next/link';
import type { ReactNode } from 'react';
import Footer from '@/components/landing/Footer';
import { resolveIconByConcept } from '@/lib/icons';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export default function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  const BrandIcon = resolveIconByConcept('property');

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <BrandIcon className="h-5 w-5" />
            <span>Contract to Cozy</span>
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {lastUpdated}</p>

        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This page is a placeholder while our formal {title.toLowerCase()} is finalized with counsel
          ahead of pilot launch. Nothing on this page should be treated as final legal terms. Questions?
          Email{' '}
          <a href="mailto:legal@contracttocozy.com" className="font-medium underline">
            legal@contracttocozy.com
          </a>
          .
        </div>

        <div className="prose prose-slate mt-8 max-w-none text-sm leading-relaxed text-slate-700">
          {children}
        </div>
      </article>

      <Footer />
    </main>
  );
}
