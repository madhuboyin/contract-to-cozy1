'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { GuidanceIssueDomain, GuidanceSeverity } from '@/lib/api/guidanceApi';

// ---------------------------------------------------------------------------
// Domain label map
// ---------------------------------------------------------------------------

const DOMAIN_LABELS: Partial<Record<GuidanceIssueDomain, string>> = {
  SAFETY: 'Safety',
  MAINTENANCE: 'Maintenance',
  INSURANCE: 'Coverage',
  FINANCIAL: 'Financial',
  ASSET_LIFECYCLE: 'Systems',
  CLAIMS: 'Claims',
  WEATHER: 'Weather',
  NEIGHBORHOOD: 'Neighborhood',
  ENERGY: 'Energy',
  DOCUMENTATION: 'Documents',
  MARKET_VALUE: 'Market',
  COMPLIANCE: 'Compliance',
  OTHER: 'Other',
};

// Domain priority for display order (most home-critical first)
const PULSE_DOMAIN_ORDER: GuidanceIssueDomain[] = [
  'SAFETY',
  'MAINTENANCE',
  'INSURANCE',
  'FINANCIAL',
  'ASSET_LIFECYCLE',
  'WEATHER',
  'NEIGHBORHOOD',
  'ENERGY',
];

// ---------------------------------------------------------------------------
// Pulse row type + derivation
// ---------------------------------------------------------------------------

type PulseRow = {
  domain: GuidanceIssueDomain;
  label: string;
  signal: string;
  driver: string;
  implication: string;
  urgency: string | null;
  severity: GuidanceSeverity | null;
  href: string | null;
  ctaLabel: string | null;
};

function clampLine(value: string, max = 120): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function deriveSignal(action: GuidanceActionModel, label: string): string {
  const raw = action.explanation?.what?.trim() || action.title?.trim() || `${label} signal shifted`;
  return clampLine(raw, 84);
}

function deriveDriver(action: GuidanceActionModel): string {
  const raw =
    action.explanation?.why?.trim() ||
    action.subtitle?.trim() ||
    'Recent property signals moved this domain.';
  return clampLine(raw, 98);
}

function deriveImplication(action: GuidanceActionModel): string {
  const risk = action.explanation?.risk?.trim();
  if (risk) return clampLine(`Implication: ${risk}`, 112);

  if (action.costOfDelay && action.costOfDelay > 0) {
    return clampLine(
      `Implication: delay may add about $${Math.round(action.costOfDelay).toLocaleString()} in avoidable cost.`,
      112,
    );
  }

  if (action.coverageImpact === 'NOT_COVERED') {
    return 'Implication: current protection may not fully cover this exposure.';
  }
  if (action.coverageImpact === 'PARTIAL') {
    return 'Implication: coverage may only partially offset this risk.';
  }

  if (action.priorityGroup === 'IMMEDIATE') {
    return 'Implication: this could escalate if left unresolved this week.';
  }
  if (action.priorityGroup === 'UPCOMING') {
    return 'Implication: planning early should reduce next-month friction.';
  }

  const nextStep = action.nextStep?.label?.trim() || action.explanation?.nextStep?.trim();
  if (nextStep) {
    return clampLine(`Consider: ${nextStep}.`, 112);
  }

  return 'Implication: keep this domain on your weekly review radar.';
}

function deriveCtaLabel(action: GuidanceActionModel): string | null {
  if (!action.href) return null;
  if (action.priorityGroup === 'IMMEDIATE') return 'Review now';
  if (action.executionReadiness === 'NEEDS_CONTEXT') return 'Add context';
  return 'Open path';
}

function deriveUrgency(action: GuidanceActionModel): string | null {
  if (action.priorityGroup === 'IMMEDIATE') return 'Now';
  if (action.priorityGroup === 'UPCOMING') return 'Soon';
  if (action.severity === 'HIGH' || action.severity === 'CRITICAL') return 'Watch';
  return null;
}

/**
 * Derives one summary row per issue domain from top guidance actions.
 * Framed as cause -> implication to avoid passive status reporting.
 */
function derivePulseRows(actions: GuidanceActionModel[], maxRows = 3): PulseRow[] {
  // One representative action per domain (already sorted by priority from useGuidance)
  const domainMap = new Map<GuidanceIssueDomain, GuidanceActionModel>();
  for (const action of actions) {
    if (!domainMap.has(action.issueDomain)) {
      domainMap.set(action.issueDomain, action);
    }
  }

  const rows: PulseRow[] = [];

  // Fill in priority domain order first
  for (const domain of PULSE_DOMAIN_ORDER) {
    if (rows.length >= maxRows) break;
    const action = domainMap.get(domain);
    if (!action) continue;
    const label = DOMAIN_LABELS[domain] ?? domain;
    rows.push({
      domain,
      label,
      signal: deriveSignal(action, label),
      driver: deriveDriver(action),
      implication: deriveImplication(action),
      urgency: deriveUrgency(action),
      severity: action.severity,
      href: action.href,
      ctaLabel: deriveCtaLabel(action),
    });
  }

  // Fill remaining slots from any other active domains
  for (const [domain, action] of domainMap) {
    if (rows.length >= maxRows) break;
    if (PULSE_DOMAIN_ORDER.includes(domain)) continue;
    const label = DOMAIN_LABELS[domain] ?? domain;
    rows.push({
      domain,
      label,
      signal: deriveSignal(action, label),
      driver: deriveDriver(action),
      implication: deriveImplication(action),
      urgency: deriveUrgency(action),
      severity: action.severity,
      href: action.href,
      ctaLabel: deriveCtaLabel(action),
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Severity indicator
// ---------------------------------------------------------------------------

function pulseDotClass(severity: GuidanceSeverity | null): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'bg-rose-500';
  if (severity === 'MEDIUM') return 'bg-amber-400';
  if (severity === 'LOW') return 'bg-sky-400';
  return 'bg-emerald-400';
}

function pulseUrgencyClass(value: string): string {
  if (value === 'Now') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value === 'Soon') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

// ---------------------------------------------------------------------------
// Single pulse row
// ---------------------------------------------------------------------------

function PulseRowItem({ row }: { row: PulseRow }) {
  return (
    <article className="rounded-lg border border-border/70 bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', pulseDotClass(row.severity))} />
          <span className="text-[10px] font-medium tracking-normal text-muted-foreground/70">
            {row.label}
          </span>
        </div>
        {row.urgency ? (
          <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px] font-medium', pulseUrgencyClass(row.urgency))}>
            {row.urgency}
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 line-clamp-2 text-sm font-medium text-foreground">{row.signal}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">Driver:</span> {row.driver}
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.implication}</p>

      {row.href && row.ctaLabel ? (
        <Link
          href={row.href}
          className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {row.ctaLabel}
          <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// MorningPulseSection — Level 2, secondary visual weight
// ---------------------------------------------------------------------------

type MorningPulseSectionProps = {
  propertyId: string;
  /** Maximum domain rows to display. Defaults to 3 for compact scanning. */
  maxRows?: number;
};

export function MorningPulseSection({ propertyId, maxRows = 3 }: MorningPulseSectionProps) {
  const guidance = useGuidance(propertyId);

  const rows = useMemo(
    () => derivePulseRows(guidance.actions, maxRows),
    [guidance.actions, maxRows],
  );

  if (guidance.isLoading) {
    return (
      <section className="rounded-xl border border-border/60 bg-background px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium tracking-normal text-muted-foreground/70">
            Morning pulse
          </p>
          <p className="text-[11px] text-muted-foreground/75">Loading…</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="h-[108px] animate-pulse rounded-lg border border-border/60 bg-muted/20" />
          <div className="h-[108px] animate-pulse rounded-lg border border-border/60 bg-muted/20" />
        </div>
      </section>
    );
  }

  if (guidance.isError && rows.length === 0) {
    return (
      <section className="rounded-xl border border-border/60 bg-background px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div className="space-y-1">
          <p className="text-[10px] font-medium tracking-normal text-muted-foreground/70">
            Morning pulse
          </p>
          <p className="text-xs text-muted-foreground">
            Morning Pulse is temporarily unavailable. Review status board signals instead.
          </p>
        </div>
        <Link
          href={`/dashboard/properties/${propertyId}/status-board`}
          className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Open status board
          <ArrowRight className="h-3 w-3" />
        </Link>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-border/60 bg-background px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div className="space-y-1">
          <p className="text-[10px] font-medium tracking-normal text-muted-foreground/70">
            Morning pulse
          </p>
          <p className="text-xs text-muted-foreground">
            No notable movement this morning. Core domains look steady.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border/60 bg-background px-3.5 py-3 sm:px-4 sm:py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium tracking-normal text-muted-foreground/70 ">
          Morning pulse
        </p>
        <p className="text-[11px] text-muted-foreground/75">
          {rows.length} active domain{rows.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <PulseRowItem key={row.domain} row={row} />
        ))}
      </div>
    </section>
  );
}
