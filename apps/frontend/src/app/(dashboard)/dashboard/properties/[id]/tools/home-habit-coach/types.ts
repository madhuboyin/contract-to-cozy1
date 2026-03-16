// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-habit-coach/types.ts

export type HabitCategory =
  | 'HVAC'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'SAFETY'
  | 'EXTERIOR'
  | 'INTERIOR'
  | 'SEASONAL'
  | 'APPLIANCES'
  | 'LANDSCAPING'
  | 'GENERAL';

export type HabitCadence =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMI_ANNUAL'
  | 'ANNUAL'
  | 'AS_NEEDED'
  | 'SEASONAL';

export type HabitAssignmentStatus =
  | 'ACTIVE'
  | 'SNOOZED'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'DISMISSED'
  | 'EXPIRED';

export type HabitDifficulty = 'EASY' | 'MODERATE' | 'HARD';

export type HabitImpactType = 'SAFETY' | 'COST_SAVINGS' | 'COMFORT' | 'LONGEVITY' | 'COMPLIANCE';

export type HabitActionType =
  | 'COMPLETED'
  | 'SNOOZED'
  | 'SKIPPED'
  | 'DISMISSED'
  | 'REOPENED'
  | 'VIEWED';

export type SnoozePreset = '1d' | '3d' | '7d' | '14d' | '30d';

export interface HabitTemplate {
  id: string;
  key: string;
  title: string;
  shortDescription: string | null;
  description?: string | null;
  category: HabitCategory;
  cadence: HabitCadence;
  difficulty: HabitDifficulty;
  impactType: HabitImpactType;
  estimatedMinutes: number | null;
  isSeasonal: boolean;
  iconKey: string | null;
  tipText: string | null;
  completionNoteTemplate?: string | null;
}

export interface HabitAction {
  id: string;
  actionType: HabitActionType;
  note: string | null;
  snoozeUntil: string | null;
  createdAt: string;
  userId: string | null;
}

export interface PropertyHabit {
  id: string;
  propertyId: string;
  status: HabitAssignmentStatus;
  generationSource: string;
  titleOverride: string | null;
  descriptionOverride: string | null;
  surfacedAt: string;
  dueAt: string | null;
  expiresAt: string | null;
  snoozedUntil: string | null;
  lastCompletedAt: string | null;
  lastActionAt: string | null;
  priorityScore: number | null;
  reasonSummary: string | null;
  createdAt: string;
  updatedAt: string;
  habitTemplate: HabitTemplate;
  // Only in detail view
  availableFrom?: string | null;
  reasonJson?: unknown;
  contextJson?: unknown;
  actions?: HabitAction[];
}

export interface HabitPreferences {
  id: string;
  propertyId: string;
  isEnabled: boolean;
  preferredSurfaceCount: number | null;
  snoozeDefaultsJson: unknown;
  quietHoursJson: unknown;
  hiddenCategoriesJson: unknown;
  personalizationJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ListHabitsResult {
  habits: PropertyHabit[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SpotlightResult {
  habit: PropertyHabit | null;
}

export interface GenerationResult {
  created: number;
  skipped: number;
  evaluated: number;
}
