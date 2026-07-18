'use client';

import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Sparkles } from 'lucide-react';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AskPage() {
  const { selectedPropertyId } = usePropertyContext();
  const query = useQuery({
    queryKey: ['ask-home-grounding', selectedPropertyId],
    queryFn: () => api.getUnifiedHome(selectedPropertyId as string),
    enabled: Boolean(selectedPropertyId),
    staleTime: 2 * 60 * 1000,
  });
  const questions = query.data?.ask.suggestedQuestions ?? [
    'What should I pay attention to first?',
    'What should I plan for over the next 12 months?',
    'Which home facts would improve my guidance?',
  ];
  const openAsk = (question?: string) => {
    window.dispatchEvent(new CustomEvent('cozy-chat-open', { detail: { question } }));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Ask</p><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Ask about this home</h1><p className="text-sm leading-6 text-slate-600">Guidance uses the selected property’s current actions and recent Home Record—not a generic checklist.</p></div>
      <Card className="rounded-[28px] border-teal-200 bg-teal-50/50 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-teal-700" />Suggested questions</CardTitle><CardDescription>{selectedPropertyId ? 'Grounded in the selected home.' : 'Select a home to add property grounding.'}</CardDescription></CardHeader>
        <CardContent className="space-y-3">{questions.map((question) => <button key={question} type="button" onClick={() => openAsk(question)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-teal-200 bg-white px-4 py-4 text-left text-sm font-medium text-slate-800 transition hover:border-teal-400"><span>{question}</span><MessageCircle className="h-4 w-4 shrink-0 text-teal-600" /></button>)}<Button className="mt-2 rounded-full" onClick={() => openAsk()}><MessageCircle className="mr-2 h-4 w-4" />Ask another question</Button></CardContent>
      </Card>
    </div>
  );
}
