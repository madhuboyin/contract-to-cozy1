'use client';
import Link from 'next/link';
import type { DiyTemplateSummary } from '@/types';
import { CATEGORY_EMOJI, DIFFICULTY_LABELS, DIFFICULTY_COLOR, formatMinutes, formatCentsRange } from './DiyUtils';

interface Props {
  template: DiyTemplateSummary;
  propertyId?: string;
  compact?: boolean;
}

export default function TemplateCard({ template, propertyId, compact }: Props) {
  const href = propertyId
    ? `/dashboard/diy/templates/${template.id}?propertyId=${propertyId}`
    : `/dashboard/diy/templates/${template.id}`;

  return (
    <Link
      href={href}
      className={`flex flex-col gap-2 rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4 transition-colors hover:bg-[hsl(var(--mobile-card-bg))]/80 ${compact ? 'w-52 shrink-0' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl">{CATEGORY_EMOJI[template.category]}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLOR[template.difficultyLevel]}`}>
          {DIFFICULTY_LABELS[template.difficultyLevel]}
        </span>
      </div>
      <div>
        <p className="font-semibold text-sm leading-snug">{template.title}</p>
        {!compact && (
          <p className="mt-0.5 text-xs text-[hsl(var(--mobile-text-secondary))] line-clamp-2">
            {template.shortDescription}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-[hsl(var(--mobile-text-muted))]">
        <span>{formatMinutes(template.estimatedMinutes)}</span>
        {template.estimatedMaterialCostMinCents !== undefined && (
          <>
            <span>·</span>
            <span>{formatCentsRange(template.estimatedMaterialCostMinCents, template.estimatedMaterialCostMaxCents)}</span>
          </>
        )}
      </div>
    </Link>
  );
}
