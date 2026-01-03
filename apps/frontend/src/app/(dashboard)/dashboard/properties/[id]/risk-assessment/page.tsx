// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Property, RiskAssessmentReport, AssetRiskDetail, RiskCategory, PropertyMaintenanceTask, RecurrenceFrequency, MaintenanceTaskServiceCategory } from "@/types"; 
import { api } from "@/lib/api/client";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading } from "@/components/page-header";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Zap, Shield, Loader2, DollarSign, Download, ArrowLeft, Home, Zap as ZapIcon, Siren, CheckCircle, Calendar } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import React, { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { MaintenanceConfigModal } from "../../../maintenance-setup/MaintenanceConfigModal"; 

// --- Types for Query Data ---
type RiskReportFull = RiskAssessmentReport; 
// The API returns either the raw report object (RiskReportFull) or the string 'QUEUED'
type RiskQueryData = RiskAssessmentReport | 'QUEUED'; 

// --- Helper Functions ---
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);

const getRiskDetails = (score: number) => {
    if (score >= 80) return { level: "LOW", color: "text-green-500", progressClass: "bg-green-500", badgeVariant: "success" };
    if (score >= 60) return { level: "MODERATE", color: "text-yellow-500", progressClass: "bg-yellow-500", badgeVariant: "warning" };
    if (score >= 40) return { level: "ELEVATED", color: "text-orange-500", progressClass: "bg-orange-500", badgeVariant: "destructive" };
    return { level: "HIGH", color: "text-red-500", progressClass: "bg-red-500", badgeVariant: "destructive" };
};

// 🔑 NEW: Map system types to maintenance service categories
const getServiceCategoryForAsset = (systemType: string): MaintenanceTaskServiceCategory => {
    const categoryMap: Record<string, MaintenanceTaskServiceCategory> = {
        'HVAC_FURNACE': 'HVAC',
        'HVAC_HEAT_PUMP': 'HVAC',
        'WATER_HEATER_TANK': 'PLUMBING',
        'WATER_HEATER_TANKLESS': 'PLUMBING',
        'ROOF_SHINGLE': 'ROOFING',
        'ROOF_TILE_METAL': 'ROOFING',
        'ELECTRICAL_PANEL_MODERN': 'ELECTRICAL',
        'ELECTRICAL_PANEL_OLD': 'ELECTRICAL',
        'SAFETY_SMOKE_CO_DETECTORS': 'HANDYMAN',
        'MAJOR_APPLIANCE_FRIDGE': 'APPLIANCE_REPAIR',
        'MAJOR_APPLIANCE_DISHWASHER': 'APPLIANCE_REPAIR',
    };
    return categoryMap[systemType] || 'HANDYMAN';
};

// 🔑 NEW: Component to show scheduled status
const ScheduledBadge: React.FC<{ task: PropertyMaintenanceTask }> = ({ task }) => (
    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 border border-green-200">
        <CheckCircle className="h-3 w-3 text-green-600" />
        <span className="text-xs font-medium text-green-700">Scheduled</span>
    </div>
);


// --- Component for Phase 3.3: Risk Category Summary Card ---
/**
 * Category Health Summary Card
 * Shows overall risk status for a category (STRUCTURE, SYSTEMS, SAFETY, FINANCIAL_GAP)
 * No CTAs - this is a summary card only. Actions are in the table above.
 */
const RiskCategorySummaryCard = ({ 
    category, 
    details, 
    riskIcon: RiskIcon,
}: { 
    category: RiskCategory; 
    details: AssetRiskDetail[]; 
    riskIcon: React.ElementType;
}) => {
    
    // 🔑 SPECIAL HANDLING: FINANCIAL_GAP is cross-category analysis
    if (category === 'FINANCIAL_GAP') {
        // Analyze coverage gaps across ALL categories
        const allAssets = details; // All assets regardless of category
        
        // Assets with coverage factor < 0.5 (less than 50% covered) or high out-of-pocket costs
        const highExposureAssets = allAssets.filter(asset => {
            // High exposure = coverage factor is low (closer to 0) OR out-of-pocket > $500
            return asset.coverageFactor < 0.5 || asset.outOfPocketCost > 500;
        });
        
        // Calculate total unprotected exposure
        const totalGapExposure = highExposureAssets.reduce((sum, asset) => sum + asset.outOfPocketCost, 0);
        const formattedGapExposure = formatCurrency(totalGapExposure);
        
        let title: string;
        let description: string;
        let badgeStatus: string;
        let badgeColor: 'default' | 'success' | 'warning' | 'destructive' = 'default';
        
        if (allAssets.length === 0) {
            // No assets at all - need property data
            title = 'FINANCIAL GAP Data Missing';
            description = 'Add property details to analyze coverage gaps.';
            badgeStatus = 'INFO';
            badgeColor = 'default';
        } else if (highExposureAssets.length === 0) {
            // Great coverage!
            title = 'FINANCIAL GAP Analysis';
            description = 'Good warranty and insurance coverage detected.';
            badgeStatus = 'GOOD';
            badgeColor = 'success';
        } else if (highExposureAssets.length >= 3 || totalGapExposure > 5000) {
            // High exposure - multiple items or high dollar amount
            title = 'FINANCIAL GAP Analysis';
            description = `High unprotected exposure detected. Consider comprehensive warranty coverage.`;
            badgeStatus = 'HIGH';
            badgeColor = 'destructive';
        } else {
            // Moderate exposure
            title = 'FINANCIAL GAP Analysis';
            description = `Some items lack adequate coverage. Review warranty options.`;
            badgeStatus = 'MODERATE';
            badgeColor = 'warning';
        }
        
        return (
            <Card className="flex flex-col justify-between">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex justify-between items-start">
                        {title}
                        <RiskIcon className="h-5 w-5 text-muted-foreground ml-2" />
                    </CardTitle>
                    <CardDescription className="text-xs min-h-[30px]">
                        {description}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-sm text-muted-foreground">
                            {allAssets.length} {allAssets.length === 1 ? 'item' : 'items'} analyzed
                        </span>
                        <Badge variant={badgeColor as any}>
                            {badgeStatus.toUpperCase()}
                        </Badge>
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    // 🔑 STANDARD CATEGORY LOGIC: STRUCTURE, SYSTEMS, SAFETY
    const relevantAssets = details.filter(item => item.category === category);
    
    const totalExposure = relevantAssets.reduce((sum, item) => sum + item.riskDollar, 0);
    const formattedExposure = formatCurrency(totalExposure);
    const itemCount = relevantAssets.length;

    // Determine overall category risk level
    const highRiskCount = relevantAssets.filter(a => a.riskLevel === 'HIGH').length;
    const moderateRiskCount = relevantAssets.filter(a => a.riskLevel === 'MODERATE' || a.riskLevel === 'ELEVATED').length;
    
    let title: string;
    let description: string;
    let badgeStatus: string;
    let badgeColor: 'default' | 'success' | 'warning' | 'destructive' = 'default';

    if (relevantAssets.length === 0) {
        // No data available
        title = `${category.replace(/_/g, ' ')} Data Missing`;
        description = `No component data available for this category.`;
        badgeStatus = 'INFO';
        badgeColor = 'default';
    } else if (highRiskCount > 0) {
        // Has high risk items
        title = `${category.replace(/_/g, ' ')} Risk`;
        description = `${highRiskCount} ${highRiskCount === 1 ? 'item requires' : 'items require'} attention. Total exposure: ${formattedExposure}.`;
        badgeStatus = 'HIGH';
        badgeColor = 'destructive';
    } else if (moderateRiskCount > 0) {
        // Has moderate risk items
        title = `${category.replace(/_/g, ' ')} Risk`;
        description = `${moderateRiskCount} ${moderateRiskCount === 1 ? 'item' : 'items'} with moderate risk. Total exposure: ${formattedExposure}.`;
        badgeStatus = 'MODERATE';
        badgeColor = 'warning';
    } else {
        // All low risk
        title = `${category.replace(/_/g, ' ')} Health`;
        description = `All components are currently low risk. Exposure: ${formattedExposure}.`;
        badgeStatus = 'GOOD';
        badgeColor = 'success';
    }
    
    return (
        <Card className="flex flex-col justify-between">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex justify-between items-start">
                    {title}
                    <RiskIcon className="h-5 w-5 text-muted-foreground ml-2" />
                </CardTitle>
                <CardDescription className="text-xs min-h-[30px]">
                    {description}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-muted-foreground">
                        {itemCount} {itemCount === 1 ? 'item' : 'items'} monitored
                    </span>
                    <Badge variant={badgeColor as any}>
                        {badgeStatus.toUpperCase()}
                    </Badge>
                </div>
            </CardContent>
        </Card>
    );
}

// --- Component for Phase 3.2: Detailed Asset Matrix Table ---
const AssetMatrixTable = ({ 
    details, 
    tasksBySystemType,
    bookingsByInsightFactor,
    warrantiesBySystemType, // 🔑 NEW
    onScheduleInspection, 
    onViewTask,
    onViewBooking,
}: { 
    details: AssetRiskDetail[];
    tasksBySystemType: Map<string, PropertyMaintenanceTask>;
    bookingsByInsightFactor: Map<string, any>;
    warrantiesBySystemType: Map<string, any>; // 🔑 NEW
    onScheduleInspection: (asset: AssetRiskDetail) => void;
    onViewTask: (task: PropertyMaintenanceTask) => void;
    onViewBooking: (booking: any) => void;
}) => {
    const getRiskBadge = (level: AssetRiskDetail['riskLevel']) => {
        if (level === 'LOW') return <Badge variant="secondary" className="bg-green-500/20 text-green-700 hover:bg-green-500/30 border-green-500">Low</Badge>;
        if (level === 'MODERATE') return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 hover:bg-yellow-500/30 border-yellow-500">Moderate</Badge>;
        if (level === 'ELEVATED') return <Badge variant="secondary" className="bg-orange-500/20 text-orange-700 hover:bg-orange-500/30 border-orange-500">Elevated</Badge>;
        if (level === 'HIGH') return <Badge variant="secondary" className="bg-red-500/20 text-red-700 hover:bg-red-500/30 border-red-500">High</Badge>;
        return <Badge variant="secondary">N/A</Badge>;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Detailed Asset Risk Matrix</CardTitle>
                <CardDescription>A component-by-component breakdown of your home's risks, exposure, and potential actions.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="w-full overflow-x-auto">
                    <Table className="w-full table-auto">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="whitespace-nowrap">Asset</TableHead>
                                <TableHead className="whitespace-nowrap">Category</TableHead>
                                <TableHead className="whitespace-nowrap">Age / Expected Life</TableHead>
                                <TableHead className="whitespace-nowrap">Risk Level</TableHead>
                                <TableHead className="whitespace-nowrap">Out-of-Pocket Exposure</TableHead>
                                <TableHead className="whitespace-nowrap">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {details.map((item, index) => {
                                // 🔑 Check if booking exists for this asset
                                const insightFactor = item.assetName.replace(/_/g, ' ');
                                const existingBooking = bookingsByInsightFactor.get(insightFactor);
                                const hasBooking = !!existingBooking;
                                
                                // 🔑 Check if task exists for this asset
                                const existingTask = tasksBySystemType.get(item.systemType);
                                const hasTask = !!existingTask;

                                // 🔑 NEW: Check if warranty exists for this asset
                                const existingWarranty = warrantiesBySystemType.get(item.systemType);
                                const hasWarranty = !!existingWarranty;
                                const isPastLife = item.age > item.expectedLife;
                                
                                // 🔑 NEW: Determine CTA based on warranty status
                                let ctaText = '';
                                let ctaVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';
                                
                                if (hasBooking) {
                                    ctaText = 'View Booking';
                                    ctaVariant = 'outline';
                                } else if (hasTask) {
                                    ctaText = 'View Task';
                                    ctaVariant = 'outline';
                                } else if (hasWarranty) {
                                    // Has warranty
                                    if (isPastLife) {
                                        ctaText = 'Schedule Replacement';
                                        ctaVariant = item.riskLevel === 'HIGH' ? 'destructive' : 'default';
                                    } else {
                                        ctaText = 'Schedule Inspection';
                                        ctaVariant = 'secondary';
                                    }
                                } else {
                                    // No warranty
                                    if (item.riskLevel === 'HIGH' && item.outOfPocketCost > 1000) {
                                        ctaText = 'Add Home Warranty';
                                        ctaVariant = 'destructive';
                                    } else if (item.actionCta) {
                                        ctaText = item.actionCta;
                                        ctaVariant = item.riskLevel === 'HIGH' ? 'destructive' : 'secondary';
                                    } else {
                                        ctaText = 'Schedule Maintenance';
                                        ctaVariant = item.riskLevel === 'HIGH' ? 'destructive' : 'secondary';
                                    }
                                }

                                return (
                                    <TableRow key={index} className={item.riskLevel === 'HIGH' ? 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20' : ''}>
                                        <TableCell className="font-medium whitespace-normal break-words">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div>
                                                    {item.assetName.replace(/_/g, ' ')}
                                                    <div className="text-xs text-muted-foreground">{item.systemType.replace(/_/g, ' ')}</div>
                                                </div>
                                                {/* 🔑 Badge priority: Booking > Warranty > Task */}
                                                {hasBooking && (
                                                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-200">
                                                        <Calendar className="h-3 w-3 text-blue-600" />
                                                        <span className="text-xs font-medium text-blue-700">Booked</span>
                                                    </div>
                                                )}
                                                {!hasBooking && hasWarranty && (
                                                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 border border-purple-200">
                                                        <svg className="h-3 w-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                        </svg>
                                                        <span className="text-xs font-medium text-purple-700">
                                                            Warranty{isPastLife ? ' (won\'t cover)' : ''}
                                                        </span>
                                                    </div>
                                                )}
                                                {!hasBooking && !hasWarranty && hasTask && <ScheduledBadge task={existingTask} />}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                            {item.category.replace(/_/g, ' ')}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <span className="font-semibold">{item.age} yrs</span> / {item.expectedLife} yrs
                                            {isPastLife && <span className="text-red-500 text-xs ml-2">(Past Life)</span>}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {getRiskBadge(item.riskLevel)}
                                        </TableCell>
                                        <TableCell className="font-bold text-red-600 whitespace-nowrap">
                                            {formatCurrency(item.outOfPocketCost)}
                                            <div className="text-xs text-muted-foreground whitespace-normal">P: {item.probability.toFixed(2)} / C: {(item.coverageFactor * 100).toFixed(0)}%</div>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <Button 
                                                size="sm" 
                                                variant={ctaVariant}
                                                onClick={() => {
                                                    if (hasBooking) {
                                                        onViewBooking(existingBooking);
                                                    } else if (hasTask) {
                                                        onViewTask(existingTask);
                                                    } else {
                                                        onScheduleInspection(item);
                                                    }
                                                }}
                                                className="gap-1"
                                            >
                                                {(hasBooking || hasTask) && <Calendar className="h-3 w-3" />}
                                                {ctaText}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

// --- Main Page Component ---
export default function RiskAssessmentPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient(); // 🔑 NEW: For invalidating queries
    const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
    const { user } = useAuth(); 

    // Mock Premium Check (REPLACE with actual logic)
    const isPremium = user?.role === 'ADMIN';
    
    // 🔑 NEW: Modal state for creating tasks
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<AssetRiskDetail | null>(null);

    // 🔑 NEW: Fetch existing maintenance tasks for this property
    const { data: maintenanceTasksData, refetch: refetchTasks } = useQuery({
        queryKey: ['maintenance-tasks', propertyId],
        enabled: !!propertyId,
        queryFn: async () => {
            const response = await api.getMaintenanceTasks(propertyId, {
                includeCompleted: false,
            });
            return response.success ? response.data : [];
        },
    });

    // 🔑 Fetch existing bookings for this property
    const { data: bookingsData, refetch: refetchBookings } = useQuery({
        queryKey: ['bookings', propertyId],
        enabled: !!propertyId,
        queryFn: async () => {
            try {
                const response = await api.listBookings({ propertyId });
                if (response.success && response.data?.bookings) {
                    const bookings = response.data.bookings;
                    if (Array.isArray(bookings)) {
                        return bookings.filter((b: any) => 
                            ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status)
                        );
                    }
                }
                return [];
            } catch (error) {
                console.error('Error fetching bookings:', error);
                return [];
            }
        },
    });

    // 🔑 NEW: Fetch warranties for this property
    const { data: warrantiesData, refetch: refetchWarranties } = useQuery({
        queryKey: ['warranties', propertyId],
        enabled: !!propertyId,
        queryFn: async () => {
            try {
                const response = await api.listWarranties(propertyId);
                if (response.success && response.data?.warranties) {
                    const warranties = response.data.warranties;
                    if (Array.isArray(warranties)) {
                        // Filter for active warranties only
                        const now = new Date();
                        return warranties.filter((w: any) => {
                            const expiryDate = new Date(w.expiryDate);
                            return expiryDate > now && w.status === 'ACTIVE';
                        });
                    }
                }
                return [];
            } catch (error) {
                console.error('Error fetching warranties:', error);
                return [];
            }
        },
    });

    const maintenanceTasks = Array.isArray(maintenanceTasksData) ? maintenanceTasksData : [];
    const activeBookings = Array.isArray(bookingsData) ? bookingsData : [];
    const activeWarranties = Array.isArray(warrantiesData) ? warrantiesData : [];

    // 🔑 Create lookup map: systemType -> task
    const tasksBySystemType = new Map<string, PropertyMaintenanceTask>();
    if (Array.isArray(maintenanceTasks)) {
        maintenanceTasks.forEach(task => {
            if (task.assetType) {
                tasksBySystemType.set(task.assetType, task);
            }
        });
    }

    // 🔑 Create lookup map: insightFactor -> booking
    const bookingsByInsightFactor = new Map<string, any>();
    if (Array.isArray(activeBookings)) {
        activeBookings.forEach((booking: any) => {
            if (booking.insightFactor) {
                bookingsByInsightFactor.set(booking.insightFactor, booking);
            }
        });
    }

    // 🔑 NEW: Create lookup map: systemType -> warranty (for badge display)
    const warrantiesBySystemType = new Map<string, any>();
    if (Array.isArray(activeWarranties)) {
        activeWarranties.forEach((warranty: any) => {
            // Map warranty category to system types
            if (warranty.category === 'HVAC') {
                warrantiesBySystemType.set('HVAC_FURNACE', warranty);
                warrantiesBySystemType.set('HVAC_HEAT_PUMP', warranty);
            } else if (warranty.category === 'PLUMBING') {
                warrantiesBySystemType.set('WATER_HEATER_TANK', warranty);
                warrantiesBySystemType.set('WATER_HEATER_TANKLESS', warranty);
            } else if (warranty.category === 'ELECTRICAL') {
                warrantiesBySystemType.set('ELECTRICAL_PANEL', warranty);
            } else if (warranty.category === 'APPLIANCES') {
                // Home warranty plans typically cover all appliances
                warrantiesBySystemType.set('APPLIANCE', warranty);
            } else if (warranty.category === 'HOME_WARRANTY') {
                // Comprehensive home warranty - covers multiple systems
                warrantiesBySystemType.set('HVAC_FURNACE', warranty);
                warrantiesBySystemType.set('HVAC_HEAT_PUMP', warranty);
                warrantiesBySystemType.set('WATER_HEATER_TANK', warranty);
                warrantiesBySystemType.set('WATER_HEATER_TANKLESS', warranty);
                warrantiesBySystemType.set('ELECTRICAL_PANEL', warranty);
            }
            
            // If warranty is linked to specific asset, add that too
            if (warranty.linkedAssetId && warranty.linkedAsset?.assetType) {
                warrantiesBySystemType.set(warranty.linkedAsset.assetType, warranty);
            }
        });
    }
    
    
    // 🔑 Check for return from warranty/booking creation and refetch data
    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('refreshed') === 'true') {
            console.log('🔄 Returned from booking/warranty creation, refreshing data...');
            // Invalidate queries to refetch with updated data
            queryClient.invalidateQueries({ queryKey: ['riskReport', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['maintenance-tasks', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['bookings', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['warranties', propertyId] });
            
            // Clean up URL parameter
            const newUrl = window.location.pathname + window.location.search.replace(/[?&]refreshed=true/, '');
            window.history.replaceState({}, '', newUrl);
        }
    }, [propertyId, queryClient]); 

    // 1. Fetch Property Details (to get name/address for header)
    const { data: property, isLoading: isLoadingProperty } = useQuery({
        queryKey: ["property", propertyId],
        queryFn: async () => {
            const response = await api.getProperty(propertyId);
            if (response.success) return response.data;
            return null;
        },
        enabled: !!propertyId,
    });

    // 2. Fetch Detailed Risk Report
    const riskQuery = useQuery<RiskQueryData>({
        queryKey: ["riskReport", propertyId],
        queryFn: async () => {
            console.log('🔵 QUERY FN: Starting getRiskReportSummary for', propertyId);
            
            try {
                const result = await api.getRiskReportSummary(propertyId);
                
                console.log('🔵 QUERY FN: getRiskReportSummary returned:', result);
                console.log('🔵 QUERY FN: result type:', typeof result);
                console.log('🔵 QUERY FN: result === "QUEUED":', result === 'QUEUED');
                
                if (result === 'QUEUED') {
                    console.log('🔵 QUERY FN: Returning QUEUED status');
                    return 'QUEUED';
                }
                
                console.log('🔵 QUERY FN: Returning report object:', result);
                // The API returns the raw report object
                return result;
                
            } catch (error) {
                console.error('❌ QUERY FN ERROR:', error);
                throw error;
            }
        },
        // The result of the queryFn is either RiskReportFull or 'QUEUED'
        refetchInterval: (query) => (query.state.data === 'QUEUED' ? 5000 : false), 
        enabled: !!propertyId,
        retry: 1, // Retry once on failure
        staleTime: 0, // Always consider data stale
        gcTime: 0, // Don't cache results (renamed from cacheTime in v5+)
    });

    // --- ADDED: Expose API for debugging ---
    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).testApi = api;
            console.log('🔧 DEBUG: API exposed as window.testApi');
            console.log('🔧 TEST: Run this in console:');
            console.log('   window.testApi.getRiskReportSummary("' + propertyId + '").then(r => console.log("API Result:", r))');
        }
    }, [propertyId]);
    
    // --- ADDED: Track when query data changes ---
    React.useEffect(() => {
        console.log('🔄 EFFECT: riskQuery.data changed =', riskQuery.data);
        console.log('🔄 EFFECT: riskQuery.isLoading =', riskQuery.isLoading);
        console.log('🔄 EFFECT: riskQuery.isFetching =', riskQuery.isFetching);
        console.log('🔄 EFFECT: riskQuery.isError =', riskQuery.isError);
        console.log('🔄 EFFECT: riskQuery.error =', riskQuery.error);
    }, [riskQuery.data, riskQuery.isLoading, riskQuery.isFetching, riskQuery.isError, riskQuery.error]);
    
    // --- Data Extraction and Status Determination (COMPREHENSIVE DEBUG FIX) ---
    const riskQueryPayload = riskQuery.data; 
    
    console.log('🔍 COMPONENT: riskQueryPayload =', riskQueryPayload);
    console.log('🔍 COMPONENT: typeof riskQueryPayload =', typeof riskQueryPayload);
    console.log('🔍 COMPONENT: riskQuery.isLoading =', riskQuery.isLoading);
    console.log('🔍 COMPONENT: riskQuery.isFetching =', riskQuery.isFetching);
    
    // Determine the status and safely extract the report object
    let currentStatus: 'QUEUED' | 'CALCULATED' | undefined = undefined;
    let report: RiskAssessmentReport | undefined;

    // Handle the two possible return values: 'QUEUED' or RiskAssessmentReport object
    if (riskQueryPayload === 'QUEUED') {
        currentStatus = 'QUEUED';
        console.log('🔍 COMPONENT: Status is QUEUED');
    } else if (typeof riskQueryPayload === 'object' && riskQueryPayload !== null) {
        // This is the RiskAssessmentReport object
        report = riskQueryPayload;
        currentStatus = 'CALCULATED';
        
        console.log('🔍 COMPONENT: Status is CALCULATED, report =', report);
        
        // CRITICAL: Validate and fix the details array
        if (report && report.details) {
            console.log('🔍 COMPONENT: report.details exists');
            console.log('🔍 COMPONENT: typeof report.details =', typeof report.details);
            console.log('🔍 COMPONENT: Array.isArray(report.details) =', Array.isArray(report.details));
            
            if (Array.isArray(report.details)) {
                console.log('✅ COMPONENT: details is array, length =', report.details.length);
                if (report.details.length > 0) {
                    console.log('✅ COMPONENT: First item =', report.details[0]);
                }
            } else {
                console.warn('⚠️ COMPONENT: details is NOT an array, attempting conversion...');
                
                // Try to convert from object to array
                if (typeof report.details === 'object' && report.details !== null) {
                    const detailsArray = Object.values(report.details);
                    if (Array.isArray(detailsArray) && detailsArray.length > 0) {
                        report = { ...report, details: detailsArray as AssetRiskDetail[] };
                        console.log('✅ COMPONENT: Converted object to array, new length =', report.details.length);
                    }
                }
                // Try to parse from string
                else if (typeof report.details === 'string') {
                    try {
                        const parsed = JSON.parse(report.details);
                        if (Array.isArray(parsed)) {
                            report = { ...report, details: parsed as AssetRiskDetail[] };
                            console.log('✅ COMPONENT: Parsed string to array, new length =', report.details.length);
                        }
                    } catch (e) {
                        console.error('❌ COMPONENT: Failed to parse details string:', e);
                    }
                }
            }
        } else {
            console.log('⚠️ COMPONENT: No report.details field found');
        }
    } else {
        // Handle initial undefined state or other unhandled types
        currentStatus = undefined;
        console.log('🔍 COMPONENT: Status is undefined (initial load)');
    }
    
    console.log('🔍 COMPONENT: Final - currentStatus =', currentStatus, ', report =', report);
    console.log('🔍 COMPONENT: Final - report?.details type =', report?.details ? (Array.isArray(report.details) ? 'array' : typeof report.details) : 'undefined');
    
    const isQueued = currentStatus === 'QUEUED';
    const isLoadingReport = riskQuery.isLoading;
    
    // --- Loading and Error States ---
    if (isLoadingProperty || !propertyId) {
        return (
            <DashboardShell>
                <div className="h-64 rounded-lg bg-gray-100 animate-pulse flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </DashboardShell>
        );
    }
    
    const isCalculating = isLoadingReport && !report;
    const score = report?.riskScore || 0;
    const { level, color, progressClass } = getRiskDetails(score);

    // FIX: Ensure financialExposureTotal is parsed as a number from the string API returns
    const exposureString = report?.financialExposureTotal;
    const exposure = (exposureString && typeof exposureString === 'string') 
        ? parseFloat(exposureString) 
        : (typeof exposureString === 'number' ? exposureString : 0);
    
    const formattedExposure = formatCurrency(exposure);
    const riskProgressValue = 100 - score;

    // --- PDF Download Handler (omitted for brevity) ---
    const handleDownloadPdf = async () => {
        // ... (PDF logic)
        
        if (!isPremium) {
            toast({
                title: "Premium Feature Required",
                description: "Downloading the full PDF report is a premium feature. Please upgrade your account.",
                variant: "destructive",
            });
            return;
        }
        
        if (!report) return;

        try {
            const pdfBlob = await api.downloadRiskReportPdf(propertyId);
            
            // Create a URL for the Blob and trigger download
            const url = window.URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `RiskAssessmentReport-${propertyId}-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
            toast({
                title: "Download Started",
                description: "Your Risk Assessment PDF report is downloading.",
            });

        } catch (error: any) {
            console.error("PDF Download Error:", error);
            toast({
                title: "Download Failed",
                description: error.message || "Could not generate or download the PDF file.",
                variant: "destructive",
            });
        }
    };
    
    // 🔑 Handle CTA click - route based on action type and existing bookings/tasks
    const handleScheduleInspection = (asset: AssetRiskDetail) => {
        // Check if booking already exists for this asset
        const insightFactor = asset.assetName.replace(/_/g, ' ');
        const existingBooking = bookingsByInsightFactor.get(insightFactor);
        
        if (existingBooking) {
            // Navigate to booking detail page
            router.push(`/dashboard/bookings/${existingBooking.id}`);
            return;
        }
        
        // 1. Home Warranty → Warranties page
        if (asset.actionCta === 'Add Home Warranty') {
            const params = new URLSearchParams({
                action: 'new',
                propertyId: propertyId,
                from: 'risk-assessment',
                systemType: asset.systemType,
                assetName: asset.assetName,
            });
            router.push(`/dashboard/warranties?${params.toString()}`);
            return;
        }
        
        // 2. Schedule Inspection/Maintenance → Provider Search (for booking services)
        if (asset.actionCta?.includes('Schedule') || asset.actionCta?.includes('Book')) {
            // Map systemType to service category
            let category = 'INSPECTION'; // default
            if (asset.systemType.includes('HVAC')) {
                category = 'HVAC';
            } else if (asset.systemType.includes('WATER_HEATER')) {
                category = 'PLUMBING';
            } else if (asset.systemType.includes('ROOF')) {
                category = 'ROOFING';
            } else if (asset.systemType.includes('ELECTRICAL')) {
                category = 'ELECTRICAL';
            } else if (asset.systemType.includes('SAFETY')) {
                category = 'HANDYMAN';
            }
            
            // Navigate to provider search with context AND from parameter
            const params = new URLSearchParams({
                category: category,
                insightFactor: insightFactor,
                propertyId: propertyId,
                from: 'risk-assessment', // 🔑 NEW: Track navigation source
            });
            router.push(`/dashboard/providers?${params.toString()}`);
            return;
        }
        
        // 3. Fallback: Open maintenance modal for creating reminders
        setSelectedAsset(asset);
        setIsModalOpen(true);
    };

    // 🔑 NEW: Handle viewing existing booking
    const handleViewBooking = (booking: any) => {
        router.push(`/dashboard/bookings/${booking.id}`);
    };

    // 🔑 NEW: Handle viewing existing task
    const handleViewTask = (task: PropertyMaintenanceTask) => {
        router.push(`/dashboard/maintenance?propertyId=${propertyId}&from=risk-assessment`);
    };

    // 🔑 NEW: Handle successful task creation
    const handleTaskCreated = () => {
        toast({
            title: 'Task Created',
            description: 'Maintenance task added to your schedule.',
        });
        setIsModalOpen(false);
        setSelectedAsset(null);
        // Refetch maintenance tasks to update indicators
        refetchTasks();
    };
    
    // --- Detailed Section Rendering Logic ---
    const renderDetailedSections = () => {
        if (isCalculating || isQueued) {
            return (
                <Card className="md:col-span-3">
                    <CardHeader className="flex flex-row items-center justify-start space-y-0 pb-2">
                        <Loader2 className="h-5 w-5 animate-spin mr-3 text-primary" />
                        <CardTitle>Calculating Risks...</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <CardDescription>
                            {isQueued ? 'Your report is in the queue. We will update automatically.' : 'Fetching report details...'}
                        </CardDescription>
                    </CardContent>
                </Card>
            );
        }

        // Final check for calculated report with actual data
        if (report && Array.isArray(report.details) && report.details.length > 0) {
            return (
                <React.Fragment>
                    <AssetMatrixTable 
                        details={report.details} 
                        tasksBySystemType={tasksBySystemType}
                        bookingsByInsightFactor={bookingsByInsightFactor}
                        warrantiesBySystemType={warrantiesBySystemType}
                        onScheduleInspection={handleScheduleInspection}
                        onViewTask={handleViewTask}
                        onViewBooking={handleViewBooking}
                    />
                    
                    <div className="grid gap-4 md:grid-cols-4">
                        <RiskCategorySummaryCard 
                            category={'STRUCTURE'} 
                            details={report.details} 
                            riskIcon={Home}
                        />
                        <RiskCategorySummaryCard 
                            category={'SYSTEMS'} 
                            details={report.details} 
                            riskIcon={ZapIcon}
                        />
                        <RiskCategorySummaryCard 
                            category={'SAFETY'} 
                            details={report.details} 
                            riskIcon={Siren}
                        />
                        <RiskCategorySummaryCard 
                            category={'FINANCIAL_GAP'} 
                            details={report.details} 
                            riskIcon={DollarSign}
                        />
                    </div>
                </React.Fragment>
            );
        }

        // Default fallback when not loading and no data found
        return (
            <Card className="md:col-span-4">
                <CardHeader><CardTitle>No Detailed Risk Data</CardTitle></CardHeader>
                <CardContent><CardDescription>Update your property details (like HVAC install year, roof type, appliance ages) to generate component risk summaries. The score displayed above (if any) is based on general property attributes and defaults.</CardDescription></CardContent>
            </Card>
        );
    };

    return (
        <DashboardShell>
            <PageHeader>
                <Link href={`/dashboard/properties/${propertyId}`} passHref>
                    <Button variant="link" className="p-0 h-auto mb-2 text-sm text-muted-foreground">
                        <ArrowLeft className="h-4 w-4 mr-1" /> Back to {property?.name || 'Property'} Overview
                    </Button>
                </Link>
                <PageHeaderHeading className="flex items-center gap-2">
                    <Zap className="h-8 w-8 text-primary" /> Property Risk Report
                </PageHeaderHeading>
            </PageHeader>

            {/* --- Risk Summary Banner --- */}
            <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                <Card className="md:col-span-1 border-2 border-primary/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-base font-medium">Risk Score</CardTitle>
                        <Shield className="h-5 w-5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isCalculating || isQueued ? (
                            <div className="flex items-center space-x-2 text-lg text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> 
                                {isQueued ? 'Queued for Calculation' : 'Calculating...'}
                            </div>
                        ) : (
                            <React.Fragment>
                                <div className="text-4xl font-extrabold flex items-baseline">
                                    {score}
                                    <span className="text-xl font-semibold text-muted-foreground ml-1">/100</span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Status: <Badge variant={getRiskDetails(score).badgeVariant as any}>{level}</Badge>
                                </p>
                            </React.Fragment>
                        )}
                    </CardContent>
                </Card>

                <Card className="md:col-span-2 lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-base font-medium">Total Financial Exposure (5-Year)</CardTitle>
                        <DollarSign className="h-5 w-5 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        {isCalculating || isQueued ? (
                            <div className="flex items-center space-x-2 text-lg text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Awaiting data...
                            </div>
                        ) : (
                            <div className="text-4xl font-extrabold text-red-600">
                                {formattedExposure}
                            </div>
                        )}
                        <p className="text-sm text-muted-foreground mt-1">
                            Calculated worst-case, out-of-pocket costs based on age and lack of coverage.
                        </p>
                    </CardContent>
                </Card>
                
                <Card className="md:col-span-3 lg:col-span-1 flex flex-col justify-between">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Tools & Export</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Button 
                                className="w-full" 
                                disabled={isCalculating || isQueued}
                                onClick={handleDownloadPdf}
                                variant={isPremium ? 'default' : 'secondary'}
                            >
                                <Download className="h-4 w-4 mr-2" /> 
                                {isPremium ? 'Download Full PDF' : 'Upgrade for PDF'}
                            </Button>
                            
                            {!isPremium && (
                                <p className="text-xs text-red-500 font-medium text-center">
                                    *Premium feature (Admin role used as mock check)
                                </p>
                            )}

                            {/* FIX START: Replace conditional queue logic with explicit Generate/Check Status button */}
                            {isQueued ? (
                                <Button 
                                    variant="outline" 
                                    className="w-full" 
                                    onClick={() => riskQuery.refetch()} 
                                    disabled={riskQuery.isFetching}
                                >
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Checking Calculation Status...
                                </Button>
                            ) : (
                                <Button 
                                    variant="secondary" 
                                    className="w-full" 
                                    onClick={() => riskQuery.refetch()} 
                                    disabled={riskQuery.isFetching || isCalculating} // Disabled if initiating a fetch
                                >
                                    Generate New Report
                                </Button>
                            )}
                            {/* FIX END */}

                            {/* Display the timestamp if a report has been successfully calculated (not queued/calculating) */}
                            {!isQueued && !isCalculating && report?.lastCalculatedAt && (
                                <p className="text-xs text-muted-foreground">
                                    Last calculated: {new Date(report.lastCalculatedAt).toLocaleString()}
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div className="mt-8 space-y-6">
                {/* --- Risk Gauge Visualization --- */}
                <div className="space-y-2">
                    <h3 className="text-xl font-semibold">Overall Risk Gauge: {level}</h3>
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                        <span>High (0)</span>
                        <span>Low (100)</span>
                    </div>
                    <Progress 
                        value={riskProgressValue} 
                        className={`h-4`} 
                        indicatorClassName={progressClass} 
                    />
                </div>

                {/* --- Detailed Section Content --- */}
                {renderDetailedSections()}
            </div>

            {/* 🔑 NEW: Modal for creating maintenance tasks */}
            {selectedAsset && (
                <MaintenanceConfigModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedAsset(null);
                    }}
                    template={{
                        id: `risk:${selectedAsset.systemType}`,
                        title: selectedAsset.assetName.replace(/_/g, ' '),
                        description: selectedAsset.actionCta || 'Schedule Inspection/Replacement',
                        serviceCategory: getServiceCategoryForAsset(selectedAsset.systemType) as any,
                        defaultFrequency: RecurrenceFrequency.ANNUALLY,
                        sortOrder: 0,
                    }}
                    properties={[]}
                    selectedPropertyId={propertyId}
                    onSuccess={handleTaskCreated}
                    existingConfig={{
                        templateId: `risk:${selectedAsset.systemType}`,
                        title: selectedAsset.assetName.replace(/_/g, ' '),
                        description: selectedAsset.actionCta || 'Schedule Inspection/Replacement',
                        isRecurring: false,
                        frequency: null,
                        nextDueDate: new Date(),
                        serviceCategory: getServiceCategoryForAsset(selectedAsset.systemType) as any,
                        propertyId: propertyId,
                    }}
                />
            )}
            
        </DashboardShell>
    );
}