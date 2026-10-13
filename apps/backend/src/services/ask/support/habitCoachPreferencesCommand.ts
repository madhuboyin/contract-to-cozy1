// The Home Habit Coach's property-wide settings inside Ask (register P2 "Home Habit Coach"; FRD v1.334). Pure: the declared message, action id, the form and
// its validation. The household record's settings (is the coach on, how many habits it surfaces, which categories it hides) are shared by the household, so
// this is a contributor's change, as the route's is. Snooze defaults, quiet hours and personalization are not offered here.
import { z } from 'zod';

export const HABIT_COACH_PROPERTY_ENTITY_TYPE = 'HOME_HABIT_COACH_PROPERTY';
export const HABIT_COACH_PREFERENCES_MESSAGE = 'Change the Home Habit Coach settings for this home.';
export const HABIT_COACH_PREFERENCES_ACTION_ID = 'home-habit-coach-settings';
export const HABIT_COACH_PREFERENCES_CAPTURE_KEY = 'HOME_HABIT_COACH_SETTINGS';
export const HABIT_CATEGORIES = ['PLUMBING', 'HVAC', 'ELECTRICAL', 'SAFETY', 'APPLIANCE', 'EXTERIOR', 'INTERIOR', 'SEASONAL', 'ENVIRONMENTAL', 'GENERAL'] as const;
export const HABIT_CATEGORY_LABELS: Record<string, string> = {
  PLUMBING: 'Plumbing', HVAC: 'Heating and cooling', ELECTRICAL: 'Electrical', SAFETY: 'Safety', APPLIANCE: 'Appliances', EXTERIOR: 'Outside the home',
  INTERIOR: 'Inside the home', SEASONAL: 'Seasonal', ENVIRONMENTAL: 'Environment', GENERAL: 'General',
};

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
export const HabitCoachPreferencesInputSchema = z.object({
  isEnabled: z.enum(['YES', 'NO']),
  preferredSurfaceCount: z.preprocess(blank, z.coerce.number().int().min(1).max(20).nullable()).optional(),
  hiddenCategories: z.array(z.enum(HABIT_CATEGORIES)).max(10).default([]),
}).strict();
export type HabitCoachPreferencesForm = z.infer<typeof HabitCoachPreferencesInputSchema>;
export function parseHabitCoachPreferencesAnswer(answer: unknown): { success: true; data: HabitCoachPreferencesForm } | { success: false } {
  const parsed = HabitCoachPreferencesInputSchema.safeParse(answer);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}
/** What the canonical updatePreferences takes. A cleared count is explicit null (the coach's own default). */
export const habitCoachPreferencesBody = (form: HabitCoachPreferencesForm) => ({
  isEnabled: form.isEnabled === 'YES',
  preferredSurfaceCount: typeof form.preferredSurfaceCount === 'number' ? form.preferredSurfaceCount : null,
  hiddenCategories: [...new Set(form.hiddenCategories)],
});
