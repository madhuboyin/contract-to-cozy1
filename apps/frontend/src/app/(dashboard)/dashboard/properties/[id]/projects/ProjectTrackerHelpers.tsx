'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { ProjectStatus, ProjectMilestoneStatus, ProjectPaymentStatus, ProjectIssueSeverity, ProjectIssueStatus, ProjectChangeOrderStatus } from '@/types';
import { StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';

// ── Labels ─────────────────────────────────────────────────────────────────────

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  ROOF_REPLACEMENT: 'Roof Replacement', HVAC_REPLACEMENT: 'HVAC Replacement',
  HVAC_REPAIR: 'HVAC Repair', KITCHEN_REMODEL: 'Kitchen Remodel',
  BATHROOM_REMODEL: 'Bathroom Remodel', ELECTRICAL_PANEL: 'Electrical Panel',
  PLUMBING_REPIPING: 'Plumbing Repiping', WATER_HEATER: 'Water Heater',
  FOUNDATION_WORK: 'Foundation Work', WINDOW_REPLACEMENT: 'Window Replacement',
  FLOORING: 'Flooring', PAINTING_INTERIOR: 'Interior Painting',
  PAINTING_EXTERIOR: 'Exterior Painting', DECK_PATIO: 'Deck / Patio',
  ADDITION: 'Addition', SEWER_LINE: 'Sewer Line',
  SOLAR_INSTALLATION: 'Solar Installation', LANDSCAPING_MAJOR: 'Major Landscaping',
  GENERAL_REPAIR: 'General Repair', CUSTOM: 'Custom Project',
};

export const PROJECT_TYPE_OPTIONS = Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export const CHANGE_ORDER_CATEGORY_LABELS: Record<string, string> = {
  HOMEOWNER_REQUEST: 'Homeowner Request', UNFORESEEN_CONDITION: 'Unforeseen Condition',
  MATERIAL_SUBSTITUTION: 'Material Substitution', DESIGN_CHANGE: 'Design Change',
  ERROR_CORRECTION: 'Error Correction', OTHER: 'Other',
};

export const ISSUE_CATEGORY_LABELS: Record<string, string> = {
  QUALITY_CONCERN: 'Quality Concern', SCOPE_DISPUTE: 'Scope Dispute',
  TIMELINE_DISPUTE: 'Timeline Dispute', COMMUNICATION: 'Communication',
  SAFETY: 'Safety', DAMAGE: 'Damage', PAYMENT_DISPUTE: 'Payment Dispute', OTHER: 'Other',
};

// ── Formatters ─────────────────────────────────────────────────────────────────

export function fmtDate(dt?: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtMoney(cents?: number | null) {
  if (cents == null) return '—';
  return '$' + (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function fmtDelta(cents: number) {
  const sign = cents >= 0 ? '+' : '';
  return sign + fmtMoney(cents);
}

export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ── Status chips ───────────────────────────────────────────────────────────────

type Tone = 'good' | 'elevated' | 'danger' | 'info';

export function projectStatusTone(s: ProjectStatus): Tone {
  switch (s) {
    case 'COMPLETED': return 'good';
    case 'IN_PROGRESS': return 'info';
    case 'PAUSED': return 'elevated';
    case 'DISPUTED': return 'danger';
    default: return 'info';
  }
}

export function milestoneStatusTone(s: ProjectMilestoneStatus): Tone {
  switch (s) {
    case 'COMPLETE': return 'good';
    case 'IN_PROGRESS': return 'info';
    case 'DELAYED': return 'elevated';
    case 'DISPUTED': return 'danger';
    case 'BLOCKED': return 'danger';
    default: return 'info';
  }
}

export function paymentStatusTone(s: ProjectPaymentStatus): Tone {
  switch (s) {
    case 'PAID': return 'good';
    case 'DUE': return 'elevated';
    case 'OVERDUE': return 'danger';
    case 'DISPUTED': return 'danger';
    default: return 'info';
  }
}

export function issueSeverityTone(s: ProjectIssueSeverity): Tone {
  switch (s) {
    case 'BLOCKING': return 'danger';
    case 'MAJOR': return 'elevated';
    default: return 'info';
  }
}

export function issueStatusTone(s: ProjectIssueStatus): Tone {
  switch (s) {
    case 'RESOLVED': return 'good';
    case 'ESCALATED': return 'danger';
    case 'ACKNOWLEDGED': return 'elevated';
    default: return 'info';
  }
}

export function changeOrderStatusTone(s: ProjectChangeOrderStatus): Tone {
  switch (s) {
    case 'APPROVED': return 'good';
    case 'REJECTED': return 'danger';
    default: return 'elevated';
  }
}

// ── Project sub-nav ────────────────────────────────────────────────────────────

const NAV_TABS = [
  { label: 'Overview', suffix: '' },
  { label: 'Milestones', suffix: '/milestones' },
  { label: 'Payments', suffix: '/payments' },
  { label: 'Change Orders', suffix: '/change-orders' },
  { label: 'Log', suffix: '/log' },
  { label: 'Issues', suffix: '/issues' },
];

export function ProjectNav({ propertyId, projectId }: { propertyId: string; projectId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/properties/${propertyId}/projects/${projectId}`;

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-px">
      {NAV_TABS.map(({ label, suffix }) => {
        const href = `${base}${suffix}`;
        const isActive = suffix === ''
          ? pathname === href
          : pathname.startsWith(href);
        return (
          <Link
            key={label}
            href={href}
            className={cn(
              'shrink-0 px-3 py-2 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors whitespace-nowrap',
              isActive
                ? 'border-slate-800 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// ── KPI tile ───────────────────────────────────────────────────────────────────

export function KpiTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'danger' | 'warn' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className={cn('text-xl font-bold', tone === 'danger' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-900')}>
        {value}
      </p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Spinner ────────────────────────────────────────────────────────────────────

export function Spinner() {
  return (
    <div className="flex h-32 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-slate-600" />
    </div>
  );
}

// ── Error banner ───────────────────────────────────────────────────────────────

export function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{msg}</div>
  );
}
