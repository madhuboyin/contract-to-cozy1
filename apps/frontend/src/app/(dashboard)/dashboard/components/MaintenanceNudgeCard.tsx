// apps/frontend/src/app/(dashboard)/dashboard/components/MaintenanceNudgeCard.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";

interface MaintenanceNudgeCardProps {
    property: ScoredProperty;
    consolidatedActionCount: number;
}

export function MaintenanceNudgeCard({ property, consolidatedActionCount }: MaintenanceNudgeCardProps) {
    // Ensure healthScore data exists
    if (!property.healthScore) {
        return null;
    }

    const healthScore = property.healthScore.totalScore || 0;
    const propertyName = property.name || 'Your Home';
    
    // Show card ONLY IF score is poor (< 70) AND there are actions
    const shouldShowNudge = healthScore < 70 && consolidatedActionCount > 0;
    
    if (!shouldShowNudge) {
        return null;
    }

    // Determine severity and colors
    const getSeverityStyles = () => {
        if (healthScore < 70) {
            return {
                background: 'bg-gradient-to-r from-orange-50 to-yellow-50',
                border: 'border-orange-200',
                borderLeft: 'border-l-orange-500',
                icon: 'text-orange-600',
                badge: 'bg-orange-600',
                buttonBorder: 'border-orange-300 hover:border-orange-400 hover:bg-orange-50',
                buttonText: 'text-orange-700'
            };
        } else {
            return {
                background: 'bg-gradient-to-r from-yellow-50 to-amber-50',
                border: 'border-yellow-200',
                borderLeft: 'border-l-yellow-500',
                icon: 'text-yellow-600',
                badge: 'bg-yellow-600',
                buttonBorder: 'border-yellow-300 hover:border-yellow-400 hover:bg-yellow-50',
                buttonText: 'text-yellow-700'
            };
        }
    };

    const styles = getSeverityStyles();
    const actionText = consolidatedActionCount === 1 ? 'action' : 'actions';
    const badgeText = consolidatedActionCount > 5 ? '5+ PENDING' : `${consolidatedActionCount} PENDING`;

    return (
        <div className={`
            w-full h-[80px] 
            ${styles.background}
            border-2 ${styles.border}
            border-l-4 ${styles.borderLeft}
            rounded-xl shadow-sm
            px-5 py-4
            flex flex-col justify-center gap-2
            hover:shadow-md
            transition-all duration-150
        `}>
            {/* Line 1: Icon + Title + Badge */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <AlertTriangle className={`h-5 w-5 ${styles.icon} flex-shrink-0`} />
                    <span className="text-[15px] font-semibold text-gray-900">
                        Property Attention Needed: Health Score {healthScore}/100
                    </span>
                </div>
                <div className={`
                    ${styles.badge} text-white
                    text-[11px] font-bold uppercase tracking-wide
                    px-2.5 py-1 rounded-full
                    flex-shrink-0
                `}>
                    {badgeText}
                </div>
            </div>

            {/* Line 2: Description + Button */}
            <div className="flex items-center justify-between">
                <span className="text-[13px] text-gray-600 ml-[30px]">
                    {consolidatedActionCount} unresolved property issues for {propertyName}
                </span>
                <Link href={`/dashboard/maintenance?propertyId=${property.id}&priority=true`}>
                    <button className={`
                        px-3.5 py-1.5
                        text-[13px] font-semibold ${styles.buttonText}
                        bg-white border-[1.5px] ${styles.buttonBorder}
                        rounded-md
                        inline-flex items-center gap-1
                        transition-all duration-150
                        hover:shadow-sm hover:-translate-y-px
                        flex-shrink-0
                    `}>
                        View Action Plan
                        <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                </Link>
            </div>
        </div>
    );
}