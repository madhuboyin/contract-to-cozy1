'use client';

import Link from 'next/link';

type AhaHeroProps = {
  propertyLabel: string;
  isReturningVisitor: boolean;
  showSpotlight?: boolean;
  title: string;
  subtitle: string;
  briefLabel: string;
  briefValue: string;
  briefDetail: string;
  doNowLabel: string;
  waitRiskLabel: string;
  ctaHref: string;
  ctaLabel: string;
  onCtaClick?: () => void;
  etaLabel: string;
  impactLabel: string;
  confidenceLabel: string;
  feed: string[];
  checkInStreak?: number;
  equityGainCents?: number | null;
  appraisedValueCents?: number | null;
  purchasePriceCents?: number | null;
  homeScore?: number | null;
  financialScore?: number | null;
  financialScoreLoading?: boolean;
  criticalTaskCount?: number;
  criticalTaskCountLoading?: boolean;
};

function formatCurrency(cents?: number | null): string {
  const safe = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(safe / 100);
}

function formatDisplayDate() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date());
}

function MiniStat({
  value,
  label,
  color,
  loading = false,
}: {
  value: string | number | null;
  label: string;
  color: 'amber' | 'teal' | 'red';
  loading?: boolean;
}) {
  const colorMap = {
    amber: 'text-amber-400',
    teal: 'text-[#1DBFAA]',
    red: 'text-red-400',
  };

  return (
    <div className="rounded-lg bg-white/[0.06] px-3 py-2">
      <div className={`text-base font-semibold ${colorMap[color]}`}>
        {loading ? (
          <>
            <span aria-hidden="true" className="block h-5 w-12 animate-pulse rounded bg-white/20" />
            <span className="sr-only">Loading {label}</span>
          </>
        ) : (
          value ?? 'N/A'
        )}
      </div>
      <div className="mt-0.5 text-[10px] text-[#6B8499]">{label}</div>
    </div>
  );
}

export default function AhaHero({
  propertyLabel,
  isReturningVisitor,
  title,
  subtitle,
  ctaHref,
  ctaLabel,
  onCtaClick,
  etaLabel,
  impactLabel,
  confidenceLabel,
  feed: _feed,
  checkInStreak = 0,
  equityGainCents = null,
  appraisedValueCents = null,
  purchasePriceCents = null,
  homeScore = null,
  financialScore = null,
  financialScoreLoading = false,
  criticalTaskCount = 0,
  criticalTaskCountLoading = false,
}: AhaHeroProps) {
  const formattedDate = formatDisplayDate();
  const chips = [etaLabel, impactLabel, confidenceLabel].filter(Boolean);
  const safeStreak = Math.max(0, Number(checkInStreak || 0));
  const showEquityBlock =
    typeof equityGainCents === 'number' &&
    equityGainCents > 0 &&
    typeof appraisedValueCents === 'number' &&
    appraisedValueCents > 0 &&
    typeof purchasePriceCents === 'number' &&
    purchasePriceCents > 0;

  return (
    <section className="relative overflow-hidden rounded-2xl bg-[#0f1f2e] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-[#6ECFA8]">
          {formattedDate} · {isReturningVisitor ? 'Morning Home Pulse' : 'Personalized Home Brief'}
        </span>
        {safeStreak > 0 && (
          <div className="shrink-0 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1">
            <span className="text-xs font-medium text-amber-400">🔥 {safeStreak}-day streak</span>
          </div>
        )}
      </div>

      {showEquityBlock && (
        <div className="mb-4 flex items-center gap-4 rounded-xl border border-[#1DBFAA]/25 bg-[#1DBFAA]/10 p-4">
          <div>
            <div className="text-xl font-semibold text-[#1DBFAA]">+{formatCurrency(equityGainCents)}</div>
            <div className="mt-0.5 text-xs text-[#6ECFA8]">
              Equity gain since purchase · {formatCurrency(appraisedValueCents)} appraised vs{' '}
              {formatCurrency(purchasePriceCents)} paid
            </div>
          </div>
        </div>
      )}

      <h2 className="mb-2 text-2xl font-medium leading-snug text-white">{title}</h2>
      <p id="hero-risk-subheadline" className="mb-4 text-sm leading-relaxed text-[#8BA6BE]">
        {subtitle} <span className="text-[#6B8499]">For {propertyLabel}.</span>
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          href={ctaHref}
          onClick={onCtaClick}
          aria-describedby="hero-risk-subheadline"
          className="inline-flex items-center rounded-full bg-[#1DBFAA] px-5 py-2 text-sm font-medium text-[#0f1f2e] transition-colors hover:bg-[#19A898]"
        >
          {ctaLabel} →
        </Link>
        {chips.map((chip) => (
          <span key={chip} className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-[#8BA6BE]">
            {chip}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <MiniStat value={homeScore !== null ? Math.round(homeScore) : 'N/A'} label="HomeScore" color="amber" />
        <MiniStat
          value={financialScore !== null ? Math.round(financialScore) : null}
          label="Financial"
          color="teal"
          loading={financialScoreLoading}
        />
        <MiniStat
          value={`${criticalTaskCount} critical`}
          label="Spring tasks"
          color="red"
          loading={criticalTaskCountLoading}
        />
      </div>
    </section>
  );
}
