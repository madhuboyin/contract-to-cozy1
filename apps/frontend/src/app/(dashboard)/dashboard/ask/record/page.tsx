import { Suspense } from 'react';
import { AskRecord } from '@/components/ask/record/AskRecord';

export default function AskRecordPage() {
  return <Suspense fallback={<div className="p-6 text-sm text-slate-600" role="status">Loading Record…</div>}><AskRecord /></Suspense>;
}
