// apps/frontend/src/app/gazette/share/[token]/GazetteShareViewClient.tsx
//
// Public (unauthenticated) view of a shared Gazette edition.
// Resolves the share token via the public backend endpoint and renders
// share-safe stories only. Handles revoked/expired/not-found tokens gracefully.

'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  ExternalLink,
  FileText,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (share-safe subset of the edition DTOs)
// ---------------------------------------------------------------------------

type ShareSafeStory = {
  id: string;
  storyCategory: string;
  storyTag?: string | null;
  rank: number;
  isHero: boolean;
  headline: string;
  dek?: string | null;
  summary: string;
  primaryDeepLink: string;
  shareSafe: boolean;
};

type ShareSafeEdition = {
  id: string;
  propertyId: string;
  weekStart: string;
  weekEnd: string;
  summaryHeadline?: string | null;
  summaryDeck?: string | null;
  tickerJson?: string[] | null;
  publishedAt?: string | null;
  stories: ShareSafeStory[];
};

type ShareInfo = {
  viewCount: number;
  expiresAt?: string | null;
};

type PublicEditionResponse = {
  success: boolean;
  data?: {
    edition: ShareSafeEdition;
    shareInfo: ShareInfo;
  };
  message?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDateRange(weekStart: string, weekEnd: string): string {
  const s = new Date(weekStart);
  const e = new Date(weekEnd);
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
  return `${s.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`;
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  RISK: { label: 'Risk', color: 'bg-red-50 text-red-700 border-red-200' },
  MAINTENANCE: { label: 'Maintenance', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  INCIDENT: { label: 'Incident', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  CLAIMS: { label: 'Claims', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  INSURANCE: { label: 'Insurance', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  WARRANTY: { label: 'Warranty', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  FINANCIAL: { label: 'Financial', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REFINANCE: { label: 'Refinance', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  NEIGHBORHOOD: { label: 'Neighborhood', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  SEASONAL: { label: 'Seasonal', color: 'bg-lime-50 text-lime-700 border-lime-200' },
  SCORE: { label: 'Score', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  DIGITAL_TWIN: { label: 'Digital Twin', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  GENERAL: { label: 'General', color: 'bg-slate-50 text-slate-600 border-slate-200' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GazetteShareViewClient() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [edition, setEdition] = useState<ShareSafeEdition | null>(null);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorCode('INVALID');
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetch(`/api/gazette/share/${token}`)
      .then(async (res) => {
        if (cancelled) return;
        const body: PublicEditionResponse = await res.json();
        if (!res.ok || !body.success || !body.data) {
          setErrorCode(res.status === 410 ? 'REVOKED' : res.status === 404 ? 'NOT_FOUND' : 'ERROR');
          setErrorMessage(body.message ?? body.error ?? null);
        } else {
          setEdition(body.data.edition);
          setShareInfo(body.data.shareInfo);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorCode('ERROR');
          setErrorMessage('Failed to load this shared edition.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token]);

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-900" />
      </div>
    );
  }

  // --- Error / revoked / not-found ---
  if (errorCode || !edition) {
    const isRevoked = errorCode === 'REVOKED';
    const isExpired = errorMessage?.toLowerCase().includes('expired');

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          {isRevoked || isExpired ? (
            <XCircle className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          ) : (
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-400" />
          )}
          <h1 className="mb-2 text-lg font-semibold text-slate-900">
            {isRevoked ? 'Link revoked' : isExpired ? 'Link expired' : 'Edition not available'}
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            {isRevoked
              ? 'The owner has revoked access to this shared edition.'
              : isExpired
              ? 'This share link has expired.'
              : errorMessage ?? 'This share link is invalid or no longer available.'}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            <ExternalLink className="h-4 w-4" />
            Visit Contract to Cozy
          </Link>
        </div>
      </div>
    );
  }

  // --- Filter to share-safe stories only ---
  const safeStories = edition.stories.filter((s) => s.shareSafe !== false);
  const heroStory = safeStories.find((s) => s.isHero) ?? safeStories[0];
  const otherStories = safeStories.filter((s) => !s.isHero);
  const tickerItems = (edition.tickerJson ?? []) as string[];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900">Home Gazette</span>
          </div>
          <Link
            href="/"
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Contract to Cozy
          </Link>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-2xl space-y-5 px-6 py-8">
        {/* Edition header */}
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="h-3.5 w-3.5" />
            {fmtDateRange(edition.weekStart, edition.weekEnd)}
          </p>
          {edition.summaryHeadline && (
            <h1 className="text-2xl font-bold text-slate-900">{edition.summaryHeadline}</h1>
          )}
          {edition.summaryDeck && (
            <p className="mt-1 text-base text-slate-600">{edition.summaryDeck}</p>
          )}
        </div>

        {/* Ticker */}
        {tickerItems.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 scrollbar-none">
            <div className="flex items-center gap-5 whitespace-nowrap">
              {tickerItems.map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-slate-600">·</span>}
                  <span className="text-xs text-slate-300">{item}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Hero story */}
        {heroStory && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-900 bg-slate-900 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                Top Story
              </span>
              {(() => {
                const meta = CATEGORY_META[heroStory.storyCategory] ?? CATEGORY_META.GENERAL;
                return (
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                    {meta.label}
                  </span>
                );
              })()}
            </div>
            <h2 className="mb-2 text-xl font-bold leading-snug text-slate-900">
              {heroStory.headline}
            </h2>
            {heroStory.dek && (
              <p className="mb-3 text-base font-medium text-slate-600">{heroStory.dek}</p>
            )}
            <p className="text-sm leading-relaxed text-slate-600">{heroStory.summary}</p>
          </div>
        )}

        {/* Other stories */}
        {otherStories.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-sm overflow-hidden">
            {otherStories.map((story) => {
              const meta = CATEGORY_META[story.storyCategory] ?? CATEGORY_META.GENERAL;
              return (
                <div key={story.id} className="flex items-start gap-4 p-4">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                    {story.rank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                      {story.storyTag && (
                        <span className="text-[11px] text-slate-400">{story.storyTag}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold leading-snug text-slate-900">{story.headline}</p>
                    {story.dek && (
                      <p className="mt-0.5 text-xs text-slate-500">{story.dek}</p>
                    )}
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {story.summary}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 pt-2 text-xs text-slate-400">
          <span>
            {shareInfo?.viewCount != null && shareInfo.viewCount > 0
              ? `Viewed ${shareInfo.viewCount} time${shareInfo.viewCount !== 1 ? 's' : ''}`
              : 'Shared edition'}
          </span>
          {shareInfo?.expiresAt && (
            <span>
              Expires{' '}
              {new Date(shareInfo.expiresAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      </main>
    </div>
  );
}
