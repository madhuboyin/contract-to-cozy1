// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx
// FIX: Added h-full flex flex-col to Card for equal height in grid

"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Shield, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import React from 'react';

// NOTE: Progress is no longer needed since we are implementing a custom SVG gauge.
// import { Progress } from "@/components/ui/progress"; 

const getHealthDetails = (score: number) => {
    if (score >= 85) {
        // progressClass: bg-xxx is needed for stroke-xxx class derivation
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

    // SVG Gauge Parameters
    const radius = 45; 
    const circumference = 2 * Math.PI * radius;
    // Calculation for the stroke offset to simulate progress
    const offset = circumference - (progressValue / 100) * circumference;
    // Convert background color class to stroke color class for the SVG element
    const strokeColorClass = progressClass.replace('bg-', 'stroke-'); 

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
            {/* Added flex flex-col justify-between to manage content layout */}
            <CardContent className="flex-1 flex flex-col justify-between">
                
                {/* *** GAUGE ICON AND SCORE DISPLAY (New Implementation) ***
                  Replaces the separate large score and linear progress bar elements.
                */}
                <div>
                    <div className="flex flex-col items-center justify-center pt-4 pb-6">
                        <div className="relative w-32 h-32 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                {/* Background Circle (Track) */}
                                <circle
                                    cx="50"
                                    cy="50"
                                    r={radius}
                                    fill="none"
                                    stroke="hsl(var(--muted))" 
                                    strokeWidth="10"
                                />
                                {/* Progress Arc (Fill) */}
                                <circle
                                    cx="50"
                                    cy="50"
                                    r={radius}
                                    fill="none"
                                    className={`${strokeColorClass}`} 
                                    strokeWidth="10"
                                    strokeLinecap="round"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={offset}
                                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                                />
                            </svg>
                            {/* Score Text in Center (Confirms "displaying score" requirement) */}
                            <div className="absolute flex flex-col items-center justify-center">
                                <span className={`text-4xl font-extrabold ${color}`}>{healthScore}</span>
                                <span className="text-sm font-semibold text-muted-foreground mt-0.5">/100</span>
                            </div>
                        </div>
                        {/* Status Badge (Moved to below the gauge) */}
                        <p className="font-body text-sm text-muted-foreground mt-2">
                            Overall Status: <Badge variant={badgeVariant} className="text-xs">{level}</Badge>
                        </p>
                    </div>

                    {/* *** REQUIRED MAINTENANCE ACTIONS (Retained) ***
                      Added border-t to create a clear visual separation below the gauge.
                    */}
                    <div className="mt-2 border-t pt-4"> 
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
                </div>

                {/* *** VIEW FULL MAINTENANCE PLAN LINK (Retained and pushed to bottom) ***
                */}
                <div className="mt-4">
                    <Link href={`/dashboard/properties/${property.id}/?tab=maintenance`} passHref>
                        <Button variant="link" className="p-0 h-auto font-body text-sm font-semibold flex items-center">
                            View Full Maintenance Plan <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}