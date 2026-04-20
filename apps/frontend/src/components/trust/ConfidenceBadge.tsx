'use client';

import React from 'react';
import { ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfidenceLevel } from '@/lib/types/trust';

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  score?: number;
  className?: string;
}

export function ConfidenceBadge({ level, score, className }: ConfidenceBadgeProps) {
  const config = {
    high: {
      icon: ShieldCheck,
      text: 'High Confidence',
      styles: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    medium: {
      icon: Shield,
      text: 'Verified Estimate',
      styles: 'bg-amber-50 text-amber-700 border-amber-100',
    },
    low: {
      icon: ShieldAlert,
      text: 'Limited Data',
      styles: 'bg-slate-50 text-slate-600 border-slate-200',
    },
  }[level];

  const Icon = config.icon;

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
      config.styles,
      className
    )}>
      <Icon className="h-3 w-3" />
      {config.text}
      {score !== undefined && <span className="ml-0.5 opacity-60">{score}%</span>}
    </div>
  );
}
