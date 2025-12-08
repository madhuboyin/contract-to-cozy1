// apps/frontend/src/app/(dashboard)/dashboard/components/MaintenanceNudgeCard.tsx
import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import { Badge } from '@/components/ui/badge';

interface MaintenanceNudgeCardProps {
    property: ScoredProperty;
    // FIX 1: Prop to receive the consolidated action count (Health Insights + Checklist + Renewals)
    consolidatedActionCount: number;
}

// NOTE: This constant is only for filtering *Health Score Insights* internally.
const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty']; 

export function MaintenanceNudgeCard({ property, consolidatedActionCount }: MaintenanceNudgeCardProps) {
    // Ensure healthScore data exists before proceeding
    if (!property.healthScore) {
        return null;
    }

    const healthScore = property.healthScore.totalScore || 0;
    
    // FIX 2: Implement the new combined logic based on the user's proposal:
    // Show card ONLY IF score is poor (< 70) AND there is any consolidated action.
    const shouldShowNudge = healthScore < 70 && consolidatedActionCount > 0;

    if (!shouldShowNudge) {
        return null; 
    }

    const urgencyLevel = consolidatedActionCount > 2 || healthScore < 50 ? 'high' : 'moderate';
    const bgColor = urgencyLevel === 'high' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200';
    const textColor = urgencyLevel === 'high' ? 'text-red-700' : 'text-orange-700';
    const iconColor = urgencyLevel === 'high' ? 'text-red-600' : 'text-orange-500';

    const titleText = urgencyLevel === 'high' 
        ? `Immediate Attention Required for ${property.name || 'Your Property'}`
        : `Proactive Maintenance Recommended for ${property.name || 'Your Property'}`;

    // FIX 3: Update body text to reflect the full action scope
    const bodyText = consolidatedActionCount > 0 
        ? `Your Health Score of ${healthScore}/100 is poor, and our analysis shows ${consolidatedActionCount} outstanding maintenance and renewal actions required.`
        : `Your Health Score of ${healthScore}/100 indicates aging systems. Setting up a maintenance plan now will prevent future costly failures.`;


    return (
        <Card className={`border-2 ${bgColor}`}>
            <CardContent className="flex items-center justify-between p-4 sm:p-6">
                <div className="flex items-start space-x-4">
                    <ShieldAlert className={`h-8 w-8 flex-shrink-0 ${iconColor}`} />
                    <div>
                        <h3 className={`text-lg font-bold ${textColor} mb-1 flex items-center`}>
                            {titleText}
                            {consolidatedActionCount > 0 && (
                                <Badge variant="destructive" className="ml-3 text-sm">
                                    {consolidatedActionCount} ACTIONS PENDING
                                </Badge>
                            )}
                        </h3>
                        <p className={`text-sm ${textColor}`}>
                            {bodyText}
                        </p>
                    </div>
                </div>
                <Link 
                    // FIX: Navigate to the central maintenance list page, filtered by property ID.
                    // This page displays ALL Checklist items and Renewals.
                    href={`/dashboard/properties/${property.id}/?tab=maintenance&priority=true`}
                    className="flex-shrink-0 ml-4"
                >
                    <Button 
                        size="sm" 
                        variant={urgencyLevel === 'high' ? 'destructive' : 'default'}
                        className="flex items-center whitespace-nowrap"
                    >
                        View Action Plan <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                </Link>
            </CardContent>
        </Card>
    );
}