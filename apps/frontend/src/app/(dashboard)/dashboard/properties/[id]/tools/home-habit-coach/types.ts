// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-habit-coach/types.ts

export type HabitCategory =
  | 'HVAC'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'SAFETY'
  | 'APPLIANCE'
  | 'EXTERIOR'
  | 'INTERIOR'
  | 'SEASONAL'
  | 'ENVIRONMENTAL'
  | 'GENERAL';

export type HabitCadence =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'SEASONAL'
  | 'ANNUAL'
  | 'AD_HOC';

export type HabitAssignmentStatus =
  | 'ACTIVE'
  | 'SNOOZED'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'DISMISSED'
  | 'EXPIRED';

export type HabitDifficulty = 'EASY' | 'MODERATE' | 'ADVANCED';

export type HabitImpactType =
  | 'PREVENT_DAMAGE'
  | 'IMPROVE_EFFICIENCY'
  | 'IMPROVE_SAFETY'
  | 'REDUCE_WEAR'
  | 'IMPROVE_AIR_QUALITY'
  | 'GENERAL_UPKEEP';

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
