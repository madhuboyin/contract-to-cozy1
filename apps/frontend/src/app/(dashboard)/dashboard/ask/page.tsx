'use client';

import { MessageCircle, Sparkles } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AskPage() {
  const { selectedPropertyId } = usePropertyContext();
  const openAsk = () => {
    window.dispatchEvent(new CustomEvent('cozy-chat-open'));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Ask</p><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Ask about this home</h1><p className="text-sm leading-6 text-slate-600">Guidance uses the selected property’s current actions and recent Home Record—not a generic checklist.</p></div>
      <Card className="rounded-[28px] border-teal-200 bg-teal-50/50 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-teal-700" />Start a grounded conversation</CardTitle><CardDescription>{selectedPropertyId ? 'Use Ask for an open-ended explanation that needs context across this home’s records and actions.' : 'Select a home to ground the conversation in its records and actions.'}</CardDescription></CardHeader>
        <CardContent><Button className="rounded-full" onClick={openAsk}><MessageCircle className="mr-2 h-4 w-4" />Ask an open-ended question</Button></CardContent>
      </Card>
    </div>
  );
}
