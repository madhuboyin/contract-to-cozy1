'use client';

import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { track } from '@/lib/analytics/events';
import { useConsent } from '@/lib/consent';

const LCP_BUDGET_MS = 2500;

export function WebVitalsTracker() {
  const pathname = usePathname();
  const { analytics } = useConsent();

  useReportWebVitals((metric) => {
    if (!analytics) return;

    if (!['CLS', 'FCP', 'INP', 'LCP', 'TTFB'].includes(metric.name)) return;

    track('web_vital_recorded', {
      metric: metric.name as 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB',
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      route: pathname || 'unknown',
      withinBudget:
        metric.name === 'LCP' ? metric.value <= LCP_BUDGET_MS : undefined,
    });
  });

  return null;
}

