'use client';

import { useState } from 'react';
import { CheckCircle2, Home, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { BuyerChecklistComposition } from '@/types';

type Props = {
  composition: BuyerChecklistComposition;
  readOnly: boolean;
  saving: boolean;
  onAnswer: (factKey: string, value: unknown) => void;
  onApplyReviewedChanges: () => void;
};

export function BuyerPlanPersonalization({
  composition,
  readOnly,
  saving,
  onAnswer,
  onApplyReviewedChanges,
}: Props) {
  const [year, setYear] = useState('');
  const question = composition.questions[0];
  const isComplete = composition.setupStatus === 'PERSONALIZED' && composition.delta.removed === 0;

  if (isComplete) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/60 shadow-sm">
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-semibold text-emerald-950">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" /> Plan personalized
            </p>
            <p className="mt-1 text-sm text-emerald-900">
              Your closing guidance reflects the home details you’ve shared. You can update them later from the property record.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {composition.knownFacts.slice(0, 4).map((fact) => (
              <span key={fact.factKey} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-950 shadow-sm">
                {fact.label}: {fact.value}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-teal-200 bg-gradient-to-br from-white to-teal-50/70 shadow-sm">
      <CardContent className="space-y-6 p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-semibold text-teal-800">
              <Sparkles className="h-4 w-4" /> One-time setup
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Make this plan fit my home</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              We’ll ask only when an answer changes an inspection focus, document request, or closing action. Safe additions are applied automatically.
            </p>
          </div>
          {composition.questions.length > 0 && (
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-teal-900 shadow-sm">
              {composition.questions.length} useful {composition.questions.length === 1 ? 'question' : 'questions'} left
            </span>
          )}
        </div>

        {composition.knownFacts.length > 0 && (
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <Home className="h-4 w-4" /> What we already know
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {composition.knownFacts.map((fact) => (
                <span key={fact.factKey} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                  <strong>{fact.label}:</strong> {fact.value}
                </span>
              ))}
            </div>
          </div>
        )}

        {composition.delta.removed > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="font-semibold text-amber-950">Review before changing existing work</h3>
            <p className="mt-1 text-sm text-amber-900">Your latest answers make the following guidance look unnecessary. Nothing will change until you confirm.</p>
            <ul className="mt-3 space-y-2 text-sm text-amber-950">
              {composition.delta.removedItems.map((item) => <li key={item.actionKey}>• {item.title ?? 'Previously personalized guidance'}</li>)}
            </ul>
            <Button className="mt-4" variant="outline" disabled={readOnly || saving} onClick={onApplyReviewedChanges}>
              {saving ? 'Updating…' : 'Apply reviewed changes'}
            </Button>
          </div>
        ) : question ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">{question.prompt}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600"><strong>How this helps:</strong> {question.whyWeAsk}</p>
            {question.answerKind === 'YEAR' ? (
              <div className="mt-4 space-y-3">
                <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => {
                  event.preventDefault();
                  const value = Number(year);
                  if (Number.isInteger(value)) onAnswer(question.factKey, value);
                }}>
                  <Input value={year} onChange={(event) => setYear(event.target.value)} type="number" min={1600} max={new Date().getFullYear() + 1} placeholder="Approximate year" className="sm:max-w-xs" />
                  <Button type="submit" disabled={readOnly || saving || !year}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Use this answer'}</Button>
                </form>
                <Button type="button" variant="ghost" className="px-0 text-slate-600" disabled={readOnly || saving} onClick={() => onAnswer(question.factKey, null)}>
                  I’m not sure — continue without it
                </Button>
              </div>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {(question.options ?? []).map((option) => (
                  <Button key={`${question.factKey}:${option.label}`} type="button" variant="outline" className="h-auto min-h-11 justify-start whitespace-normal text-left" disabled={readOnly || saving} onClick={() => onAnswer(question.factKey, option.value)}>
                    {option.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-2xl bg-white p-4 text-sm text-slate-700">Your answers are saved. We’re applying the safe additions to your plan now.</p>
        )}

        {composition.personalizedItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Guidance added for this home</p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {composition.personalizedItems.map((item) => (
                <li key={item.actionKey} className="rounded-2xl border border-teal-100 bg-white p-4">
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.whyMatters}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
