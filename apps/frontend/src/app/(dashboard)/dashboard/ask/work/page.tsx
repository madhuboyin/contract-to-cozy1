import { Suspense } from 'react';
import { AskWorkDestination } from '@/components/ask/workspace/AskWorkDestination';

export default function AskWorkPage() {
  return <Suspense fallback={<div className="p-6 text-sm text-slate-600" role="status">Loading Work…</div>}><AskWorkDestination /></Suspense>;
}
