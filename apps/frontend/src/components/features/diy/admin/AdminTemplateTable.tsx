'use client';
import Link from 'next/link';
import type { AdminDiyTemplateSummary, DiyTemplateStatus, DiyProjectCategory } from '@/types';
import { CATEGORY_LABELS, DIFFICULTY_LABELS, DIFFICULTY_COLOR, SKILL_LABELS } from '../DiyUtils';
import StatusBadge from './StatusBadge';
import TemplateStatusActions from './TemplateStatusActions';

interface Props {
  templates: AdminDiyTemplateSummary[];
  onStatusChange: (id: string, status: DiyTemplateStatus) => void;
  onDuplicate: (newId: string) => void;
}

export default function AdminTemplateTable({ templates, onStatusChange, onDuplicate }: Props) {
  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center">
        <p className="text-sm text-neutral-500">No templates yet. Create your first template to populate the Project Library.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-neutral-500">Title</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-500">Category</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-500">Difficulty</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-500">Skill Required</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-500">Steps</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-500">Featured</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 bg-white">
          {templates.map((t) => (
            <tr key={t.id} className="hover:bg-neutral-50">
              <td className="px-4 py-3 font-medium text-neutral-900">
                <Link href={`/dashboard/admin/diy/templates/${t.id}/edit`} className="hover:underline">
                  {t.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-neutral-600">{CATEGORY_LABELS[t.category]}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLOR[t.difficultyLevel]}`}>
                  {DIFFICULTY_LABELS[t.difficultyLevel]}
                </span>
              </td>
              <td className="px-4 py-3 text-neutral-600">{SKILL_LABELS[t.requiredSkillLevel]}</td>
              <td className="px-4 py-3 text-neutral-600">{t.stepCount}</td>
              <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
              <td className="px-4 py-3 text-center">
                {t.featuredOrder != null ? (
                  <span title={`Featured #${t.featuredOrder}`} className="text-yellow-500">★</span>
                ) : (
                  <span className="text-neutral-300">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <TemplateStatusActions template={t} onStatusChange={onStatusChange} onDuplicate={onDuplicate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
