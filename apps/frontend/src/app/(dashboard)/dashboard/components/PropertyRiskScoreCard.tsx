// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, DollarSign, ArrowRight } from "lucide-react";
import Link from "next/link";
import React from 'react';

// --- Placeholder/Mock Data Structure for the API response ---
// In Phase 2.3, this data will be fetched from the backend's RiskAssessmentService
interface RiskReportSummary {
  riskScore: number; // 0 to 100 (100 is low risk)
  financialExposureTotal: number; // Total estimated cost in USD
  status: 'QUEUED' | 'CALCULATED';
  propertyId: string;
}

const getRiskDetails = (score: number) => {
  if (score >= 80) {
    return { level: "LOW", color: "bg-green-500", progressClass: "bg-green-500", badgeVariant: "success" };
  } else if (score >= 60) {
    return { level: "MODERATE", color: "bg-yellow-500", progressClass: "bg-yellow-500", badgeVariant: "warning" };
  } else if (score >= 40) {
    return { level: "ELEVATED", color: "bg-orange-500", progressClass: "bg-orange-500", badgeVariant: "destructive" };
  } else {
    return { level: "HIGH", color: "bg-red-500", progressClass: "bg-red-500", badgeVariant: "destructive" };
  }
};

interface PropertyRiskScoreCardProps {
  // Pass the summary data fetched from the API (Phase 2.3)
  summary: RiskReportSummary | null;
  isLoading: boolean;
  propertyId: string;
}

export function PropertyRiskScoreCard({ summary, isLoading, propertyId }: PropertyRiskScoreCardProps) {
  
  // Use mock data for demonstration if actual data is null or loading
  const mockSummary: RiskReportSummary = {
    riskScore: 78,
    financialExposureTotal: 4500.00,
    status: 'CALCULATED',
    propertyId: propertyId,
  };
  
  const data = summary || mockSummary;
  const { level, color, progressClass } = getRiskDetails(data.riskScore);
  const formattedExposure = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(data.financialExposureTotal);
  
  const riskProgressValue = 100 - data.riskScore; // Invert score for progress bar (higher bar = higher risk)
  
  if (isLoading || data.status === 'QUEUED') {
    return (
      <Card className="flex flex-col h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Property Risk Assessment
          </CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-xl font-semibold text-blue-500">Calculating...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Data is being processed by the worker. Check back soon.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Property Risk Assessment
        </CardTitle>
        <Zap className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-between">
        <div>
            <div className="text-2xl font-bold flex items-center gap-2">
                {data.riskScore}/100 
                <Badge variant={getRiskDetails(data.riskScore).badgeVariant as any} className="text-xs">
                    {level} RISK
                </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
                Risk Score (100 is the best score)
            </p>
        </div>
        
        <div className="mt-4">
            <p className="text-lg font-semibold flex items-center">
                <DollarSign className="h-4 w-4 mr-1 text-red-600" />
                Total Estimated Financial Exposure
            </p>
            <p className="text-3xl font-extrabold text-red-600">
                {formattedExposure}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
                Calculated worst-case, out-of-pocket costs in the next 5 years.
            </p>
        </div>
        
        <div className="mt-4">
            <h4 className="text-sm font-medium mb-1">Risk Gauge ({level})</h4>
            <Progress 
                value={riskProgressValue} 
                className={`h-2 ${progressClass}`} 
                indicatorClassName={`${progressClass}`} 
            />
            <Link href={`/dashboard/properties/${data.propertyId}/risk-assessment`} passHref>
                <Button variant="link" className="p-0 h-auto mt-2 text-sm font-semibold">
                    View Full Report <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
            </Link>
        </div>

      </CardContent>
    </Card>
  );
}