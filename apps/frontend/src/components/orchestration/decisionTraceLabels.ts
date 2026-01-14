// components/orchestration/decisionTraceLabels.ts

export const TRACE_COPY = {
  header: {
    shown: 'Why you’re seeing this',
    suppressed: 'Why this action is hidden',
  },
  sectionTitle: 'How we decided this',
  learnWhy: 'See how this was decided',
  tooltip: {
    title: 'How this decision was made',
    body:
      'We evaluate several factors before showing an action—including the severity of the issue, whether it’s already covered by insurance or a warranty, and whether related work is already scheduled. This explanation shows the checks we performed and how they led to the final decision.',
  },
};

// Rule labels (single source of truth)
export const RULE_LABELS: Record<string, { label: string; description?: string }> = {
  // Actionability
  RISK_ACTIONABLE: { label: 'This issue needs attention' },
  CHECKLIST_ACTIONABLE: { label: 'This maintenance task needs attention' },
  ACTION_REQUIRED: { label: 'This item requires attention' },

  // Identification / inference
  RISK_INFER_ASSET_KEY: { label: 'We identified the part of your home involved' },
  RISK_INFER_SERVICE_CATEGORY: { label: 'We identified the type of service needed' },

  // Age / condition
  AGE_EVALUATION: { label: 'We evaluated system age and expected lifespan' },

  // Coverage checks
  COVERAGE_CHECK: { label: 'We checked your warranties and insurance' },
  COVERAGE_MATCHING: { label: 'We checked your warranties and insurance' },
  COVERAGE_AWARE_CTA: { label: 'Your coverage was considered' },
  COVERAGE_GAP_DETECTOR: { label: 'Coverage gap detected' },

  // Scheduling / suppression checks
  SUPPRESSION_CHECK: { label: 'We checked whether this is already being handled' },
  TASK_ALREADY_SCHEDULED: { label: 'Related work is already scheduled' },
  TASK_EXISTS: { label: 'This is already tracked as a maintenance task' },
  BOOKING_SUPPRESSION: { label: 'We checked for existing scheduled work' },

  // Checklist
  CHECKLIST_TRACKED: { label: 'Already tracked in your checklist' },
  CHECKLIST_ITEM_TRACKED: { label: 'This is already tracked in your maintenance schedule' },
  CHECKLIST_SUPPRESSION: { label: 'Already tracked in your maintenance checklist' },
  CHECKLIST_SUPPRESSION_AUTHORITATIVE: { label: 'Already tracked in your maintenance checklist' },

  // User actions / state
  USER_COMPLETED: { label: 'You marked this as completed' },
  USER_MARKED_COMPLETE: { label: 'You marked this as completed' },
  USER_SNOOZED: { label: 'You snoozed this recommendation' },
  SNOOZED: { label: 'Currently snoozed' },
  USER_UNMARKED_COMPLETE: { label: 'You unmarked this as completed' },

  // Final decision
  SUPPRESSION_FINAL: { label: 'Final decision made' },
};

export function getRuleMeta(rule: string) {
  return RULE_LABELS[rule] ?? { label: rule.replace(/_/g, ' ') };
}

// Suppression reason labels (single source of truth)
export const SUPPRESSION_REASON_LABELS: Record<string, string> = {
  // Scheduling
  BOOKING_EXISTS: 'Work is already scheduled',
  MAINTENANCE_TASK_EXISTS: 'Already tracked as a maintenance task',

  // Coverage
  COVERED: 'This issue is already covered',
  COVERED_BY_WARRANTY: 'Covered by an active warranty',
  COVERED_BY_INSURANCE: 'Covered by insurance',

  // Checklist
  CHECKLIST_TRACKED: 'Already tracked in your checklist',

  // User actions
  USER_MARKED_COMPLETE: 'You marked this as completed',
  USER_SNOOZED: 'You snoozed this recommendation',

  // Generic / fallback
  NOT_ACTIONABLE: 'This does not require action right now'
  
};


export function getSuppressionReasonLabel(reason: string): string {
  return SUPPRESSION_REASON_LABELS[reason] ?? humanizeEnum(reason);
}

export function humanizeEnum(value: string): string {
  const s = String(value ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/**
 * Curated details formatter — avoids raw JSON.
 * Keep this short and user-friendly.
 */
export function formatRuleDetails(details: Record<string, any>): string {
  if (!details) return '';

  // 1) Prefer backend-curated message
  if (details.message) return String(details.message);

  // 2) Snooze: most human first
  if (details.daysRemaining !== undefined) {
    const d = Number(details.daysRemaining);
    if (!Number.isNaN(d)) {
      return `Snoozed for ${d} more ${d === 1 ? 'day' : 'days'}`;
    }
  }

  if (details.snoozedUntil || details.snoozeUntil) {
    const iso = details.snoozedUntil || details.snoozeUntil;
    const dt = new Date(iso);
    if (!Number.isNaN(dt.getTime())) {
      return `Snoozed until ${dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
    }
    return `Snoozed until ${String(iso)}`;
  }

  // 3) Age evaluation
  if (details.remainingLife !== undefined && details.percentUsed !== undefined) {
    const remaining = Number(details.remainingLife);
    const used = Number(details.percentUsed);
    if (!Number.isNaN(remaining) && !Number.isNaN(used)) {
      return remaining <= 0
        ? `Exceeded expected lifespan (${used}% used)`
        : `${remaining} years remaining (${used}% used)`;
    }
  }

  // 4) Coverage
  if (details.hasCoverage === false) return 'No active coverage found';
  if (details.hasCoverage === true) {
    const t = details.coverageType || details.type;
    return t ? `Covered by ${t}` : 'Active coverage found';
  }
  if (details.coverageType) return `Coverage: ${details.coverageType}`;
  if (details.type) return `Coverage: ${details.type}`;

  // 5) Tasks / checklist titles (more useful than service category)
  if (details.taskTitle) return `Task: "${details.taskTitle}"`;
  if (details.itemTitle) return `Tracked as "${details.itemTitle}"`;
  if (details.title) return `"${details.title}"`;

  // 6) Service inference
  if (details.serviceCategory) return `Service: ${details.serviceCategory}`;

  // 7) Generic reason
  if (details.reason) return humanizeEnum(details.reason);

  return 'Additional context evaluated';
}

