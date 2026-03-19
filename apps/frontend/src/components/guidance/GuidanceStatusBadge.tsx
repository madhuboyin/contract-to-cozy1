'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  GuidanceExecutionReadiness,
  GuidanceSeverity,
  GuidanceStepStatus,
} from '@/lib/api/guidanceApi';
import { formatReadinessLabel, formatStepStatusLabel } from '@/features/guidance/utils/guidanceDisplay';

type GuidanceStatusBadgeProps =
  | {
      kind: 'readiness';
      value: GuidanceExecutionReadiness;
      className?: string;
    }
  | {
      kind: 'step';
      value: GuidanceStepStatus;
      className?: string;
    }
  | {
      kind: 'severity';
      value: GuidanceSeverity | null;
      className?: string;
    };

function readinessClass(value: GuidanceExecutionReadiness): string {
  if (value === 'READY') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'NOT_READY') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value === 'NEEDS_CONTEXT') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value === 'TRACKING_ONLY') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function stepClass(value: GuidanceStepStatus): string {
  if (value === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'BLOCKED') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value === 'IN_PROGRESS') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (value === 'SKIPPED') return 'border-slate-200 bg-slate-100 text-slate-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function severityClass(value: GuidanceSeverity | null): string {
  if (value === 'CRITICAL' || value === 'HIGH') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value === 'LOW' || value === 'INFO') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

export function GuidanceStatusBadge(props: GuidanceStatusBadgeProps) {
  if (props.kind === 'readiness') {
    return (
      <Badge variant="outline" className={cn(readinessClass(props.value), props.className)}>
        {formatReadinessLabel(props.value)}
      </Badge>
    );
  }

  if (props.kind === 'step') {
    return (
      <Badge variant="outline" className={cn(stepClass(props.value), props.className)}>
        {formatStepStatusLabel(props.value)}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn(severityClass(props.value), props.className)}>
      {props.value ? props.value : 'Severity Unknown'}
    </Badge>
  );
}
