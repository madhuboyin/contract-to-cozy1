// apps/frontend/src/app/(dashboard)/dashboard/components/HealthInsightList.tsx

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowRight, Settings, FileText, Wrench } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";

// High priority statuses mirrored from PropertyHealthScoreCard.tsx
// NOTE: 'Action Pending' is intentionally EXCLUDED from this list.
// Items with open bookings ('Action Pending') will be filtered out, 
// correctly removing them from the "Immediate Action Required" list.
const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data'];

interface HealthInsightListProps {
    property: ScoredProperty;
}

/**
 * Displays a filtered list of critical Health Score insights that require immediate action.
 */
export function HealthInsightList({ property }: HealthInsightListProps) {
    if (!property.healthScore) {
        return null;
    }

    // Filter for insights that match the high-priority statuses
    // This will now exclude items where status has been changed to 'Action Pending' by the backend
    const criticalInsights = property.healthScore.insights.filter(i => 
        HIGH_PRIORITY_STATUSES.includes(i.status)
    );

    if (criticalInsights.length === 0) {
        // If the health score is high, this component doesn't need to render
        return null;
    }

    return (
        <Card className="border-2 border-red-500 bg-red-50 shadow-lg">
            <CardContent className="p-4 sm:p-6">
                <h2 className="text-xl font-extrabold text-red-800 mb-4 flex items-center">
                    <ShieldAlert className="h-6 w-6 mr-2 flex-shrink-0 text-red-600" /> 
                    IMMEDIATE ACTION REQUIRED ({criticalInsights.length} Items)
                </h2>
                <p className="text-sm text-red-700 mb-4">
                    These issues are the **{criticalInsights.length} Required Maintenance Actions** flagged on your dashboard. Resolving them will directly increase your Health Score and reduce risk.
                </p>
                
                <ul className="space-y-3">
                    {criticalInsights.map((insight, index) => (
                        <li key={index} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white rounded-lg shadow-sm border border-red-100">
                            <div className="flex-1 pr-4 mb-2 sm:mb-0">
                                <p className="font-semibold text-gray-800">
                                    {insight.factor}
                                </p>
                                <p className="text-sm text-red-600 font-medium mt-1">
                                    Status: **{insight.status}**
                                </p>
                            </div>
                            
                            {/* Contextual Action Button */}
                            {renderContextualButton(insight, property.id)}
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}

// Helper function to render a button based on the insight factor/status
const renderContextualButton = (insight: any, propertyId: string) => {
    
    // Actions related to scheduling professionals (Aging systems, structural issues)
    if (insight.status.includes('Inspection') || 
        insight.status.includes('Review') || 
        insight.factor.includes('HVAC') ||
        insight.factor.includes('Roof') ||
        insight.factor.includes('Water Heater')) {
        
        // Use the insight factor to pre-filter the provider search
        const category = insight.factor.includes('Age') ? 'General Maintenance' : insight.factor.replace(' Age', '');
        
        return (
            <Button size="sm" variant="destructive" asChild className="w-full sm:w-auto">
                <Link href={`/dashboard/providers?category=${category}`}>
                    Find Professional <Wrench className="ml-2 h-4 w-4" />
                </Link>
            </Button>
        );
    }
    
    // Actions related to updating missing data (Safety, Appliances, Documents)
    if (insight.factor.includes('Safety') || 
        insight.factor.includes('Documents') || 
        insight.status.includes('Missing Data')) {
        
        return (
            <Button size="sm" variant="default" asChild className="w-full sm:w-auto">
                <Link href={`/dashboard/properties/${propertyId}/edit`}>
                    Update Profile Data <Settings className="ml-2 h-4 w-4" />
                </Link>
            </Button>
        );
    }

    // Default action for less specific issues
    return (
        <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
             <Link href={`/dashboard/checklist`}>
                View Checklist <ArrowRight className="ml-2 h-4 w-4" />
             </Link>
        </Button>
    );
};