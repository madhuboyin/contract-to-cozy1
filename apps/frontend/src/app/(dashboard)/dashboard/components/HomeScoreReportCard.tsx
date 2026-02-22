"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Gauge,
  Loader2,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

function getBandStyles(band?: string) {
  if (band === "EXCELLENT") {
    return {
      label: "Excellent",
      scoreColor: "text-emerald-700",
      progressColor: "bg-emerald-500",
      tone: "bg-emerald-50/30 border-emerald-200/50",
    };
  }
  if (band === "GOOD") {
    return {
      label: "Good",
      scoreColor: "text-teal-700",
      progressColor: "bg-teal-500",
      tone: "bg-teal-50/30 border-teal-200/50",
    };
  }
  if (band === "FAIR") {
    return {
      label: "Fair",
      scoreColor: "text-amber-600",
      progressColor: "bg-amber-500",
      tone: "bg-amber-50/30 border-amber-200/50",
    };
  }
  return {
    label: "Needs Attention",
    scoreColor: "text-rose-600",
    progressColor: "bg-rose-500",
    tone: "bg-rose-50/30 border-rose-200/50",
  };
}

interface HomeScoreReportCardProps {
  propertyId?: string;
}

export function HomeScoreReportCard({ propertyId }: HomeScoreReportCardProps) {
  const reportQuery = useQuery({
    queryKey: ["home-score-report", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getHomeScoreReport(propertyId, 26);
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const reportLink = propertyId
    ? `/dashboard/properties/${propertyId}/home-score`
    : "/dashboard/properties";

  if (!propertyId) {
    return (
      <Card className="lg:col-span-2 h-full border-2 border-dashed border-gray-300">
        <CardContent className="flex h-full flex-col items-center justify-center gap-2 p-4">
          <Gauge className="h-8 w-8 text-gray-400" />
          <p className="text-sm text-gray-500">Select a property</p>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/dashboard/properties">Manage Properties</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (reportQuery.isLoading) {
    return (
      <Card className="lg:col-span-2 h-full border border-gray-200">
        <CardContent className="flex h-full flex-col items-center justify-center gap-2 p-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm text-gray-500">Loading HomeScore...</p>
        </CardContent>
      </Card>
    );
  }

  const report = reportQuery.data;
  const score = Math.round(report?.homeScore ?? 0);
  const delta = report?.deltaFromPreviousWeek ?? null;
  const confidence = report?.confidence ?? "LOW";
  const styles = getBandStyles(report?.scoreBand);
  const nextAction =
    report?.nextBestAction?.title ?? "Run HomeScore report to view top drivers.";

  return (
    <Link href={reportLink}>
      <Card
        className={`lg:col-span-2 h-full border p-0 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${styles.tone}`}
      >
        <CardContent className="flex h-full flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-gray-600" />
              <h3 className="text-base font-semibold text-gray-900">HomeScore Report</h3>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400" />
          </div>

          <div className="grid gap-3 sm:grid-cols-[auto,1fr] sm:items-center">
            <div>
              <div className="flex items-end gap-1.5">
                <span
                  className={`font-display text-5xl font-bold leading-none tracking-tight ${styles.scoreColor}`}
                >
                  {score}
                </span>
                <span className="pb-1 text-lg text-gray-400">/100</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-gray-700">{styles.label}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Confidence</span>
                <span className="font-semibold text-gray-700">{confidence}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full ${styles.progressColor}`}
                  style={{
                    width:
                      confidence === "HIGH"
                        ? "100%"
                        : confidence === "MEDIUM"
                        ? "66%"
                        : "33%",
                  }}
                />
              </div>
              <p className="line-clamp-1 text-xs text-gray-600">{nextAction}</p>
            </div>
          </div>

          <div className="mt-3 border-t border-gray-100 pt-2">
            {delta === null ? (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <Minus className="h-3 w-3" />
                No weekly change
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 text-xs ${
                  delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-gray-500"
                }`}
              >
                {delta > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : delta < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {delta > 0 ? "+" : ""}
                {delta.toFixed(1)} vs last week
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
