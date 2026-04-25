import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function KnowledgeNotFound() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_35%,#ffffff_100%)]">
      <DashboardShell className="py-12">
        <Card className="mx-auto max-w-2xl rounded-[28px] border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-5 py-14 text-center">
            <p className="text-sm font-semibold tracking-normal text-slate-500">Knowledge Hub</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Article not found</h1>
            <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">
              The article you tried to open is not available right now. It may be unpublished, moved, or no longer
              part of the current Knowledge Hub seed set.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/knowledge">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Knowledge Hub
                </Link>
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
