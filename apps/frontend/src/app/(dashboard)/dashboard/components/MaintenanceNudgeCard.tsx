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
}

// Logic mirrored from PropertyHealthScoreCard.tsx to calculate high-priority actions
//const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection'];
const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data'];

export function MaintenanceNudgeCard({ property }: MaintenanceNudgeCardProps) {
    // Ensure healthScore data exists before proceeding
    if (!property.healthScore) {
        return null;
    }

    const healthScore = property.healthScore.totalScore || 0;
    const requiredActions = property.healthScore.insights.filter(i => 
        HIGH_PRIORITY_STATUSES.includes(i.status)
    ).length || 0;
    
    // Determine if the card should be shown (low score OR high required actions).
    // The cutoff is set at < 70 (FAIR/POOR) or any required actions exist.
    const shouldShowNudge = requiredActions > 0 || healthScore < 70;

    if (!shouldShowNudge) {
        return null; 
    }

    const urgencyLevel = requiredActions > 2 || healthScore < 50 ? 'high' : 'moderate';
    const bgColor = urgencyLevel === 'high' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200';
    const textColor = urgencyLevel === 'high' ? 'text-red-700' : 'text-orange-700';
    const iconColor = urgencyLevel === 'high' ? 'text-red-600' : 'text-orange-500';

    const titleText = urgencyLevel === 'high' 
        ? `Immediate Attention Required for ${property.name || 'Your Property'}`
        : `Proactive Maintenance Recommended for ${property.name || 'Your Property'}`;

    const bodyText = requiredActions > 0 
        ? `Our assessment shows ${requiredActions} high-priority actions impacting your health score of ${healthScore}/100. Automating maintenance is the best way to address these risks.`
        : `Your Health Score of ${healthScore}/100 indicates aging systems. Setting up a maintenance plan now will prevent future costly failures.`;


    return (
        <Card className={`border-2 ${bgColor}`}>
            <CardContent className="flex items-center justify-between p-4 sm:p-6">
                <div className="flex items-start space-x-4">
                    <ShieldAlert className={`h-8 w-8 flex-shrink-0 ${iconColor}`} />
                    <div>
                        <h3 className={`text-lg font-bold ${textColor} mb-1 flex items-center`}>
                            {titleText}
                            {requiredActions > 0 && (
                                <Badge variant="destructive" className="ml-3 text-sm">
                                    {requiredActions} ACTIONS PENDING
                                </Badge>
                            )}
                        </h3>
                        <p className={`text-sm ${textColor}`}>
                            {bodyText}
                        </p>
                    </div>
                </div>
                <Link 
                    href={`/dashboard/maintenance-setup`}
                    className="flex-shrink-0 ml-4"
                >
                    <Button 
                        size="sm" 
                        variant={urgencyLevel === 'high' ? 'destructive' : 'default'}
                        className="flex items-center whitespace-nowrap"
                    >
                        Set Up Maintenance Plan <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                </Link>
            </CardContent>
        </Card>
    );
}