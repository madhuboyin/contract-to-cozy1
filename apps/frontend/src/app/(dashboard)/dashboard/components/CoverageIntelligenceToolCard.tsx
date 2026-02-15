'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import {
  CoverageAnalysisDTO,
  getCoverageAnalysis,
  runCoverageAnalysis,
} from '@/lib/api/coverageAnalysisApi';
import { Button } from '@/components/ui/button';

type CoverageIntelligenceToolCardProps = {
  propertyId: string;
};

function statusText(analysis: CoverageAnalysisDTO | null, hasAnalysis: boolean) {
  if (!hasAnalysis || !analysis) {
    return 'Not run yet';
  }
  if (analysis.status === 'STALE') {
    return 'Review recommended';
  }
  if (analysis.status === 'ERROR') {
    return 'Needs refresh';
  }
  return analysis.overallVerdict.replace('_', ' ');
}

export default function CoverageIntelligenceToolCard({
  propertyId,
}: CoverageIntelligenceToolCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState<CoverageAnalysisDTO | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!propertyId) {
        setLoading(false);
        setHasAnalysis(false);
        setAnalysis(null);
        return;
      }
      setLoading(true);
      try {
        const result = await getCoverageAnalysis(propertyId);
        if (!mounted) return;
        if (result.exists) {
          setHasAnalysis(true);
          setAnalysis(result.analysis);
        } else {
          setHasAnalysis(false);
          setAnalysis(null);
        }
      } catch (error) {
        if (!mounted) return;
        setHasAnalysis(false);
        setAnalysis(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [propertyId]);

  const ctaLabel = useMemo(() => {
    if (!hasAnalysis || !analysis) return 'Run analysis';
    if (analysis.status === 'STALE') return 'Re-run';
    return 'View details';
  }, [analysis, hasAnalysis]);

  const handlePrimaryCta = async () => {
    if (!hasAnalysis || analysis?.status === 'STALE') {
      if (!propertyId) return;

      setRunning(true);
      try {
        const latest = await runCoverageAnalysis(propertyId);
        setHasAnalysis(true);
        setAnalysis(latest);
        router.push(`/dashboard/properties/${propertyId}/tools/coverage-intelligence`);
      } finally {
        setRunning(false);
      }
      return;
    }

    if (propertyId) {
      router.push(`/dashboard/properties/${propertyId}/tools/coverage-intelligence`);
    }
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-100">
            <ShieldCheck className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Coverage Intelligence</h3>
            <p className="text-sm text-gray-500">
              Insurance + warranty worth-it assessment
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-700">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            Checking status…
          </span>
        ) : (
          <>
            <span className="font-medium">Status:</span> {statusText(analysis, hasAnalysis)}
          </>
        )}
      </div>

      <div className="mt-4">
        <Button onClick={handlePrimaryCta} disabled={loading || running || !propertyId}>
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running…
            </>
          ) : (
            ctaLabel
          )}
        </Button>
      </div>
    </div>
  );
}
