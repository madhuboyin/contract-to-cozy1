'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import RouteStateCard from '@/components/system/RouteStateCard';
import { Button } from '@/components/ui/button';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function ShareDownloadClient() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function go() {
      try {
        // Backend endpoint: GET /api/reports/share/:token/download -> { url } OR redirect
        // We built it as redirect earlier, but in Option A we changed downloads to {url}.
        // This client expects JSON { url }. If your backend share endpoint redirects instead,
        // replace fetchJSON with window.location.href = `/api/reports/share/${token}/download`.
        const { url } = await fetchJSON<{ url: string }>(`/api/reports/share/${token}/download`);
        if (cancelled) return;
        window.location.href = url;
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'This share link is invalid or expired.');
      }
    }

    go();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <RouteStateCard
          state="error"
          title="Unable to open report"
          description={error}
          action={(
            <Button asChild variant="outline">
              <Link href="/">Go to Contract to Cozy</Link>
            </Button>
          )}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <RouteStateCard
        state="loading"
        title="Opening report..."
        description="If the download does not start automatically, refresh this page."
      />
    </div>
  );
}
