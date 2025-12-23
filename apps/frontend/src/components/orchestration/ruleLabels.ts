// apps/frontend/src/components/orchestration/ruleLabels.ts
export const RULE_LABELS: Record<
  string,
  {
    label: string;
    description?: string;
  }
> = {
  RISK_ACTIONABLE: {
    label: 'Risk severity requires attention',
  },
  CHECKLIST_ACTIONABLE: {
    label: 'Maintenance task is overdue or unscheduled',
  },
  COVERAGE_AWARE_CTA: {
    label: 'Coverage detected and CTA adjusted',
  },
  BOOKING_SUPPRESSION: {
    label: 'Action suppressed due to existing booking',
  },
  RISK_INFER_SERVICE_CATEGORY: {
    label: 'Service category inferred from asset',
  },
  SUPPRESSION_FINAL: {
    label: 'Final suppression decision',
  },
};
