// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx
// FIX: Added h-full flex flex-col to Card for equal height in grid

"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
// Re-importing Progress (though we use SVG for the gauge icon)
import { Progress } from "@/components/ui/progress"; 
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Shield, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import React from 'react';

// Adjusted to return stroke- classes for the SVG gauge color, ensuring contrast
const getHealthDetails = (score: number) => {
    if (score >= 85) {
        return { level: "EXCELLENT", color: "text-green-500", progressClass: "stroke-green-500", badgeVariant: "success" as const };
    } else if (score >= 70) {
        return { level: "GOOD", color: "text-blue-500", progressClass: "stroke-blue-500", badgeVariant: "secondary" as const };
    } else if (score >= 50) {
        return { level: "FAIR", color: "text-yellow-500", progressClass: "stroke-yellow-500", badgeVariant: "secondary" as const };
    } else {
        return { level: "POOR", color: "text-red-500", progressClass: "stroke-red-500", badgeVariant: "destructive" as const };
    }
};

interface PropertyHealthScoreCardProps {
    property: ScoredProperty;
}

const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection'];

// Circular Gauge configuration constants
const RADIUS = 45; 
const STROKE_WIDTH = 10; 
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PropertyHealthScoreCard({ property }: PropertyHealthScoreCardProps) {
    const healthScore = property.healthScore?.totalScore || 0;
    const { level, color, progressClass, badgeVariant } = getHealthDetails(healthScore);
    const progressValue = healthScore > 100 ? 100 : healthScore;
    
    const totalRequiredActions = property.healthScore?.insights.filter(i => 
        HIGH_PRIORITY_STATUSES.includes(i.status)
    ).length || 0;

    const offset = CIRCUMFERENCE - (progressValue / 100) * CIRCUMFERENCE;

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
            {/* Retained flex flex-col justify-between to manage content layout */}
            <CardContent className="flex-1 flex flex-col justify-between">
                
                {/* *** GAUGE ICON AND SCORE DISPLAY (Circular Gauge) *** */}
                <div className="flex flex-col items-center justify-center pt-4 pb-6">
                    <div className="relative w-32 h-32 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            {/* Background Circle (Track) */}
                            <circle
                                cx="50"
                                cy="50"
                                r={RADIUS}
                                fill="none"
                                stroke="hsl(var(--muted))" 
                                strokeWidth={STROKE_WIDTH}
                            />
                            {/* Progress Arc (Fill) - Color added based on score */}
                            <circle
                                cx="50"
                                cy="50"
                                r={RADIUS}
                                fill="none"
                                className={progressClass} // Dynamic color based on score
                                strokeWidth={STROKE_WIDTH}
                                strokeLinecap="round"
                                strokeDasharray={CIRCUMFERENCE}
                                strokeDashoffset={offset}
                                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                            />
                        </svg>
                        {/* Score Text in Center */}
                        <div className="absolute flex flex-col items-center justify-center">
                            <span className={`text-4xl font-extrabold ${color}`}>{healthScore}</span>
                            <span className="text-xl font-semibold text-muted-foreground ml-1">/100</span>
                        </div>
                    </div>
                    {/* Status Badge */}
                    <p className="font-body text-sm text-muted-foreground mt-2">
                        Overall Status: <Badge variant={badgeVariant} className="text-xs">{level}</Badge>
                    </p>
                </div>

                {/* *** REQUIRED MAINTENANCE ACTIONS (Font size reduced to text-xl) *** */}
                <div className="mt-2 border-t pt-4"> 
                    <div className="flex items-center justify-between">
                         <p className="font-body text-base font-semibold flex items-center whitespace-nowrap">
                            <Zap className="h-4 w-4 mr-1 text-red-600" />
                            Required Maintenance Actions
                        </p>
                        {/* REDUCED FONT SIZE HERE: from text-2xl to text-xl */}
                        <p className="text-xl font-extrabold text-red-600">
                            {totalRequiredActions}
                        </p>
                    </div>

                    <p className="font-body text-xs text-muted-foreground mt-1">
                        High-priority tasks identified in the last assessment.
                    </p>
                </div>

                {/* *** VIEW FULL MAINTENANCE PLAN LINK (MODIFIED) *** */}
                <div className="mt-4">
                    <Link 
                        // MODIFICATION: Appended &view=insights to the maintenance tab link
                        href={`/dashboard/properties/${property.id}/?tab=maintenance&view=insights`}
                        className="inline-flex items-center text-sm font-semibold text-primary hover:text-primary/80 transition-colors no-underline"
                    >
                        View Full Maintenance Plan <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}