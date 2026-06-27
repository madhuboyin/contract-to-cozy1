'use client';
import Link from 'next/link';
import type { DiySkillProfile, DiySkillLevel } from '@/types';
import { SKILL_LABELS } from './DiyUtils';

const SKILL_DOT: Record<DiySkillLevel, string> = {
  BEGINNER: 'bg-yellow-400',
  INTERMEDIATE: 'bg-blue-400',
  ADVANCED: 'bg-green-500',
};

const CATEGORIES: { key: keyof DiySkillProfile; label: string }[] = [
  { key: 'hvac', label: 'HVAC' },
  { key: 'plumbing', label: 'Plumbing' },
  { key: 'electrical', label: 'Electrical' },
  { key: 'painting', label: 'Painting' },
  { key: 'general', label: 'General' },
  { key: 'exterior', label: 'Exterior' },
  { key: 'flooring', label: 'Flooring' },
  { key: 'appliance', label: 'Appliances' },
  { key: 'landscaping', label: 'Landscaping' },
];

interface Props {
  profile: DiySkillProfile;
}

export default function SkillProfileCard({ profile }: Props) {
  return (
    <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Your Skill Levels</p>
        <Link href="/dashboard/diy/assess" className="text-xs text-[hsl(var(--mobile-brand-strong))]">
          Retake quiz
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CATEGORIES.map(({ key, label }) => {
          const level = profile[key] as DiySkillLevel;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${SKILL_DOT[level]}`} />
              <span className="min-w-0 truncate text-xs text-[hsl(var(--mobile-text-secondary))]">
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[hsl(var(--mobile-text-muted))]">
        Assessed {new Date(profile.assessedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
