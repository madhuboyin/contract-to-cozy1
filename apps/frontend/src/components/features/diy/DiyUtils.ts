// apps/frontend/src/components/features/diy/DiyUtils.ts
import type { DiyProjectCategory, DiyDifficultyLevel, DiyDecisionVerdict, DiyProjectStatus, DiySkillLevel, DiySafetyLevel } from '@/types';

export const CATEGORY_LABELS: Record<DiyProjectCategory, string> = {
  HVAC: 'HVAC',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  PAINTING: 'Painting',
  GENERAL: 'General',
  EXTERIOR: 'Exterior',
  FLOORING: 'Flooring',
  APPLIANCE: 'Appliances',
  LANDSCAPING: 'Landscaping',
  OTHER: 'Other',
};

export const CATEGORY_EMOJI: Record<DiyProjectCategory, string> = {
  HVAC: '🌡️',
  PLUMBING: '🚿',
  ELECTRICAL: '⚡',
  PAINTING: '🎨',
  GENERAL: '🔧',
  EXTERIOR: '🏠',
  FLOORING: '🪵',
  APPLIANCE: '🍽️',
  LANDSCAPING: '🌿',
  OTHER: '🔩',
};

export const DIFFICULTY_LABELS: Record<DiyDifficultyLevel, string> = {
  EASY: 'Easy',
  MODERATE: 'Moderate',
  HARD: 'Hard',
  EXPERT_ONLY: 'Expert Only',
};

export const DIFFICULTY_COLOR: Record<DiyDifficultyLevel, string> = {
  EASY: 'text-green-600 bg-green-50',
  MODERATE: 'text-yellow-700 bg-yellow-50',
  HARD: 'text-orange-700 bg-orange-50',
  EXPERT_ONLY: 'text-red-700 bg-red-50',
};

export const VERDICT_LABELS: Record<DiyDecisionVerdict, string> = {
  DIY_RECOMMENDED: 'DIY Recommended',
  BORDERLINE: 'Borderline',
  HIRE_RECOMMENDED: 'Hire Recommended',
  HIRE_REQUIRED: 'Hire Required',
};

export const VERDICT_COLOR: Record<DiyDecisionVerdict, string> = {
  DIY_RECOMMENDED: 'text-green-700 bg-green-50 border-green-200',
  BORDERLINE: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  HIRE_RECOMMENDED: 'text-orange-700 bg-orange-50 border-orange-200',
  HIRE_REQUIRED: 'text-red-700 bg-red-50 border-red-200',
};

export const STATUS_LABELS: Record<DiyProjectStatus, string> = {
  PLANNING: 'Planning',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  ABANDONED: 'Abandoned',
  HIRED_OUT: 'Hired Out',
};

export const STATUS_COLOR: Record<DiyProjectStatus, string> = {
  PLANNING: 'text-blue-700 bg-blue-50',
  IN_PROGRESS: 'text-yellow-700 bg-yellow-50',
  COMPLETED: 'text-green-700 bg-green-50',
  ABANDONED: 'text-neutral-600 bg-neutral-100',
  HIRED_OUT: 'text-purple-700 bg-purple-50',
};

export const SKILL_LABELS: Record<DiySkillLevel, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

export const SAFETY_COLOR: Record<DiySafetyLevel, string> = {
  LOW: 'text-green-700 bg-green-50',
  MODERATE: 'text-yellow-700 bg-yellow-50',
  HIGH: 'text-red-700 bg-red-50',
};

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatCentsRange(min?: number, max?: number): string {
  if (!min && !max) return '';
  const fmt = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `from ${fmt(min)}`;
  if (max) return `up to ${fmt(max)}`;
  return '';
}
