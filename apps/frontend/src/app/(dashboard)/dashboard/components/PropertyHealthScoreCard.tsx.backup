// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx
// FIX: Added h-full flex flex-col to Card for equal height in grid

"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Shield, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import React from 'react';

const getHealthDetails = (score: number) => {
    if (score >= 85) {
        return { level: "EXCELLENT", color: "text-green-500", progressClass: "bg-green-500", badgeVariant: "success" as const };
    } else if (score >= 70) {
        return { level: "GOOD", color: "text-blue-500", progressClass: "bg-blue-500", badgeVariant: "secondary" as const };
    } else if (score >= 50) {
        return { level: "FAIR", color: "text-yellow-500", progressClass: "bg-yellow-500", badgeVariant: "secondary" as const };
    } else {
        return { level: "POOR", color: "text-red-500", progressClass: "bg-red-500", badgeVariant: "destructive" as const };
    }
};

interface PropertyHealthScoreCardProps {
    property: ScoredProperty;
}

const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection'];

export function PropertyHealthScoreCard({ property }: PropertyHealthScoreCardProps) {
    const healthScore = property.healthScore?.totalScore || 0;
    const { level, color, progressClass, badgeVariant } = getHealthDetails(healthScore);
    const progressValue = healthScore > 100 ? 100 : healthScore;
    
    const totalRequiredActions = property.healthScore?.insights.filter(i => 
        HIGH_PRIORITY_STATUSES.includes(i.status)
    ).length || 0;

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle className="font-heading text-xl flex items-center gap-2">
                        <Shield className={`h-5 w-5 ${color}`} />
                        Property Health
                    </CardTitle>
                    <CardDescription className="font-body text-sm">
                        {property.name || 'Primary Home'} overall condition
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="flex-1">
                <div className="text-4xl font-extrabold flex items-baseline">
                    <span className={color}>{healthScore}</span>
                    <span className="text-xl font-semibold text-muted-foreground ml-1">/100</span>
                </div>
                <p className="font-body text-sm text-muted-foreground mt-1">
                    Status: <Badge variant={badgeVariant} className="text-xs">{level}</Badge>
                </p>
                
                <div className="mt-4">
                    <p className="font-body text-lg font-semibold flex items-center">
                        <Zap className="h-4 w-4 mr-1 text-red-600" />
                        Required Maintenance Actions
                    </p>
                    <p className="text-3xl font-extrabold text-red-600">
                        {totalRequiredActions}
                    </p>
                    <p className="font-body text-xs text-muted-foreground mt-1">
                        High-priority tasks identified in the last assessment.
                    </p>
                </div>
                
                <div className="mt-4">
                    <h4 className="font-body text-sm font-medium mb-1">Health Gauge ({level})</h4>
                    <Progress 
                        value={progressValue} 
                        className="h-2" 
                        indicatorClassName={progressClass} 
                    />
                    <Link href={`/dashboard/properties/${property.id}/?tab=maintenance`} passHref>
                        <Button variant="link" className="p-0 h-auto mt-2 font-body text-sm font-semibold">
                            View Full Maintenance Plan <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}