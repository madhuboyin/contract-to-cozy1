// apps/frontend/src/app/(dashboard)/dashboard/components/AIClimateRiskCard.tsx

import React from 'react';
import Link from 'next/link';
import { Zap, Shield, Loader2, AlertTriangle, CloudRain, Flame, ThermometerSun, Wind, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

// Define the expected data structure for the frontend
interface ClimateRiskInsightDto {
    riskType: 'FLOOD' | 'FIRE' | 'HEAT' | 'WIND';
    riskScoreIncrease: number; 
    financialExposureIncrease: number; // Frontend uses number for display
    predictionYear: number;
    actionCta: string;
    systemType: string;
}

interface ClimateRiskSummaryDto {
    propertyId: string;
    insights: ClimateRiskInsightDto[];
    status: 'CALCULATED' | 'QUEUED' | 'MISSING_DATA' | 'NO_PROPERTY';
    lastCalculatedAt: string;
}

const getRiskIcon = (riskType: string) => {
  switch (riskType) {
    case 'FLOOD':
      return CloudRain;
    case 'FIRE':
      return Flame;
    case 'HEAT':
      return ThermometerSun;
    case 'WIND':
      return Wind;
    default:
      return AlertTriangle;
  }
};

const getRiskBadge = (score: number) => {
    let variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info' = 'success';
    let text = 'LOW';

    if (score >= 20) {
        variant = 'destructive';
        text = 'CRITICAL';
    } else if (score >= 10) {
        variant = 'warning';
        text = 'HIGH';
    } else if (score > 0) {
        variant = 'secondary';
        text = 'MEDIUM';
    }

    return (
        <Badge variant={variant as any} className="text-xs font-semibold">
            {text}
        </Badge>
    );
};

export const AIClimateRiskCard = ({ className }: { className?: string }) => {
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = selectedPropertyId;

  const { data, isLoading, isError, error } = useQuery<ClimateRiskSummaryDto>({
    queryKey: ['climateRiskSummary', propertyId],
    queryFn: async () => {
      if (!propertyId) {
        throw new Error('No primary property selected.');
      }
      const response = await api.getClimateRiskSummary(propertyId);
      if (!response.success || !response.data) {
        throw new Error('Failed to fetch climate risk data');
      }
      return response.data as ClimateRiskSummaryDto;
    },
    enabled: !!propertyId, // Only run the query if propertyId is available
    staleTime: 1000 * 60 * 30, // 30 minutes stale time
  });

  if (!propertyId || data?.status === 'NO_PROPERTY') {
    return (
        <Card className={cn("h-full shadow-lg", className)}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" /> Climate Risk Predictor</CardTitle>
                <CardDescription>Activate the AI to understand your future risk exposure.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Please set up your primary property in the "Properties" section to enable this feature.</p>
            </CardContent>
            <CardFooter>
                <Button asChild className="w-full">
                    <Link href="/dashboard/properties/new">Set Up Property</Link>
                </Button>
            </CardFooter>
        </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={cn("h-full flex items-center justify-center shadow-lg", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
        <p className="text-sm font-medium">Loading Climate Risk Data...</p>
      </Card>
    );
  }
  
  if (data?.status === 'QUEUED' || data?.status === 'MISSING_DATA' || isError) {
      const isQueued = data?.status === 'QUEUED';
      const isMissing = data?.status === 'MISSING_DATA';
      
      const title = isQueued ? "Calculating Risk..." : isMissing ? "Incomplete Data" : "Analysis Error";
      const description = isQueued 
        ? "Your detailed climate assessment is currently running in the background. Check back in a few minutes."
        : isMissing 
          ? "Complete your property profile (Year Built, Size) to unlock the full climate assessment."
          : `There was an error processing the report. Please try refreshing or check your property data.`;
      
      return (
        <Card className={cn("h-full shadow-lg", className)}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-600"><Loader2 className={cn("h-5 w-5", { 'animate-spin': isQueued })} /> {title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {data?.lastCalculatedAt && data.lastCalculatedAt !== new Date(0).toISOString() && (
                    <p className="text-xs text-muted-foreground mt-2">Last calculation: {new Date(data.lastCalculatedAt).toLocaleDateString()}</p>
                )}
            </CardContent>
            <CardFooter>
                <Button asChild className="w-full" variant="outline">
                    <Link href={`/dashboard/properties/${propertyId}/edit`}>
                        {isMissing ? "Update Property Details" : "View Full Risk Report"}
                    </Link>
                </Button>
            </CardFooter>
        </Card>
      );
  }


  if (!data) {
    return null;
  }

  const totalRiskScoreIncrease = data.insights.reduce((sum, i) => sum + i.riskScoreIncrease, 0);
  const highestRisk = data.insights.reduce((max, i) => i.riskScoreIncrease > max.riskScoreIncrease ? i : max, { riskScoreIncrease: 0 } as ClimateRiskInsightDto);

  return (
    <Card className={cn("h-full flex flex-col shadow-lg", className)}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 font-heading text-xl text-blue-700">
          <Zap className="h-5 w-5" /> AI Climate Risk Predictor
        </CardTitle>
        <CardDescription className="font-body text-sm">
          **Your Property**: Predicted 10-year risk increase of **{totalRiskScoreIncrease} points**.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pt-3 overflow-y-auto">
        {data.insights.length > 0 ? (
          data.insights.slice(0, 3).map((insight) => {
            const Icon = getRiskIcon(insight.riskType);
            return (
              <div key={insight.riskType} className="border-l-4 border-red-500 pl-3 py-2 bg-red-50/50 rounded-sm">
                <div className="flex items-center justify-between">
                  <div className='flex items-center space-x-2'>
                    <Icon className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm font-semibold text-gray-800">
                      {insight.riskType} Risk 
                    </p>
                  </div>
                  {getRiskBadge(insight.riskScoreIncrease)}
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  **Exposure:** ${insight.financialExposureIncrease.toLocaleString()} | **System:** {insight.systemType}
                </p>
                <p className="text-xs italic text-gray-500 mt-1">
                  **AI Recommendation:** {insight.actionCta}
                </p>
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-muted-foreground border border-green-300 bg-green-50 rounded-lg">
            <Shield className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <p className="font-body text-sm font-medium text-green-800">Low Predicted Climate Risk!</p>
            <p className="text-xs">Your current location shows minimal predicted increase in major climate risks over the next 10 years.</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4 bg-gray-50/50 rounded-b-lg">
        <Button className="w-full" asChild>
          <Link href={`/dashboard/properties/${propertyId}/risk-assessment`}>
            Review Full Risk & Mitigation Report <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};