// apps/frontend/src/components/ops/personalization/ProfileQuestionsCard.tsx

'use client';

import { Button } from '@/components/ui/button';
import type { PersonalizationCatalogQuestion } from '@/lib/api/personalizationAdminApi';

export function ProfileQuestionsCard({
  questions,
  onActivate,
  activatePending,
}: {
  questions: PersonalizationCatalogQuestion[];
  onActivate: (code: string, version: number) => void;
  activatePending: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 pb-1 pt-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Progressive profile questions</h2>
        <p className="text-[12px] text-slate-500">Activate only reviewed questions approved for optional profile collection.</p>
      </div>
      <div className="px-5 pb-2 pt-2">
        {questions.map((question) => {
          const isActive = question.status === 'ACTIVE';
          return (
            <div key={`${question.code}:${question.version}`} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-b-0">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-slate-800">{question.prompt}</p>
                <p className="font-mono text-[10.5px] text-slate-400">{question.code} · v{question.version}</p>
              </div>
              {isActive ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold text-emerald-700">Active</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 rounded px-2.5 text-[11px] font-semibold"
                  disabled={activatePending}
                  onClick={() => onActivate(question.code, question.version)}
                >
                  Activate
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
