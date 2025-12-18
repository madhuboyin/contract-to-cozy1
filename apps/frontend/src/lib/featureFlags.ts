// apps/frontend/src/lib/featureFlags.ts
export const FEATURE_FLAGS = {
    FEEDBACK_WIDGET: process.env.NEXT_PUBLIC_FEATURE_FEEDBACK_WIDGET === 'true',
    VALUE_ESTIMATOR: process.env.NEXT_PUBLIC_FEATURE_VALUE_ESTIMATOR === 'true',
    BUDGET_TRACKER: process.env.NEXT_PUBLIC_FEATURE_BUDGET_TRACKER === 'true',
    MILESTONE_CELEBRATIONS: process.env.NEXT_PUBLIC_FEATURE_MILESTONE_CELEBRATIONS === 'true',
  } as const;