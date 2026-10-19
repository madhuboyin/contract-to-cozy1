import { Suspense } from 'react';
import { AskSavedDestination } from '@/components/ask/saved/AskSavedDestination';

export default function AskSavedPage() {
  return <Suspense fallback={<div className="p-6 text-sm text-slate-600" role="status">Loading Saved…</div>}><AskSavedDestination /></Suspense>;
}
