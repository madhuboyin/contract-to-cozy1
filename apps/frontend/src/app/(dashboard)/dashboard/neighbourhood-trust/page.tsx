'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BadgeCheck,
  Star,
  Users,
  Briefcase,
  ThumbsUp,
  Clock,
  CheckCircle2,
  Loader2,
  X,
  Zap,
  Droplets,
  Wrench,
  Home,
  Shield,
  Hammer,
} from 'lucide-react';

import { api } from '@/lib/api/client';
import {
  BottomSafeAreaReserve,
  CompactEntityRow,
  EmptyStateCard,
  MobileCard,
  MobileFilterSurface,
  MobilePageIntro,
  MobileToolWorkspace,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { NeighbourhoodProvider, NeighbourhoodFeedEntry } from '@/types';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatCategory(cat: string) {
  return cat.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          style={{ width: size, height: size }}
          className={n <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}
        />
      ))}
    </span>
  );
}

function categoryIcon(cat: string) {
  const map: Record<string, React.ReactNode> = {
    HVAC: <Zap className="h-3.5 w-3.5" />,
    PLUMBING: <Droplets className="h-3.5 w-3.5" />,
    ELECTRICAL: <Zap className="h-3.5 w-3.5" />,
    HANDYMAN: <Hammer className="h-3.5 w-3.5" />,
    INSPECTION: <Shield className="h-3.5 w-3.5" />,
    ROOFING: <Home className="h-3.5 w-3.5" />,
  };
  return map[cat] ?? <Wrench className="h-3.5 w-3.5" />;
}

const TAG_LABELS: Record<string, string> = {
  QUALITY_WORK: 'Quality work',
  ON_TIME: 'On time',
  FAIR_PRICE: 'Fair price',
  CLEAN_SITE: 'Clean site',
  CLEAR_COMMUNICATION: 'Clear comms',
  HONEST_ESTIMATE: 'Honest estimate',
};

const ENDORSEMENT_TAGS = Object.keys(TAG_LABELS);

type Tab = 'contractors' | 'feed';

// ── Endorsement Modal ─────────────────────────────────────────────────────────

function EndorseModal({
  bookingId,
  providerName,
  onClose,
  onSuccess,
}: {
  bookingId: string;
  providerName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [wouldHireAgain, setWouldHireAgain] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      api.submitNeighbourhoodEndorsement(bookingId, {
        wouldHireAgain,
        highlightTags: selectedTags,
        anonymousToNeighbors: true,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
  });

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Endorse {providerName}</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          Your endorsement is anonymous — only your zip code is visible to neighbours.
        </p>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setWouldHireAgain(true)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
              wouldHireAgain
                ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <ThumbsUp className="h-4 w-4" /> Would hire again
          </button>
          <button
            onClick={() => setWouldHireAgain(false)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
              !wouldHireAgain
                ? 'border-rose-400 bg-rose-50 text-rose-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            Would not hire again
          </button>
        </div>

        <p className="mb-2 text-xs font-medium text-slate-700">Highlights (optional)</p>
        <div className="mb-5 flex flex-wrap gap-2">
          {ENDORSEMENT_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedTags.includes(tag)
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {TAG_LABELS[tag]}
            </button>
          ))}
        </div>

        <Button
          className="w-full"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
          ) : (
            'Submit endorsement'
          )}
        </Button>

        {mutation.isError && (
          <p className="mt-2 text-center text-xs text-rose-600">
            {(mutation.error as any)?.message || 'Something went wrong. Try again.'}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Provider Card ─────────────────────────────────────────────────────────────

function ProviderCard({ item }: { item: NeighbourhoodProvider }) {
  const { provider, trustProfile } = item;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-900">{provider.businessName}</p>
            {provider.insuranceVerified && (
              <span title="Insurance verified">
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
              </span>
            )}
            {provider.licenseVerified && (
              <span title="License verified">
                <BadgeCheck className="h-3.5 w-3.5 text-blue-500" />
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {provider.serviceCategories.slice(0, 3).map((cat) => (
              <span
                key={cat}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
              >
                {categoryIcon(cat)} {formatCategory(cat)}
              </span>
            ))}
          </div>
          {provider.description && (
            <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{provider.description}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="text-xl font-bold text-slate-900">
            {trustProfile.avgRating.toFixed(1)}
          </span>
          <StarRow rating={trustProfile.avgRating} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-slate-400" />
          <strong className="text-slate-700">{trustProfile.totalJobs}</strong> neighbour job{trustProfile.totalJobs !== 1 ? 's' : ''}
        </span>
        {trustProfile.verifiedJobs > 0 && (
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            {trustProfile.verifiedJobs} verified
          </span>
        )}
        {provider.yearsInBusiness && (
          <span className="flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5 text-slate-400" />
            {provider.yearsInBusiness} yr{provider.yearsInBusiness !== 1 ? 's' : ''} in business
          </span>
        )}
        {trustProfile.lastJobAt && (
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            Last job {formatDate(trustProfile.lastJobAt)}
          </span>
        )}
      </div>

      {trustProfile.avgQualityRating != null && (
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5 text-center text-[11px]">
          {[
            { label: 'Quality', value: trustProfile.avgQualityRating },
            { label: 'Comms', value: trustProfile.avgCommunicationRating },
            { label: 'Value', value: trustProfile.avgValueRating },
          ].map(({ label, value }) =>
            value != null ? (
              <div key={label}>
                <p className="font-semibold text-slate-800">{value.toFixed(1)}</p>
                <p className="text-slate-500">{label}</p>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// ── Feed Entry ────────────────────────────────────────────────────────────────

function FeedEntry({ entry }: { entry: NeighbourhoodFeedEntry }) {
  const isEndorsement = entry.entryType === 'ENDORSEMENT_ADDED';
  return (
    <div className="flex items-start gap-3 py-3">
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isEndorsement ? 'bg-emerald-100' : 'bg-blue-100'
        }`}
      >
        {isEndorsement ? (
          <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800">
          <span className="font-medium">{entry.providerBusinessName}</span>
          {isEndorsement ? ' was endorsed by a neighbour' : ' completed a job nearby'}
          {' · '}
          <span className="text-slate-500">{formatCategory(entry.serviceCategory)}</span>
        </p>
        {entry.starRating != null && (
          <div className="mt-0.5">
            <StarRow rating={entry.starRating} size={12} />
          </div>
        )}
        {entry.highlightTags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {entry.highlightTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
              >
                {TAG_LABELS[tag] ?? tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(entry.createdAt)}</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NeighbourhoodTrustPage() {
  const [tab, setTab] = useState<Tab>('contractors');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [endorseModal, setEndorseModal] = useState<{ bookingId: string; providerName: string } | null>(null);

  const zipQuery = useQuery({
    queryKey: ['neighbourhood-zip'],
    queryFn: () => api.getNeighbourhoodZipInfo(),
  });

  const zipInfo = zipQuery.data?.success ? zipQuery.data.data : null;

  const providersQuery = useQuery({
    queryKey: ['neighbourhood-providers', categoryFilter],
    queryFn: () => api.getNeighbourhoodProviders({ category: categoryFilter || undefined, limit: 30 }),
    enabled: tab === 'contractors',
  });

  const feedQuery = useQuery({
    queryKey: ['neighbourhood-feed'],
    queryFn: () => api.getNeighbourhoodFeed({ limit: 40 }),
    enabled: tab === 'feed',
  });

  const providers: NeighbourhoodProvider[] = providersQuery.data?.success
    ? providersQuery.data.data.providers
    : [];

  const feed: NeighbourhoodFeedEntry[] = feedQuery.data?.success
    ? feedQuery.data.data.feed
    : [];

  const SERVICE_CATEGORIES = [
    '', 'PLUMBING', 'HVAC', 'ELECTRICAL', 'HANDYMAN',
    'INSPECTION', 'LANDSCAPING', 'CLEANING', 'PEST_CONTROL',
  ];

  return (
    <>
      <MobileToolWorkspace
        intro={
          <MobilePageIntro
            title="Neighbours"
            subtitle={
              zipInfo
                ? `Trusted contractors in ${zipInfo.city}, ${zipInfo.zipCode}`
                : 'Trusted contractors in your neighbourhood'
            }
          />
        }
        summary={
          zipInfo ? (
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center text-xs">
              <div>
                <p className="text-lg font-bold text-slate-900">{zipInfo.stats.activeProviders}</p>
                <p className="text-slate-500">Active contractors</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{zipInfo.stats.totalEndorsements}</p>
                <p className="text-slate-500">Endorsements</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{zipInfo.stats.recentJobs}</p>
                <p className="text-slate-500">Jobs this month</p>
              </div>
            </div>
          ) : null
        }
        filters={
          <MobileFilterSurface>
            <div className="flex gap-1.5">
              {(['contractors', 'feed'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors ${
                    tab === t
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t === 'contractors' ? 'Top Contractors' : 'Activity Feed'}
                </button>
              ))}
            </div>
            {tab === 'contractors' && (
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {SERVICE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      categoryFilter === cat
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {cat ? formatCategory(cat) : 'All'}
                  </button>
                ))}
              </div>
            )}
          </MobileFilterSurface>
        }
      >
        {/* ── Contractors tab ── */}
        {tab === 'contractors' && (
          <>
            {providersQuery.isLoading && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}
            {!providersQuery.isLoading && providers.length === 0 && (
              <EmptyStateCard
                title="No contractors found yet"
                description="As neighbours complete bookings and leave endorsements, trusted contractors will appear here."
              />
            )}
            <div className="space-y-3">
              {providers.map((item) => (
                <ProviderCard key={item.provider.id} item={item} />
              ))}
            </div>
          </>
        )}

        {/* ── Feed tab ── */}
        {tab === 'feed' && (
          <MobileCard>
            {feedQuery.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}
            {!feedQuery.isLoading && feed.length === 0 && (
              <EmptyStateCard
                title="No recent activity"
                description="When neighbours complete jobs and leave endorsements, activity will appear here."
              />
            )}
            <div className="divide-y divide-slate-100">
              {feed.map((entry) => (
                <FeedEntry key={entry.id} entry={entry} />
              ))}
            </div>
          </MobileCard>
        )}

        <BottomSafeAreaReserve />
      </MobileToolWorkspace>

      {endorseModal && (
        <EndorseModal
          bookingId={endorseModal.bookingId}
          providerName={endorseModal.providerName}
          onClose={() => setEndorseModal(null)}
          onSuccess={() => {
            providersQuery.refetch();
            feedQuery.refetch();
            zipQuery.refetch();
          }}
        />
      )}
    </>
  );
}
