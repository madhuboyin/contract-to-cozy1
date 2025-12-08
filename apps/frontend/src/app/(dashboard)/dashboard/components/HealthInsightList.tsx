// apps/frontend/src/app/(dashboard)/dashboard/components/HealthInsightList.tsx
// UPDATED: Softer "Proactive Maintenance" messaging to match dashboard

import React from 'react';
import Link from 'next/link';
import { Shield, ArrowRight, Settings, Wrench } from 'lucide-react'; 
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";

const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'];

interface HealthInsightListProps {
    property: ScoredProperty;
}

/**
 * Displays a filtered list of Health Score insights with proactive maintenance recommendations.
 * UPDATED: Changed from urgent "IMMEDIATE ACTION" to softer "Proactive Maintenance" messaging
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
        return null;
    }

    return (
        <Card className="border-2 border-blue-500 bg-blue-50 shadow-lg">
            <CardContent className="p-4 sm:p-6">
                <h2 className="text-xl font-extrabold text-blue-800 mb-4 flex items-center">
                    <Shield className="h-6 w-6 mr-2 flex-shrink-0 text-blue-600" /> 
                    Proactive Maintenance Recommended ({criticalInsights.length} Items)
                </h2>
                <p className="text-sm text-blue-700 mb-4">
                    These maintenance actions will directly increase your Health Score and reduce risk.
                </p>
                
                <ul className="space-y-3">
                    {criticalInsights.map((insight, index) => (
                        <li key={index} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white rounded-lg shadow-sm border border-blue-100">
                            <div className="flex-1 pr-4 mb-2 sm:mb-0">
                                <p className="font-semibold text-gray-800">
                                    {insight.factor}
                                </p>
                                <p className="text-sm text-blue-600 font-medium mt-1">
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
    
    // Appliance warranty actions - redirect to warranties page
    if (insight.factor.includes('Appliances') && insight.status === 'Needs Warranty') {
        return (
            <Button size="sm" variant="default" asChild className="w-full sm:w-auto">
                <Link href={`/dashboard/warranties?propertyId=${propertyId}`}>
                    Manage Appliance Warranties <Shield className="ml-2 h-4 w-4" />
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
        
        // Granular Category Mapping to match DB enums
        if (insight.factor.includes('HVAC')) {
            category = 'HVAC';
        } else if (insight.factor.includes('Roof')) {
            category = 'INSPECTION'; 
        } else if (insight.factor.includes('Water Heater')) {
            category = 'PLUMBING'; 
        } else {
            category = 'HANDYMAN'; 
        }
        
        const providerSearchLink = {
            pathname: '/dashboard/providers',
            query: {
                category: category,
                insightFactor: insight.factor,
                propertyId: propertyId
            }
        };
    
        return (
            <Button size="sm" variant="default" asChild className="w-full sm:w-auto">
                <Link href={providerSearchLink}>
                    Find Professional <Wrench className="ml-2 h-4 w-4" />
                </Link>
            </Button>
        );
    }
    
    // Actions related to updating missing data (Safety, Documents)
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

    // Default action
    return (
        <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
             <Link href={`/dashboard/maintenance?propertyId=${propertyId}`}>
                View Maintenance <ArrowRight className="ml-2 h-4 w-4" />
             </Link>
        </Button>
    );
};