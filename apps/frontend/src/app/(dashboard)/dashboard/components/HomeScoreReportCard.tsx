"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Gauge, Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

function getBandStyles(band?: string) {
  if (band === "EXCELLENT") return { label: "Excellent", scoreColor: "text-emerald-700", progressColor: "bg-emerald-500" };
  if (band === "GOOD") return { label: "Good", scoreColor: "text-teal-700", progressColor: "bg-teal-500" };
  if (band === "FAIR") return { label: "Fair", scoreColor: "text-amber-600", progressColor: "bg-amber-500" };
  return { label: "Needs Attention", scoreColor: "text-rose-600", progressColor: "bg-rose-400" };
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

  const reportLink = propertyId ? `/dashboard/properties/${propertyId}/home-score` : "/dashboard/properties";

  if (!propertyId) {
    return (
      <Card className="min-h-[230px] border-2 border-dashed border-gray-300">
        <CardContent className="h-full p-5 flex flex-col items-center justify-center gap-2">
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
      <Card className="min-h-[230px] border border-gray-200">
        <CardContent className="h-full p-5 flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
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
  const nextAction = report?.nextBestAction?.title ?? "Run HomeScore report to view top drivers.";

  return (
    <Link href={reportLink}>
      <Card className="min-h-[230px] border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer">
        <CardContent className="h-full p-5 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-gray-600" />
              <h3 className="text-base font-semibold text-gray-900">HomeScore Report</h3>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400" />
          </div>

          <div className="mb-2">
            <div className="flex items-baseline gap-2">
              <span className={`text-4xl font-bold leading-none ${styles.scoreColor}`}>{score}</span>
              <span className="text-xl text-gray-400 font-normal">/100</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-sm text-gray-600">{styles.label}</p>
              {delta === null ? (
                <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                  <Minus className="h-3 w-3" />
                  No weekly change
                </span>
              ) : (
                <span
                  className={`text-xs inline-flex items-center gap-1 ${
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
          </div>

          <div className="mt-auto">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span className="truncate">Confidence</span>
              <span className="ml-2 whitespace-nowrap">{confidence}</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${styles.progressColor}`}
                style={{
                  width:
                    confidence === "HIGH" ? "100%" : confidence === "MEDIUM" ? "66%" : "33%",
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1.5 line-clamp-1">{nextAction}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
