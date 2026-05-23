'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface KnowledgeMobileHeaderProps {
  backHref?: string;
  backLabel?: string;
  title?: string;
}

export function KnowledgeMobileHeader({
  backHref = '/dashboard',
  backLabel = 'Dashboard',
  title = 'Knowledge Hub',
}: KnowledgeMobileHeaderProps) {
  return (
    <header className="sticky top-0 z-40 md:hidden border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex h-14 items-center gap-3 px-4" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <Link
          href={backHref}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 active:bg-slate-50"
          aria-label={`Back to ${backLabel}`}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="flex-1 truncate text-[15px] font-semibold text-slate-900">{title}</span>
      </div>
    </header>
  );
}
