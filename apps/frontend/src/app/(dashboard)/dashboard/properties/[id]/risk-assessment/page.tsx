// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx

"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Property, RiskAssessmentReport, AssetRiskDetail, RiskCategory } from "@/types"; 
import { api } from "@/lib/api/client";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading } from "@/components/page-header";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Zap, Shield, Loader2, DollarSign, Download, ArrowLeft, Home, Zap as ZapIcon, Siren } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import React from "react";
import { useAuth } from "@/lib/auth/AuthContext"; 

// --- Types for Query Data ---
type RiskReportFull = RiskAssessmentReport; 

interface QueuedData {
    status: 'QUEUED';
    report?: RiskReportFull;
}

interface CalculatedData {
    status: 'CALCULATED';
    report: RiskReportFull;
}

type RiskQueryData = QueuedData | CalculatedData;

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


// --- Component for Phase 3.3: Risk Category Summary Card (omitted for brevity) ---
const RiskCategorySummaryCard = ({ 
    category, 
    details, 
    riskIcon: RiskIcon 
}: { 
    category: RiskCategory; 
    details: AssetRiskDetail[]; 
    riskIcon: React.ElementType; 
}) => {
    
    const relevantAssets = details.filter(item => item.category === category);
    
    const totalExposure = relevantAssets.reduce((sum, item) => sum + item.riskDollar, 0);
    const formattedExposure = formatCurrency(totalExposure);

    const topRiskAsset = relevantAssets.sort((a, b) => b.riskDollar - a.riskDollar)[0];
    
    let title: string = `${category.replace(/_/g, ' ')} Risk`;
    let description: string;
    let ctaText: string = 'View Details';
    let ctaVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';
    let badgeStatus: string = 'INFO';
    let badgeColor: 'default' | 'success' | 'warning' | 'destructive' = 'default';

    if (topRiskAsset && topRiskAsset.riskDollar > 500) {
        title = topRiskAsset.assetName.replace(/_/g, ' ');
        description = `Top risk: ${topRiskAsset.actionCta || `Requires attention due to age/condition.`}`;
        ctaText = topRiskAsset.actionCta || `Find Service`;
        ctaVariant = topRiskAsset.riskLevel === 'HIGH' ? 'destructive' : 'default';
        badgeStatus = topRiskAsset.riskLevel;
        badgeColor = topRiskAsset.riskLevel === 'HIGH' ? 'destructive' : topRiskAsset.riskLevel === 'MODERATE' ? 'warning' : 'default';
    } else if (relevantAssets.length > 0) {
        title = `${category.replace(/_/g, ' ')} Health`;
        description = `All components are currently low risk. Exposure: ${formattedExposure}.`;
        ctaText = 'Add Inspection';
        ctaVariant = 'secondary';
        badgeStatus = 'GOOD';
        badgeColor = 'success';
    } else {
        title = `${category.replace(/_/g, ' ')} Data Missing`;
        description = `No component data available for this category. Please add property details.`;
        ctaText = 'Update Property Info';
        ctaVariant = 'outline';
        badgeStatus = 'INFO';
        badgeColor = 'default';
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
                    <Button variant={ctaVariant} size="sm">
                        {ctaText}
                    </Button>
                    <Badge variant={badgeColor as any}>
                        {badgeStatus.toUpperCase()}
                    </Badge>
                </div>
            </CardContent>
        </Card>
    );
}

// --- Component for Phase 3.2: Detailed Asset Matrix Table (omitted for brevity) ---
const AssetMatrixTable = ({ details }: { details: AssetRiskDetail[] }) => {
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
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[200px]">Asset</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Age / Expected Life</TableHead>
                            <TableHead>Risk Level</TableHead>
                            <TableHead>Out-of-Pocket Exposure</TableHead>
                            <TableHead className="w-[150px]">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {details.map((item, index) => (
                            <TableRow key={index} className={item.riskLevel === 'HIGH' ? 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20' : ''}>
                                <TableCell className="font-medium">
                                    {item.assetName.replace(/_/g, ' ')}
                                    <div className="text-xs text-muted-foreground">{item.systemType.replace(/_/g, ' ')}</div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{item.category.replace(/_/g, ' ')}</TableCell>
                                <TableCell>
                                    <span className="font-semibold">{item.age} yrs</span> / {item.expectedLife} yrs
                                    {item.age > item.expectedLife && <span className="text-red-500 text-xs ml-2">(Past Life)</span>}
                                </TableCell>
                                <TableCell>
                                    {getRiskBadge(item.riskLevel)}
                                </TableCell>
                                <TableCell className="font-bold text-red-600">
                                    {formatCurrency(item.outOfPocketCost)}
                                    <div className="text-xs text-muted-foreground">P: {item.probability.toFixed(2)} / C: {(item.coverageFactor * 100).toFixed(0)}%</div>
                                </TableCell>
                                <TableCell>
                                    {item.actionCta ? (
                                        <Button size="sm" variant="secondary">{item.actionCta}</Button>
                                    ) : (
                                        <span className="text-muted-foreground text-sm">Review Maintenance</span>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

// --- Main Page Component ---
export default function RiskAssessmentPage() {
    const params = useParams();
    const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
    const { user } = useAuth(); 

    // Mock Premium Check (REPLACE with actual logic)
    const isPremium = user?.role === 'ADMIN'; 

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
            const result = await api.getRiskReportSummary(propertyId); 

            if (result === 'QUEUED') {
                return { status: 'QUEUED' } as QueuedData;
            }
            
            // The API returns the raw report object, which is passed as 'result'
            return { status: 'CALCULATED', report: result as RiskReportFull } as CalculatedData;
        },
        refetchInterval: (query) => (query.state.data?.status === 'QUEUED' ? 5000 : false), 
        enabled: !!propertyId,
    });

    // --- Data Extraction and Status Determination (FINAL FIX) ---
    const riskQueryPayload = riskQuery.data; 
    
    // Determine the status and safely extract the report object
    let currentStatus: string = (riskQueryPayload as any)?.status;
    let report: RiskReportFull | undefined;

    // 1. Check for the correctly wrapped object
    if (currentStatus === 'CALCULATED') {
        report = (riskQueryPayload as CalculatedData).report;
    } 
    
    // 2. Fallback Fix: If the API returns the raw report object directly (the observed bug).
    // This resolves the issue where 'Report Data: undefined' was logged.
    if (!report && typeof riskQueryPayload === 'object' && riskQueryPayload !== null && 'id' in riskQueryPayload) {
        report = riskQueryPayload as unknown as RiskReportFull; 
        currentStatus = 'CALCULATED'; 
    }
    
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

    const exposure = report?.financialExposureTotal || 0;
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
    
    // --- Detailed Section Rendering Logic ---
    const renderDetailedSections = () => {
        if (isCalculating || isQueued) {
            return (
                <Card className="md:col-span-3">
                    <CardHeader className="flex flex-row items-center justify-start space-y-0 pb-2">
                        <Loader2 className="h-5 w-5 animate-spin mr-3 text-primary" />
                        <CardTitle>Awaiting Detailed Risk Report</CardTitle>
                    </CardHeader>
                    <CardContent><CardDescription>{isQueued ? 'The risk calculation job is currently queued and will start shortly.' : 'Fetching detailed report breakdown...'}</CardDescription></CardContent>
                </Card>
            );
        }

        // Final check for calculated report with actual data
        if (report && Array.isArray(report.details) && report.details.length > 0) {
            return (
                <React.Fragment>
                    <AssetMatrixTable details={report.details} />
                    
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

                            {isQueued && (
                                <Button variant="outline" className="w-full" onClick={() => riskQuery.refetch()}>
                                    Recalculate Now
                                </Button>
                            )}
                            {!isQueued && !isCalculating && (
                                <p className="text-xs text-muted-foreground">Last calculated: {new Date(report?.lastCalculatedAt || '').toLocaleString()}</p>
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
            
        </DashboardShell>
    );
}