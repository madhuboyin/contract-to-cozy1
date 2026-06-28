'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import RouteStateCard from '@/components/system/RouteStateCard';
import BuyerReportView from '@/components/home-score/BuyerReportView';
import type { BuyerReportData } from '@/types';

export default function BuyerReportClient() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [report, setReport] = useState<BuyerReportData | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; description: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${baseUrl}/api/home-score/share/${token}`);
        const json = await res.json();

        if (cancelled) return;

        if (!res.ok || !json.success) {
          if (res.status === 410) {
            const msg: string = json.message || '';
            if (msg.toLowerCase().includes('revoked')) {
              setError({ title: 'Report removed', description: 'The owner has removed this share link.' });
            } else {
              setError({ title: 'Link expired', description: 'This buyer report link has expired.' });
            }
          } else if (res.status === 404) {
            setError({ title: 'Not found', description: 'This share link is invalid or no longer exists.' });
          } else {
            setError({ title: 'Unable to load report', description: json.message || 'An unexpected error occurred.' });
          }
          return;
        }

        setReport(json.data.report);
        setExpiresAt(json.data.expiresAt);
      } catch {
        if (!cancelled) {
          setError({ title: 'Unable to load report', description: 'Check your connection and try again.' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <RouteStateCard state="loading" title="Loading report…" description="Fetching home details." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <RouteStateCard
          state="error"
          title={error.title}
          description={error.description}
          action={
            <Button asChild variant="outline">
              <Link href="/signup?source=buyer-report">Create your own home report</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!report) return null;

  return <BuyerReportView report={report} expiresAt={expiresAt} />;
}
