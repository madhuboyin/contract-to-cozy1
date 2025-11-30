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

// NOTE: Progress component is not used for the custom SVG speedometer
// import { Progress } from "@/components/ui/progress"; 

const getHealthDetails = (score: number) => {
    // ... (existing logic, ensured to return stroke- classes for clarity)
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

// Speedometer configuration constants
const RADIUS = 45;
const STROKE_WIDTH = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = CIRCUMFERENCE / 2; // Semi-circle is 1/2 the circumference

export function PropertyHealthScoreCard({ property }: PropertyHealthScoreCardProps) {
    const healthScore = property.healthScore?.totalScore || 0;
    const { level, color, progressClass, badgeVariant } = getHealthDetails(healthScore);
    const progressValue = healthScore > 100 ? 100 : healthScore;
    
    const totalRequiredActions = property.healthScore?.insights.filter(i => 
        HIGH_PRIORITY_STATUSES.includes(i.status)
    ).length || 0;

    const progressStrokeLength = (progressValue / 100) * ARC_LENGTH;
    const progressOffset = ARC_LENGTH - progressStrokeLength;
    
    // Needle Rotation: Maps 0-100 to an angle range of 180 degrees.
    // Score 0 is -90deg (pointing left). Score 100 is +90deg (pointing right).
    const needleAngle = (progressValue / 100) * 180 - 90;

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
            <CardContent className="flex-1 flex flex-col justify-between">
                
                {/* *** SPEEDOMETER DISPLAY FIXES *** */}
                <div className="flex flex-col items-center justify-center pt-4 pb-6">
                    {/* Increased container size and added a definitive 2:1 aspect for the SVG display */}
                    <div className="relative w-40 h-20 overflow-hidden -mb-2"> 
                        <svg 
                            className="w-full h-full transform rotate-180" 
                            viewBox="0 0 100 50" // viewBox adjusted for the semi-circle geometry (center at 50,50, showing top half)
                            preserveAspectRatio="xMidYMax meet" // Ensures it fits correctly within the container
                        >
                            {/* Base Track (Semi-Circle Arc) */}
                            <circle
                                cx="50"
                                cy="50"
                                r={RADIUS}
                                fill="none"
                                stroke="hsl(var(--muted))" 
                                strokeWidth={STROKE_WIDTH}
                                strokeDasharray={ARC_LENGTH} 
                                strokeDashoffset={0} 
                            />
                            {/* Progress Arc (Color Fill) */}
                            <circle
                                cx="50"
                                cy="50"
                                r={RADIUS}
                                fill="none"
                                className={progressClass} 
                                strokeWidth={STROKE_WIDTH}
                                strokeLinecap="round"
                                strokeDasharray={ARC_LENGTH} 
                                strokeDashoffset={progressOffset} 
                                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                            />
                        </svg>
                        
                        {/* Needle (The Pointer) - Adjusted positioning for better centering */}
                        <div 
                            className="absolute left-1/2 top-full transform -translate-x-1/2 -translate-y-full origin-bottom transition-transform duration-500 ease-in-out"
                            style={{ 
                                // Needle pivots from the bottom center of the SVG
                                transform: `translateX(-50%) translateY(0%) rotate(${needleAngle}deg)`,
                                transformOrigin: 'center 100%',
                            }}
                        >
                            <div className={`w-[2px] h-[50px] ${progressClass.replace('stroke-', 'bg-')} rounded-t-full`}></div>
                            <div className="w-3 h-3 bg-card border-2 border-primary rounded-full absolute -bottom-1 left-1/2 transform -translate-x-1/2"></div>
                        </div>

                        {/* Score Text in Center (Positioned near the base of the speedometer) */}
                        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 flex flex-col items-center justify-center translate-y-2">
                            <span className={`text-3xl font-extrabold ${color}`}>{healthScore}</span>
                            <span className="text-xs font-semibold text-muted-foreground mt-0.5">/100</span>
                        </div>
                    </div>
                    
                    {/* Status Badge */}
                    <p className="font-body text-sm text-muted-foreground mt-8">
                        Overall Status: <Badge variant={badgeVariant} className="text-xs">{level}</Badge>
                    </p>
                </div>

                {/* *** REQUIRED MAINTENANCE ACTIONS (Retained) *** */}
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

                {/* *** VIEW FULL MAINTENANCE PLAN LINK (Retained) *** */}
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