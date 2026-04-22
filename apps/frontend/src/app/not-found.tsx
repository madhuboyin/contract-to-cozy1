import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Home } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_35%,#ffffff_100%)]">
      <DashboardShell className="py-12">
        <Card className="mx-auto max-w-2xl rounded-[28px] border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-5 py-14 text-center">
            <div className="flex items-center justify-center gap-2">
              <Image
                src="/favicon.svg"
                alt="ContractToCozy"
                width={20}
                height={20}
                className="h-5 w-5"
              />
              <p className="mb-0 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                ContractToCozy
              </p>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Page not found</h1>
            <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">
              We couldn&apos;t find the page you were looking for. It may have moved, or the link may be outdated.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Link>
              </Button>
              <Button asChild className="rounded-full">
                <Link href="/">
                  <Home className="h-4 w-4" />
                  Go Home
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </DashboardShell>
    </div>
  );
}
