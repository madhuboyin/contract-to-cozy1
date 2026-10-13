// DIY skill profile and project notes inside Ask (register P2 "DIY"; FRD v1.344). Pure: declared messages, action ids, forms and validation.
//
// The skill profile is a person's own record (one per user, read by the DIY decision), so setting it is caller-scoped, not a change to the home. A project
// note is a note on the household's project and needs a contributor. AI guides, the decision tool, step bulk editing and planning visuals are not here.
import { z } from 'zod';

export const DIY_PROFILE_MESSAGE = 'Set my DIY skill levels.';
export const DIY_NOTE_MESSAGE = 'Add a note to this DIY project.';
export const DIY_PROFILE_ACTION_ID = 'diy-skill-profile';
export const DIY_NOTE_ACTION_ID = 'diy-project-note';
export const DIY_PROJECT_ENTITY_TYPE = 'DIY_PROJECT';
export const DIY_PROFILE_CAPTURE_KEY = 'DIY_SKILL_PROFILE';
export const DIY_NOTE_CAPTURE_KEY = 'DIY_PROJECT_NOTE';

export const DIY_SKILL_AREAS = [
  { key: 'hvac', label: 'Heating and cooling' }, { key: 'plumbing', label: 'Plumbing' }, { key: 'electrical', label: 'Electrical' },
  { key: 'painting', label: 'Painting' }, { key: 'general', label: 'General repairs' }, { key: 'exterior', label: 'Exterior' },
  { key: 'flooring', label: 'Flooring' }, { key: 'appliance', label: 'Appliances' }, { key: 'landscaping', label: 'Landscaping' },
] as const;
export const DIY_SKILL_LEVELS = [{ value: 'BEGINNER', label: 'Beginner' }, { value: 'INTERMEDIATE', label: 'Intermediate' }, { value: 'ADVANCED', label: 'Advanced' }] as const;
const level = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
export const DiySkillProfileSchema = z.object({
  hvac: level, plumbing: level, electrical: level, painting: level, general: level, exterior: level, flooring: level, appliance: level, landscaping: level,
}).strict();
export const parseDiySkillProfileAnswer = (answer: unknown) => DiySkillProfileSchema.safeParse(answer);
export const DiyNoteSchema = z.object({ note: z.string().trim().min(3).max(1000) }).strict();
export const parseDiyNoteAnswer = (answer: unknown) => DiyNoteSchema.safeParse(answer);
export const DIY_NOTES_MAX = 100;
export const diyLevelLabel = (value: string | null | undefined) => DIY_SKILL_LEVELS.find((l) => l.value === value)?.label ?? 'Not set';
/** Only a project still being worked on takes a note. */
export const diyProjectTakesNote = (status: string) => status === 'PLANNING' || status === 'IN_PROGRESS';
