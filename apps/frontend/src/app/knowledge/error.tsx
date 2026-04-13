'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/DashboardShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getFaro } from '@/lib/monitoring/faro';

export default function KnowledgeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    getFaro()?.api.pushError(error);
  }, [error]);
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_35%,#ffffff_100%)]">
      <DashboardShell className="py-12">
        <Card className="mx-auto max-w-2xl rounded-[28px] border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-5 py-14 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Knowledge Hub</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Something went wrong</h1>
            <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">
              We couldn&apos;t load this page right now. Try again or return to the dashboard.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={reset} variant="outline" className="rounded-full">
                Try again
              </Button>
              <Button asChild className="rounded-full">
                <Link href="/dashboard">Return to dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </DashboardShell>
    </div>
  );
}
