'use client';

// apps/frontend/src/components/vault/VaultView.tsx
// Read-only public "Seller's Vault" — no dashboard navigation.
// Color palette: Slate (structure), Emerald (verified/health), Amber/Gold (premium).

import React, { useState } from 'react';
import { format, differenceInYears, parseISO } from 'date-fns';
import {
  Award,
  CalendarCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  FlameIcon,
  Home,
  Loader2,
  Lock,
  Package,
  ShieldCheck,
  Star,
  Wrench,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { VaultAsset, VaultData, VaultServiceEntry } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Badge catalogue — maps the badge key stored in unlockedBadges[] to display
// ─────────────────────────────────────────────────────────────────────────────
const BADGE_CATALOGUE: Record<string, { label: string; description: string; icon: React.ReactNode }> = {
  ELITE_VERIFIER: {
    label: 'Elite Verifier',
    description: 'All major assets documented and verified',
    icon: <ShieldCheck className="h-5 w-5 text-emerald-600" />,
  },
  RESILIENCE_PRO: {
    label: 'Resilience Pro',
    description: 'Sump pump backup and flood protection confirmed',
    icon: <ShieldCheck className="h-5 w-5 text-blue-600" />,
  },
  HVAC_HERO: {
    label: 'HVAC Hero',
    description: 'HVAC system serviced and up to date',
    icon: <Wrench className="h-5 w-5 text-amber-600" />,
  },
  ROOF_GUARDIAN: {
    label: 'Roof Guardian',
    description: 'Roof inspected and maintained',
    icon: <Home className="h-5 w-5 text-slate-600" />,
  },
  INSURANCE_ACE: {
    label: 'Insurance Ace',
    description: 'Insurance coverage fully documented',
    icon: <ShieldCheck className="h-5 w-5 text-violet-600" />,
  },
  STREAK_MASTER: {
    label: 'Streak Master',
    description: '7+ consecutive days of maintenance activity',
    icon: <FlameIcon className="h-5 w-5 text-orange-500" />,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function categoryLabel(cat: string): string {
  const MAP: Record<string, string> = {
    HVAC: 'HVAC',
    PLUMBING: 'Plumbing',
    ELECTRICAL: 'Electrical',
    ROOFING: 'Roofing',
    INSPECTION: 'Inspection',
    HANDYMAN: 'Handyman',
    LANDSCAPING: 'Landscaping',
    CLEANING: 'Cleaning',
    PEST_CONTROL: 'Pest Control',
    APPLIANCE: 'Appliance',
    ROOF_EXTERIOR: 'Roof / Exterior',
  };
  return MAP[cat] ?? cat.replace(/_/g, ' ');
}

function assetAge(asset: VaultAsset): string | null {
  const base = asset.installedOn || asset.purchasedOn;
  if (!base) return null;
  const years = differenceInYears(new Date(), parseISO(base));
  if (years === 0) return 'Installed this year';
  return `${years} yr${years === 1 ? '' : 's'} old`;
}

function healthLabel(score: number): { text: string; cls: string } {
  if (score >= 85) return { text: 'Excellent', cls: 'text-emerald-600' };
  if (score >= 70) return { text: 'Good', cls: 'text-blue-600' };
  if (score >= 50) return { text: 'Fair', cls: 'text-amber-600' };
  return { text: 'Needs Attention', cls: 'text-red-600' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function PasswordGate({
  propertyId,
  onUnlock,
}: {
  propertyId: string;
  onUnlock: (data: VaultData) => void;
}) {
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await api.getVaultData(propertyId, password.trim());
      if (res.success && res.data) {
        onUnlock(res.data);
      } else {
        setError(res.message || 'Invalid password. Please try again.');
      }
    } catch {
      setError('Unable to access vault. Please check your password and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      {/* Branding */}
      <div className="mb-8 flex items-center gap-2">
        <div className="rounded-lg bg-emerald-600 p-2">
          <Home className="h-6 w-6 text-white" />
        </div>
        <span className="text-xl font-bold text-slate-800">Contract to Cozy</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-slate-100 p-4">
            <Lock className="h-8 w-8 text-slate-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Seller&apos;s Vault</h1>
          <p className="text-sm text-slate-500">
            This property&apos;s proof-of-care report is password protected.
            <br />
            Enter the access code provided by the homeowner.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter access password"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 pr-12 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="h-5 w-5" /> Access Vault
              </>
            )}
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Contract to Cozy · Secure Property Sharing
      </p>
    </div>
  );
}

function HeroSection({ data }: { data: VaultData }) {
  const { overview, gamification } = data;
  const { text: hlLabel, cls: hlCls } = healthLabel(overview.healthScore);
  const isMaintenanceAlpha = overview.healthScore >= 80;

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-10 text-white sm:px-10">
      <div className="mx-auto max-w-4xl">
        {/* Address + meta */}
        <div className="mb-6">
          <div className="mb-1 flex items-center gap-2 text-slate-400 text-sm">
            <Home className="h-4 w-4" />
            <span>Verified Property</span>
          </div>
          <h1 className="text-3xl font-bold leading-tight text-white">
            {overview.address}
          </h1>
          <p className="mt-1 text-slate-300">
            {overview.city}, {overview.state} {overview.zipCode}
            {overview.yearBuilt && ` · Built ${overview.yearBuilt}`}
            {overview.propertySize && ` · ${overview.propertySize.toLocaleString()} sq ft`}
          </p>
        </div>

        {/* Health score + badge row */}
        <div className="flex flex-wrap items-center gap-6">
          {/* Score ring */}
          <div className="flex flex-col items-center rounded-xl border border-emerald-500/30 bg-slate-700/50 px-6 py-4">
            <span className="text-5xl font-black text-emerald-400">
              {overview.healthScore}
            </span>
            <span className="text-xs font-medium text-slate-400">out of 100</span>
            <span className={`mt-1 text-sm font-semibold ${hlCls}`}>{hlLabel}</span>
          </div>

          <div className="space-y-2">
            {/* Maintenance Alpha badge */}
            {isMaintenanceAlpha && (
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-1.5">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">Maintenance Alpha</span>
                <span className="text-xs text-amber-400/70">Premium Care Score</span>
              </div>
            )}

            {/* Streak */}
            {gamification.longestStreak > 0 && (
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-1.5">
                <FlameIcon className="h-4 w-4 text-orange-400" />
                <span className="text-sm text-orange-300">
                  {gamification.longestStreak}-day best streak
                </span>
              </div>
            )}

            {/* Verified assets count */}
            {data.verifiedAssets.length > 0 && (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-300">
                  {data.verifiedAssets.length} verified asset
                  {data.verifiedAssets.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BadgesSection({ badges }: { badges: string[] }) {
  if (badges.length === 0) return null;

  return (
    <section className="border-b border-slate-100 bg-slate-50 px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
          <Award className="h-5 w-5 text-amber-500" />
          Earned Achievements
        </h2>
        <div className="flex flex-wrap gap-3">
          {badges.map((key) => {
            const meta = BADGE_CATALOGUE[key];
            if (!meta) return null;
            return (
              <div
                key={key}
                title={meta.description}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                {meta.icon}
                <div>
                  <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                  <p className="text-xs text-slate-500">{meta.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AssetCard({ asset }: { asset: VaultAsset }) {
  const age = assetAge(asset);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{asset.name}</p>
          <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {categoryLabel(asset.category)}
          </span>
        </div>
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
      </div>

      <dl className="space-y-1 text-sm text-slate-600">
        {asset.manufacturer && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">Brand</dt>
            <dd className="font-medium text-slate-800">{asset.manufacturer}</dd>
          </div>
        )}
        {asset.modelNumber && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">Model</dt>
            <dd className="font-medium text-slate-800 text-right">{asset.modelNumber}</dd>
          </div>
        )}
        {asset.condition && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">Condition</dt>
            <dd className="font-medium text-slate-800">{asset.condition}</dd>
          </div>
        )}
        {age && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">Age</dt>
            <dd className="font-medium text-slate-800">{age}</dd>
          </div>
        )}
        {asset.expectedExpiryDate && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">Est. lifespan end</dt>
            <dd className="font-medium text-slate-800">
              {format(parseISO(asset.expectedExpiryDate), 'MMM yyyy')}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function AssetsSection({ assets }: { assets: VaultAsset[] }) {
  if (assets.length === 0) return null;

  return (
    <section className="border-b border-slate-100 px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-800">
          <Package className="h-5 w-5 text-slate-600" />
          Digital Transfer of Knowledge
        </h2>
        <p className="mb-6 text-sm text-slate-500">
          Verified equipment the new owner will inherit — confirmed brand, model, and age.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TimelineEntry({ entry, isLast }: { entry: VaultServiceEntry; isLast: boolean }) {
  const date = entry.completedAt ? parseISO(entry.completedAt) : null;

  return (
    <div className="relative flex gap-4">
      {/* Vertical line */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-emerald-500 bg-white">
          <CalendarCheck className="h-4 w-4 text-emerald-600" />
        </div>
        {!isLast && <div className="mt-1 w-0.5 grow bg-slate-200" />}
      </div>

      {/* Content */}
      <div className={`pb-6 ${isLast ? '' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            {categoryLabel(entry.category)}
          </span>
          {date && (
            <span className="text-xs text-slate-400">{format(date, 'MMM d, yyyy')}</span>
          )}
          {entry.finalPrice && (
            <span className="text-xs text-slate-400">· ${Number(entry.finalPrice).toFixed(0)}</span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-slate-800">{entry.description}</p>
        {entry.providerBusinessName && (
          <p className="mt-0.5 text-xs text-slate-500">by {entry.providerBusinessName}</p>
        )}
      </div>
    </div>
  );
}

function ServiceTimelineSection({ timeline }: { timeline: VaultServiceEntry[] }) {
  if (timeline.length === 0) {
    return (
      <section className="px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-800">
            <Wrench className="h-5 w-5 text-slate-600" />
            Professional Service History
          </h2>
          <p className="text-sm text-slate-400">No completed service visits on record yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-800">
          <Wrench className="h-5 w-5 text-slate-600" />
          Professional Service History
        </h2>
        <p className="mb-6 text-sm text-slate-500">
          Chronological log of every verified professional service visit.
        </p>
        <div>
          {timeline.map((entry, i) => (
            <TimelineEntry key={entry.id} entry={entry} isLast={i === timeline.length - 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function VaultView({ propertyId }: { propertyId: string }) {
  const [vaultData, setVaultData] = useState<VaultData | null>(null);

  if (!vaultData) {
    return <PasswordGate propertyId={propertyId} onUnlock={setVaultData} />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="bg-slate-900 px-6 py-3 sm:px-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded bg-emerald-600 p-1">
              <Home className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">Contract to Cozy</span>
            <span className="text-slate-500">·</span>
            <span className="text-sm text-slate-400">Seller&apos;s Vault</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Read-only · Verified{' '}
            {format(new Date(), 'MMM d, yyyy')}
          </div>
        </div>
      </div>

      {/* Hero */}
      <HeroSection data={vaultData} />

      {/* Badges */}
      <BadgesSection badges={vaultData.gamification.unlockedBadges} />

      {/* Verified assets */}
      <AssetsSection assets={vaultData.verifiedAssets} />

      {/* Service timeline */}
      <ServiceTimelineSection timeline={vaultData.serviceTimeline} />

      {/* Footer */}
      <footer className="bg-slate-900 px-6 py-6 text-center text-xs text-slate-500 sm:px-10">
        <p>
          This report was generated by Contract to Cozy and reflects verified data as of{' '}
          {format(new Date(), 'MMMM d, yyyy')}.
        </p>
        <p className="mt-1">
          All assets marked ✓ have been confirmed by the homeowner or scanned via OCR.
        </p>
      </footer>
    </div>
  );
}
