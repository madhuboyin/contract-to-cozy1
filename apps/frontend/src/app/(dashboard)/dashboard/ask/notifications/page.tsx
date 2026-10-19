import { Suspense } from 'react';
import { AskNotificationsDestination } from '@/components/ask/notifications/AskNotificationsDestination';

export default function AskNotificationsPage() {
  return <Suspense fallback={<div className="p-6 text-sm text-slate-600" role="status">Loading Notifications…</div>}><AskNotificationsDestination /></Suspense>;
}
