'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
  insight: string;
  severity: GuidanceSeverity | null;
  href: string | null;
};

/**
 * Derives one summary row per issue domain from the top guidance actions.
 * Prefers domains in PULSE_DOMAIN_ORDER, fills remaining slots from others.
 * Only includes rows that have a meaningful insight string.
 */
function derivePulseRows(actions: GuidanceActionModel[], maxRows = 4): PulseRow[] {
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
    const insight = action.explanation?.why?.trim() || action.subtitle?.trim() || '';
    if (!insight) continue;
    rows.push({
      domain,
      label: DOMAIN_LABELS[domain] ?? domain,
      insight,
      severity: action.severity,
      href: action.href,
    });
  }

  // Fill remaining slots from any other active domains
  for (const [domain, action] of domainMap) {
    if (rows.length >= maxRows) break;
    if (PULSE_DOMAIN_ORDER.includes(domain)) continue;
    const insight = action.explanation?.why?.trim() || action.subtitle?.trim() || '';
    if (!insight) continue;
    rows.push({
      domain,
      label: DOMAIN_LABELS[domain] ?? domain,
      insight,
      severity: action.severity,
      href: action.href,
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

// ---------------------------------------------------------------------------
// Single pulse row
// ---------------------------------------------------------------------------

function PulseRowItem({ row }: { row: PulseRow }) {
  return (
    <div className="flex items-center gap-3 py-2.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border">
      {/* Severity dot */}
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', pulseDotClass(row.severity))}
      />

      {/* Domain label — fixed width, scannable */}
      <span className="w-[76px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {row.label}
      </span>

      {/* Insight text — fills remaining space, single line */}
      <p className="min-w-0 flex-1 truncate text-xs text-foreground">{row.insight}</p>

      {/* Optional CTA arrow */}
      {row.href ? (
        <Link
          href={row.href}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Go to ${row.label} action`}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MorningPulseSection — exported
// ---------------------------------------------------------------------------

type MorningPulseSectionProps = {
  propertyId: string;
  /** Maximum domain rows to display. Defaults to 4. */
  maxRows?: number;
};

export function MorningPulseSection({ propertyId, maxRows = 4 }: MorningPulseSectionProps) {
  const guidance = useGuidance(propertyId);

  const rows = useMemo(
    () => derivePulseRows(guidance.actions, maxRows),
    [guidance.actions, maxRows],
  );

  // Don't render during load or when no signal insights are available
  if (guidance.isLoading || rows.length === 0) return null;

  return (
    <Card className="border-border">
      <CardContent className="px-4 py-3.5">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Home signals
        </p>
        <div>
          {rows.map((row) => (
            <PulseRowItem key={row.domain} row={row} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
