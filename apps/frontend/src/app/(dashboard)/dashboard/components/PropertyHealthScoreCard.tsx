// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Shield, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import React from 'react';

// Helper function (assuming it exists in a utility file for consistency)
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

export function PropertyHealthScoreCard({ property }: PropertyHealthScoreCardProps) {
    const healthScore = property.healthScore?.totalScore || 0;
    const { level, color, progressClass, badgeVariant } = getHealthDetails(healthScore);
    
    // Normalize score for progress bar (full bar = 100)
    const progressValue = healthScore > 100 ? 100 : healthScore;
    
    // Determine number of required actions
    const totalRequiredActions = property.healthScore?.insights.filter(i => i.status === 'NEEDS_ATTENTION').length || 0;

    return (
        <Card className="flex flex-col h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium">
                    {property.name || 'Primary Home'} Health Score
                </CardTitle>
                <Shield className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-between pt-0">
                
                <div className="flex items-end justify-between">
                    <div className="space-y-1">
                         <div className="text-4xl font-extrabold flex items-baseline">
                            <span className={color}>{healthScore}</span>
                            <span className="text-xl font-semibold text-muted-foreground ml-1">/100</span>
                        </div>
                        <Badge variant={badgeVariant} className="text-xs">
                            {level}
                        </Badge>
                    </div>
                   
                    <div className="text-right">
                        <p className="text-xl font-bold text-red-600">
                            {totalRequiredActions}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Maintenance Actions
                        </p>
                    </div>
                </div>
                
                <div className="mt-4">
                    <Progress 
                        value={progressValue} 
                        className="h-2" 
                        indicatorClassName={progressClass} 
                    />
                    <Link href={`/dashboard/properties/${property.id}/`} passHref>
                        <Button variant="link" className="p-0 h-auto mt-2 text-sm font-semibold">
                            View Maintenance Plan <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}