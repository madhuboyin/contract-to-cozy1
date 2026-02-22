// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Activity, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import ScoreGauge from "@/components/ui/ScoreGauge";

const getHealthDetails = (score: number) => {
    if (score >= 85) {
        return { level: "Excellent", color: "text-emerald-600" };
    } else if (score >= 70) {
        return { level: "Good", color: "text-teal-600" };
    } else if (score >= 50) {
        return { level: "Fair", color: "text-amber-500" };
    } else {
        return { level: "Poor", color: "text-red-500" };
    }
};

interface PropertyHealthScoreCardProps {
    property: ScoredProperty;
}

const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data'];

function getHealthCardTone(score: number) {
    if (score >= 80) return "bg-emerald-50/30 border-emerald-200/50";
    if (score >= 60) return "bg-teal-50/30 border-teal-200/50";
    return "bg-amber-50/30 border-amber-200/50";
}

export function PropertyHealthScoreCard({ property }: PropertyHealthScoreCardProps) {
    const healthScore = property.healthScore?.totalScore || 0;
    const { level, color } = getHealthDetails(healthScore);
    const snapshotQuery = useQuery({
        queryKey: ['property-score-snapshot', property.id, 'HEALTH'],
        queryFn: async () => api.getPropertyScoreSnapshots(property.id, 16),
        enabled: !!property.id,
        staleTime: 10 * 60 * 1000,
    });
    const healthDelta = snapshotQuery.data?.scores?.HEALTH?.deltaFromPreviousWeek ?? 0;

    const totalRequiredActions = property.healthScore?.insights.filter(i => 
        HIGH_PRIORITY_STATUSES.includes(i.status)
    ).length || 0;
    const changeBadgeClass =
        healthDelta > 0
            ? "bg-emerald-100 text-emerald-700"
            : healthDelta < 0
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-500";
    const changeLabel =
        healthDelta > 0
            ? `+${healthDelta.toFixed(1)}`
            : healthDelta < 0
                ? `${healthDelta.toFixed(1)}`
                : "No change";

    return (
        <Link href={`/dashboard/properties/${property.id}/health-score`}>
            <Card className={`h-full border p-0 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${getHealthCardTone(healthScore)}`}>
                <CardContent className="flex h-full flex-col p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-gray-600" />
                            <h3 className="text-base font-semibold text-gray-900">Health</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${changeBadgeClass}`}>
                                {changeLabel}
                            </span>
                            <ArrowRight className="h-4 w-4 text-gray-400" />
                        </div>
                    </div>

                    <div className="my-3 flex flex-col items-center gap-1.5">
                        <ScoreGauge
                            value={healthScore}
                            label="Health"
                            sublabel={level}
                            size="summary"
                            strokeWidth={7}
                            animate
                            showLabel={false}
                            showSublabel={false}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">HEALTH</span>
                        <span className={`text-sm font-bold ${color}`}>{level}</span>
                    </div>

                    <div className="mt-auto border-t border-gray-100 pt-2 text-center">
                        <span className="text-xs text-gray-400">MAINTENANCE ACTIONS</span>
                        <span className={`ml-2 text-xs font-semibold ${totalRequiredActions > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                            {totalRequiredActions > 0 ? `${totalRequiredActions} Required` : "All clear"}
                        </span>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
