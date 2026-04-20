'use client';

import React from 'react';
import Link from 'next/link';
import { LucideIcon, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  category: string;
  isNew?: boolean;
}

export function ToolCard({
  title,
  description,
  href,
  icon: Icon,
  category,
  isNew = false,
}: ToolCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-brand-200 hover:shadow-md active:scale-[0.98]"
    >
      {isNew && (
        <span className="absolute right-4 top-4 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700">
          New
        </span>
      )}
      
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-600 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600">
        <Icon className="h-5 w-5" />
      </div>

      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {category}
      </div>
      
      <h3 className="mb-1.5 text-base font-semibold text-slate-900 group-hover:text-brand-700">
        {title}
      </h3>
      
      <p className="flex-1 text-sm leading-relaxed text-slate-500 line-clamp-2">
        {description}
      </p>

      <div className="mt-4 flex items-center text-sm font-bold text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
        Open Tool
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </div>
    </Link>
  );
}
