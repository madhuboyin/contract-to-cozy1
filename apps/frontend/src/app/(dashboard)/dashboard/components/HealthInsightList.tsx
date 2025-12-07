// apps/frontend/src/app/(dashboard)/dashboard/components/HealthInsightList.tsx

import React from 'react';
import Link from 'next/link';
// Added ShieldAlert, Wrench, Settings, ArrowRight are already used
import { ShieldAlert, ArrowRight, Settings, FileText, Wrench } from 'lucide-react'; 
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";

// FIX 1: Add 'Needs Warranty' to the critical status list
const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'];

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
    
    // FIX 2: Check for the new 'Needs Warranty' status and provide the appropriate CTA.
    if (insight.status === 'Needs Warranty') {
        return (
            <Button size="sm" variant="destructive" asChild className="w-full sm:w-auto">
                <Link href="/dashboard/warranties/new">
                    Buy Warranty Protection <ShieldAlert className="ml-2 h-4 w-4" />
                </Link>
            </Button>
        );
    }
    
    // Logic for Repair/Inspection/Review actions
    const requiresService = insight.status.includes('Inspection') || 
                            insight.status.includes('Review') || 
                            insight.factor.includes('HVAC') ||
                            insight.factor.includes('Roof') ||
                            insight.factor.includes('Water Heater');

    const requiresAttention = insight.status === 'Needs Attention' && insight.factor === 'Exterior';
    
    if (requiresService || requiresAttention) {
        
        let category: string;
        
        // FIX 3: Granular Category Mapping to fix filter and backend resolution.
        if (insight.factor.includes('HVAC')) {
            category = 'HVAC';
        } else if (insight.factor.includes('Roof')) {
            // Roof inspections/repairs map closest to the INSPECTION category in the DB enums.
            category = 'INSPECTION'; 
        } else if (insight.factor.includes('Water Heater')) {
            category = 'PLUMBING'; 
        } else {
            // Default for 'Age Factor' or 'Exterior' repair actions.
            category = 'HANDYMAN'; 
        }
        
        // FIX 4: Include the original 'insightFactor' and 'propertyId' in the URL 
        // to provide the necessary context to the booking system.
        const encodedFactor = encodeURIComponent(insight.factor);
        
        return (
            <Button size="sm" variant="destructive" asChild className="w-full sm:w-auto">
                <Link href={`/dashboard/providers?category=${category}&insightFactor=${encodedFactor}&propertyId=${propertyId}`}>
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