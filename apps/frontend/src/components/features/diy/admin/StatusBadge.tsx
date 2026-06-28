'use client';
import type { DiyTemplateStatus } from '@/types';

const CONFIG: Record<DiyTemplateStatus, { label: string; className: string }> = {
  DRAFT:    { label: 'Draft',    className: 'bg-neutral-100 text-neutral-600' },
  ACTIVE:   { label: 'Active',   className: 'bg-green-100 text-green-700' },
  ARCHIVED: { label: 'Archived', className: 'bg-yellow-50 text-yellow-700' },
};

export default function StatusBadge({ status }: { status: DiyTemplateStatus }) {
  const { label, className } = CONFIG[status] ?? CONFIG.DRAFT;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
