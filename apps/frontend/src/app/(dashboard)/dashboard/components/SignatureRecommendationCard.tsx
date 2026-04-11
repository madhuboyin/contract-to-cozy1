'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export interface RecommendedMove {
  id: string;
  title: string;
  detail: string;
  href?: string;
  impact?: string | null;
}

interface SignatureRecommendationCardProps {
  propertyLabel: string;
  moves: RecommendedMove[];
  summary?: string | null;
}

export function SignatureRecommendationCard({
  propertyLabel,
  moves,
  summary,
}: SignatureRecommendationCardProps) {
  if (!moves.length) return null;

  return (
    <section className="mt-3 animate-fade-in-up rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/85 via-white to-teal-50/60 p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-600">
            If This Were My Home
          </p>
          <h3 className="mt-1 text-lg font-semibold leading-tight text-slate-900">
            Best next moves for {propertyLabel}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {summary || 'Based on your latest risk, savings, and seasonal signals.'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-indigo-700">
          <Sparkles className="h-3 w-3" />
          AI Plan
        </span>
      </div>

      <div className="space-y-2.5">
        {moves.slice(0, 3).map((move, index) => {
          const content = (
            <div className="group rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{move.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{move.detail}</p>
                  {move.impact ? (
                    <p className="mt-1 text-[11px] font-medium text-emerald-700">{move.impact}</p>
                  ) : null}
                </div>
                {move.href ? (
                  <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5" />
                ) : null}
              </div>
            </div>
          );

          if (move.href) {
            return (
              <Link key={move.id} href={move.href}>
                {content}
              </Link>
            );
          }

          return <div key={move.id}>{content}</div>;
        })}
      </div>
    </section>
  );
}
