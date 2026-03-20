// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-gazette/HomeGazetteClient.tsx
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  History,
  Info,
  Layers,
  RefreshCw,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import {
  MobileActionRow,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Button } from '@/components/ui/button';
import {
  createShareLink,
  getCurrentEdition,
  getEdition,
  getEditions,
  type GazetteEditionCardDto,
  type GazetteEditionDto,
  type GazetteShareResult,
  type GazetteStoryDto,
} from './homeGazetteApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateRange(weekStart: string, weekEnd: string): string {
  const s = new Date(weekStart);
  const e = new Date(weekEnd);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (s.getFullYear() !== e.getFullYear()) {
    return `${s.toLocaleDateString('en-US', { ...opts, year: 'numeric' })} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
  }
  if (s.getMonth() !== e.getMonth()) {
    return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}, ${e.getFullYear()}`;
  }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.getDate()}, ${e.getFullYear()}`;
}

function fmtRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  RISK: { label: 'Risk', color: 'border-red-200/70 bg-red-50/85 text-red-700 dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-300' },
  MAINTENANCE: { label: 'Maintenance', color: 'border-amber-200/70 bg-amber-50/85 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300' },
  INCIDENT: { label: 'Incident', color: 'border-orange-200/70 bg-orange-50/85 text-orange-700 dark:border-orange-800/70 dark:bg-orange-950/60 dark:text-orange-300' },
  CLAIMS: { label: 'Claims', color: 'border-purple-200/70 bg-purple-50/85 text-purple-700 dark:border-purple-800/70 dark:bg-purple-950/60 dark:text-purple-300' },
  INSURANCE: { label: 'Insurance', color: 'border-blue-200/70 bg-blue-50/85 text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-blue-300' },
  WARRANTY: { label: 'Warranty', color: 'border-cyan-200/70 bg-cyan-50/85 text-cyan-700 dark:border-cyan-800/70 dark:bg-cyan-950/60 dark:text-cyan-300' },
  FINANCIAL: { label: 'Financial', color: 'border-emerald-200/70 bg-emerald-50/85 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300' },
  REFINANCE: { label: 'Refinance', color: 'border-teal-200/70 bg-teal-50/85 text-teal-700 dark:border-teal-800/70 dark:bg-teal-950/60 dark:text-teal-300' },
  NEIGHBORHOOD: { label: 'Neighborhood', color: 'border-indigo-200/70 bg-indigo-50/85 text-indigo-700 dark:border-indigo-800/70 dark:bg-indigo-950/60 dark:text-indigo-300' },
  SEASONAL: { label: 'Seasonal', color: 'border-lime-200/70 bg-lime-50/85 text-lime-700 dark:border-lime-800/70 dark:bg-lime-950/60 dark:text-lime-300' },
  SCORE: { label: 'Score', color: 'border-sky-200/70 bg-sky-50/85 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-300' },
  DIGITAL_TWIN: { label: 'Digital Twin', color: 'border-violet-200/70 bg-violet-50/85 text-violet-700 dark:border-violet-800/70 dark:bg-violet-950/60 dark:text-violet-300' },
  GENERAL: { label: 'General', color: 'border-slate-200/70 bg-slate-50/85 text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300' },
};

function getCategoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? CATEGORY_META.GENERAL;
}

// ─── Primitive Card Shells ────────────────────────────────────────────────────

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-blue-50/40 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38 ${className}`}
    >
      {children}
    </div>
  );
}

function InnerCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-white/70 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55 ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Category Badge ───────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const meta = getCategoryMeta(category);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium backdrop-blur ${meta.color}`}
    >
      {meta.label}
    </span>
  );
}

// ─── Ticker Strip ─────────────────────────────────────────────────────────────

function TickerStrip({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-slate-900/92 backdrop-blur dark:border-slate-700/70">
      <div className="flex items-center gap-0">
        <div className="shrink-0 border-r border-slate-700/80 px-3 py-2.5">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Updates</span>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto px-4 py-2.5 scrollbar-none">
          <div className="flex items-center gap-6 whitespace-nowrap">
            {items.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-slate-600">·</span>}
                <span className="text-xs text-slate-300">{item}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hero Story Card ──────────────────────────────────────────────────────────

function HeroCard({
  story,
  propertyId,
}: {
  story: GazetteStoryDto;
  propertyId: string;
}) {
  const meta = getCategoryMeta(story.storyCategory);

  return (
    <GlassCard>
      <div className="p-5 sm:p-6">
        {/* Category + Hero label */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-900/20 bg-slate-900 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white dark:border-white/20 dark:bg-white dark:text-slate-900">
            Top Story
          </span>
          <CategoryBadge category={story.storyCategory} />
          {story.storyTag && (
            <span className="text-xs text-slate-400 dark:text-slate-500">{story.storyTag}</span>
          )}
        </div>

        {/* Headline */}
        <h2 className="mb-2 text-xl font-bold leading-snug text-slate-900 dark:text-slate-50 sm:text-2xl">
          {story.headline}
        </h2>

        {/* Dek */}
        {story.dek && (
          <p className="mb-3 text-base font-medium leading-relaxed text-slate-600 dark:text-slate-300">
            {story.dek}
          </p>
        )}

        {/* Summary */}
        <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {story.summary}
        </p>

        {/* Meta row */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400 dark:text-slate-500">
          {story.urgencyScore != null && (
            <span>Urgency: {Math.round(story.urgencyScore * 100)}%</span>
          )}
          {story.financialImpactEstimate != null && story.financialImpactEstimate > 0 && (
            <span>
              Est. impact:{' '}
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
                story.financialImpactEstimate,
              )}
            </span>
          )}
        </div>

        {/* CTA */}
        <Link
          href={`/dashboard/properties/${propertyId}/${story.primaryDeepLink.replace(/^\//, '')}`}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
          View Details
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </GlassCard>
  );
}

// ─── Story Card ───────────────────────────────────────────────────────────────

function StoryCard({
  story,
  propertyId,
}: {
  story: GazetteStoryDto;
  propertyId: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-white/70 bg-white/72 p-4 backdrop-blur transition-colors hover:bg-white/85 dark:border-slate-700/70 dark:bg-slate-900/55 dark:hover:bg-slate-900/70">
      {/* Rank indicator */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{story.rank}</span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <CategoryBadge category={story.storyCategory} />
          {story.storyTag && (
            <span className="text-xs text-slate-400 dark:text-slate-500">{story.storyTag}</span>
          )}
        </div>
        <p className="mb-1 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
          {story.headline}
        </p>
        {story.dek && (
          <p className="mb-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {story.dek}
          </p>
        )}
        <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {story.summary}
        </p>
        <Link
          href={`/dashboard/properties/${propertyId}/${story.primaryDeepLink.replace(/^\//, '')}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
        >
          View
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

// ─── Edition Meta Footer ──────────────────────────────────────────────────────

function EditionMeta({ edition }: { edition: GazetteEditionDto }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-1 text-xs text-slate-400 dark:text-slate-500">
      {edition.publishedAt && (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Published {fmtRelativeDate(edition.publishedAt)}
        </span>
      )}
      <span className="flex items-center gap-1">
        <Layers className="h-3 w-3" />
        {edition.selectedCount} of {edition.qualifiedCount} signal{edition.qualifiedCount !== 1 ? 's' : ''}
      </span>
      {edition.generationVersion && (
        <span>v{edition.generationVersion}</span>
      )}
    </div>
  );
}

// ─── Share Modal ──────────────────────────────────────────────────────────────

function ShareModal({
  editionId,
  onClose,
}: {
  editionId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GazetteShareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const data = await createShareLink(editionId);
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create share link');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    const url = `${window.location.origin}${result.shareUrl}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const shareUrl = result ? `${typeof window !== 'undefined' ? window.location.origin : ''}${result.shareUrl}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative z-10 w-full max-w-md rounded-t-3xl border border-white/70 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/95 sm:rounded-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Share This Edition</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Generate a link to share this Gazette edition. Only share-safe stories are included.
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200/70 bg-red-50/85 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!result ? (
          <button
            onClick={handleCreate}
            disabled={loading}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300/70 bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:border-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating link…
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" />
                Create Share Link
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/85 px-3 py-2.5 dark:border-slate-700/70 dark:bg-slate-800/55">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                {shareUrl}
              </span>
              <button
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200"
              >
                {copied ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>

            {result.shareLink.expiresAt && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Expires:{' '}
                {new Date(result.shareLink.expiresAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            )}

            <a
              href={shareUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200/70 bg-white/80 text-sm font-medium text-slate-700 transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-800/55 dark:text-slate-200"
            >
              <ExternalLink className="h-4 w-4" />
              Open shared link
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── History List ─────────────────────────────────────────────────────────────

function HistoryList({
  propertyId,
  onSelectEdition,
}: {
  propertyId: string;
  onSelectEdition: (editionId: string) => void;
}) {
  const [editions, setEditions] = useState<GazetteEditionCardDto[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(page: number) {
    setLoading(true);
    setError(null);
    try {
      const result = await getEditions(propertyId, page, 12);
      setEditions(result.editions);
      setPagination({ page: result.pagination.page, totalPages: result.pagination.totalPages });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load editions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  if (loading && editions.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-white/70 bg-white/65 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/45">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-900 dark:border-slate-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-4 backdrop-blur">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        <div>
          <p className="text-sm font-medium text-red-800">{error}</p>
          <button
            onClick={() => loadPage(pagination.page)}
            className="mt-1.5 text-sm font-medium text-red-600 hover:text-red-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (editions.length === 0) {
    return (
      <GlassCard>
        <div className="p-8 text-center">
          <History className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No editions yet</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Past editions will appear here as they&apos;re published.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-3">
      {editions.map((edition) => (
        <EditionHistoryCard
          key={edition.id}
          edition={edition}
          onSelect={() => onSelectEdition(edition.id)}
        />
      ))}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => loadPage(pagination.page - 1)}
            disabled={pagination.page <= 1 || loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/80 px-4 text-xs font-medium text-slate-600 disabled:opacity-40 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300"
          >
            <ChevronUp className="h-3.5 w-3.5 rotate-90" />
            Prev
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            onClick={() => loadPage(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages || loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/80 px-4 text-xs font-medium text-slate-600 disabled:opacity-40 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300"
          >
            Next
            <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
          </button>
        </div>
      )}
    </div>
  );
}

function EditionHistoryCard({
  edition,
  onSelect,
}: {
  edition: GazetteEditionCardDto;
  onSelect: () => void;
}) {
  const isPublished = edition.status === 'PUBLISHED';
  const isSkipped = edition.status === 'SKIPPED';

  return (
    <button
      onClick={onSelect}
      className="w-full overflow-hidden rounded-2xl border border-white/70 bg-white/72 text-left transition-all hover:border-slate-300/70 hover:bg-white/85 hover:shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55 dark:hover:bg-slate-900/70"
    >
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              <Calendar className="mr-1 inline h-3 w-3" />
              {fmtDateRange(edition.weekStart, edition.weekEnd)}
            </span>
            {edition.summaryHeadline && (
              <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
                {edition.summaryHeadline}
              </p>
            )}
            {!edition.summaryHeadline && (
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {isSkipped ? 'No edition this week' : 'Weekly edition'}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <EditionStatusPill status={edition.status} />
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          </div>
        </div>

        {isPublished && edition.selectedCount > 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {edition.selectedCount} stor{edition.selectedCount === 1 ? 'y' : 'ies'}
          </p>
        )}
      </div>
    </button>
  );
}

function EditionStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PUBLISHED: 'border-emerald-200/70 bg-emerald-50/85 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300',
    SKIPPED: 'border-slate-200/70 bg-slate-50/85 text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-400',
    DRAFT: 'border-amber-200/70 bg-amber-50/85 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300',
    READY: 'border-blue-200/70 bg-blue-50/85 text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-blue-300',
    FAILED: 'border-red-200/70 bg-red-50/85 text-red-700 dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-300',
  };
  const labels: Record<string, string> = {
    PUBLISHED: 'Published',
    SKIPPED: 'Quiet week',
    DRAFT: 'Draft',
    READY: 'Ready',
    FAILED: 'Failed',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium backdrop-blur ${map[status] ?? map.DRAFT}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

// ─── Edition Detail Drawer ────────────────────────────────────────────────────

function EditionDetailPanel({
  editionId,
  propertyId,
  onClose,
}: {
  editionId: string;
  propertyId: string;
  onClose: () => void;
}) {
  const [edition, setEdition] = useState<GazetteEditionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getEdition(editionId)
      .then(setEdition)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load edition'))
      .finally(() => setLoading(false));
  }, [editionId]);

  const heroStory = edition?.stories.find((s) => s.isHero) ?? edition?.stories[0];
  const otherStories = edition?.stories.filter((s) => !s.isHero) ?? [];
  const tickerItems = edition?.tickerJson ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/70 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/95 sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4 dark:border-slate-700/70">
          <div>
            {edition && (
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                <Calendar className="mr-1 inline h-3 w-3" />
                {fmtDateRange(edition.weekStart, edition.weekEnd)}
              </p>
            )}
            {edition?.summaryHeadline && (
              <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {edition.summaryHeadline}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {edition?.status === 'PUBLISHED' && (
              <button
                onClick={() => setShowShare(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/80 px-3 text-xs font-medium text-slate-600 dark:border-slate-700/70 dark:bg-slate-800/55 dark:text-slate-300"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
            )}
            <button
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {loading && (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-900 dark:border-slate-100" />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200/70 bg-red-50/85 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          {edition && !loading && (
            <>
              {Array.isArray(tickerItems) && tickerItems.length > 0 && (
                <TickerStrip items={tickerItems as string[]} />
              )}

              {edition.summaryDeck && (
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {edition.summaryDeck}
                </p>
              )}

              {heroStory && (
                <HeroCard story={heroStory} propertyId={propertyId} />
              )}

              {otherStories.length > 0 && (
                <div className="space-y-2">
                  <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    More This Week
                  </h3>
                  {otherStories.map((story) => (
                    <StoryCard key={story.id} story={story} propertyId={propertyId} />
                  ))}
                </div>
              )}

              <EditionMeta edition={edition} />
            </>
          )}
        </div>
      </div>

      {showShare && edition && (
        <ShareModal editionId={edition.id} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

// ─── Empty / Bootstrap State ──────────────────────────────────────────────────

function BootstrapState({ propertyId }: { propertyId: string }) {
  return (
    <GlassCard>
      <div className="p-8 text-center">
        <Sparkles className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
        <h3 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
          Your Home Gazette is being set up
        </h3>
        <p className="mx-auto mb-5 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          The Gazette will automatically generate a weekly edition summarising what&apos;s been happening with your home — risks, maintenance, financials, and more.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Check back after the next weekly generation run.
        </p>
      </div>
    </GlassCard>
  );
}

function SkippedState({ edition }: { edition: GazetteEditionDto }) {
  return (
    <GlassCard>
      <div className="p-6 text-center">
        <Info className="mx-auto mb-4 h-10 w-10 text-slate-300 dark:text-slate-600" />
        <h3 className="mb-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Quiet week
        </h3>
        <p className="mx-auto max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {edition.skippedReason === 'NOT_ENOUGH_SIGNALS'
            ? 'Not enough new signals this week to generate an edition. Nothing urgent to report.'
            : 'No edition was generated this week.'}
        </p>
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          {fmtDateRange(edition.weekStart, edition.weekEnd)}
        </p>
      </div>
    </GlassCard>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'current' | 'history';

export default function HomeGazetteClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [tab, setTab] = useState<Tab>('current');
  const [loading, setLoading] = useState(false);
  const [edition, setEdition] = useState<GazetteEditionDto | null | 'none'>('none');
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [selectedEditionId, setSelectedEditionId] = useState<string | null>(null);
  const [storyExpanded, setStoryExpanded] = useState(false);

  const reqRef = useRef(0);

  const loadCurrent = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    const reqId = ++reqRef.current;
    try {
      const data = await getCurrentEdition(propertyId);
      if (reqId !== reqRef.current) return;
      setEdition(data ?? 'none');
    } catch (e: unknown) {
      if (reqId !== reqRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load Gazette');
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    if (tab === 'current') {
      loadCurrent();
    }
  }, [tab, loadCurrent]);

  const currentEdition = edition !== 'none' ? edition : null;
  const heroStory = currentEdition?.stories.find((s) => s.isHero) ?? currentEdition?.stories[0];
  const otherStories = currentEdition?.stories.filter((s) => !s.isHero) ?? [];
  const visibleStories = storyExpanded ? otherStories : otherStories.slice(0, 3);
  const tickerItems = (currentEdition?.tickerJson ?? []) as string[];

  return (
    <MobilePageContainer className="space-y-5 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      {/* Back */}
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to property
        </Link>
      </Button>

      {/* Page intro */}
      <MobilePageIntro
        eyebrow="Home Tool"
        title="Home Gazette"
        subtitle="Your weekly home intelligence briefing — risks, maintenance, finances, and more."
       className="lg:hidden"/>

      {/* Filter surface: tool rail + tabs + actions */}
      <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
        <HomeToolsRail
          propertyId={propertyId}
          context="home-gazette"
          currentToolId="home-gazette"
        />

        <MobileActionRow className="justify-between">
          {/* Tab buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setTab('current')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-all ${
                tab === 'current'
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-200/70 bg-white/80 text-slate-600 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Current
            </button>
            <button
              onClick={() => setTab('history')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-all ${
                tab === 'history'
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-200/70 bg-white/80 text-slate-600 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              History
            </button>
          </div>

          {/* Refresh (current tab only) */}
          {tab === 'current' && (
            <button
              onClick={loadCurrent}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/80 px-3.5 text-xs font-medium text-slate-600 transition-colors hover:bg-white disabled:opacity-50 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
        </MobileActionRow>
      </MobileFilterSurface>

      {/* ── CURRENT TAB ───────────────────────────────────────────────────── */}
      {tab === 'current' && (
        <>
          {/* Loading */}
          {loading && !currentEdition && (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-white/70 bg-white/65 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/45">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-900 dark:border-slate-100" />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-4 backdrop-blur">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-800">{error}</p>
                <button
                  onClick={loadCurrent}
                  className="mt-2 text-sm font-medium text-red-600 hover:text-red-800"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* No published edition */}
          {!loading && !error && edition === 'none' && (
            <BootstrapState propertyId={propertyId} />
          )}

          {/* Skipped edition */}
          {!loading && !error && currentEdition?.status === 'SKIPPED' && (
            <SkippedState edition={currentEdition} />
          )}

          {/* Published edition */}
          {!loading && !error && currentEdition?.status === 'PUBLISHED' && (
            <>
              {/* Edition header row */}
              <div className="flex items-center justify-between gap-3 px-1">
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    <Calendar className="mr-1 inline h-3 w-3" />
                    {fmtDateRange(currentEdition.weekStart, currentEdition.weekEnd)}
                  </p>
                  {currentEdition.summaryHeadline && (
                    <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">
                      {currentEdition.summaryHeadline}
                    </h2>
                  )}
                  {currentEdition.summaryDeck && (
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      {currentEdition.summaryDeck}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowShare(true)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/80 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </button>
              </div>

              {/* Ticker */}
              {tickerItems.length > 0 && <TickerStrip items={tickerItems} />}

              {/* Hero story */}
              {heroStory && <HeroCard story={heroStory} propertyId={propertyId} />}

              {/* Other stories */}
              {otherStories.length > 0 && (
                <div className="space-y-2">
                  <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Also This Week
                  </h3>
                  <InnerCard>
                    <div className="divide-y divide-slate-100/70 dark:divide-slate-800/70">
                      {visibleStories.map((story) => (
                        <div key={story.id} className="p-4">
                          <StoryCard story={story} propertyId={propertyId} />
                        </div>
                      ))}
                    </div>

                    {otherStories.length > 3 && (
                      <div className="border-t border-slate-100/70 dark:border-slate-800/70">
                        <button
                          onClick={() => setStoryExpanded((p) => !p)}
                          className="flex w-full items-center justify-center gap-1.5 py-3 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                          {storyExpanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" /> Show less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" /> Show {otherStories.length - 3} more
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </InnerCard>
                </div>
              )}

              {/* Edition meta */}
              <EditionMeta edition={currentEdition} />
            </>
          )}
        </>
      )}

      {/* ── HISTORY TAB ───────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <HistoryList
          propertyId={propertyId}
          onSelectEdition={(id) => setSelectedEditionId(id)}
        />
      )}

      {/* Share modal (current edition) */}
      {showShare && currentEdition && (
        <ShareModal editionId={currentEdition.id} onClose={() => setShowShare(false)} />
      )}

      {/* Edition detail panel (history) */}
      {selectedEditionId && (
        <EditionDetailPanel
          editionId={selectedEditionId}
          propertyId={propertyId}
          onClose={() => setSelectedEditionId(null)}
        />
      )}
    </MobilePageContainer>
  );
}
