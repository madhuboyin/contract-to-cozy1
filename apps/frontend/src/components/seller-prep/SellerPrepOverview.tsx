// apps/frontend/src/components/seller-prep/SellerPrepOverview.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Hammer, TrendingUp, FileText, AlertCircle } from "lucide-react";

interface SellerPrepItem {
  id: string;
  title: string;
  priority: string;
  roiRange: string;
  costBucket: string;
  status: string;
}

interface ComparableHome {
  address: string;
  soldPrice: number | null;
  soldDate: string | null;
  sqft?: number;
  beds?: number;
  baths?: number;
  similarityReason: string;
}

interface ReadinessReport {
  summary: string;
  highlights?: string[];
  risks?: string[];
  disclaimers?: string[];
}

interface SellerPrepOverviewProps {
  overview: {
    items: SellerPrepItem[];
    completionPercent: number;
  };
  comparables: ComparableHome[];
  report: ReadinessReport;
}

export default function SellerPrepOverview({
  overview,
  comparables,
  report,
}: SellerPrepOverviewProps) {
  const hasComparables = comparables && comparables.length > 0;

  return (
    <div className="space-y-6">
      {/* Completion */}
      <Card className="bg-green-50 border-green-200">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="h-6 w-6 text-green-600" />
          <p className="text-sm text-green-800">
            Seller prep completion: <strong>{overview.completionPercent}%</strong>
          </p>
        </CardContent>
      </Card>

      {/* ROI Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hammer className="h-5 w-5 text-green-600" />
            ROI-Based Prep Checklist
          </CardTitle>
          <CardDescription>
            Prioritized improvements based on resale impact
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.items.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No preparation items available. Please check back later.
            </p>
          ) : (
            overview.items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center border rounded-md p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{item.title}</p>
                    <Badge 
                      variant={
                        item.priority === 'HIGH' ? 'destructive' :
                        item.priority === 'MEDIUM' ? 'default' :
                        'secondary'
                      }
                      className="text-xs"
                    >
                      {item.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ROI: {item.roiRange} • Cost: {item.costBucket}
                  </p>
                </div>
                <Badge 
                  variant={
                    item.status === "DONE" ? "default" : 
                    item.status === "SKIPPED" ? "outline" :
                    "secondary"
                  }
                >
                  {item.status}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Comparables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-600" />
            Comparable Sales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!hasComparables ? (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-md">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  No comparable sales data available
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Market trends may be shown instead of property-level comparables.
                  Data availability varies by location.
                </p>
              </div>
            </div>
          ) : (
            comparables.map((comp, i) => (
              <div 
                key={i} 
                className="flex justify-between items-start border-b pb-2 last:border-0"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{comp.address}</p>
                  {(comp.sqft || comp.beds || comp.baths) && (
                    <p className="text-xs text-gray-500">
                      {comp.sqft && `${comp.sqft.toLocaleString()} sqft`}
                      {comp.beds && ` • ${comp.beds} bed`}
                      {comp.baths && ` • ${comp.baths} bath`}
                    </p>
                  )}
                  {comp.soldDate && (
                    <p className="text-xs text-gray-500">
                      Sold: {new Date(comp.soldDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <strong className="text-sm">
                    {comp.soldPrice 
                      ? `$${comp.soldPrice.toLocaleString()}` 
                      : 'Price N/A'
                    }
                  </strong>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Readiness Report */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Seller Readiness Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">{report.summary}</p>

          {report.highlights && report.highlights.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Key Highlights:</p>
              <ul className="list-disc ml-5 space-y-1">
                {report.highlights.map((highlight, i) => (
                  <li key={i} className="text-sm text-gray-700">{highlight}</li>
                ))}
              </ul>
            </div>
          )}

          {report.risks && report.risks.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mt-3">
              <p className="text-xs font-medium text-amber-800 mb-2">⚠️ Areas for Attention:</p>
              <ul className="list-disc ml-5 space-y-1">
                {report.risks.map((risk, i) => (
                  <li key={i} className="text-sm text-amber-800">{risk}</li>
                ))}
              </ul>
            </div>
          )}

          {report.disclaimers && report.disclaimers.length > 0 && (
            <div className="border-t pt-3 mt-3">
              <p className="text-xs text-gray-500 space-y-1">
                {report.disclaimers.map((disclaimer, i) => (
                  <span key={i} className="block">{disclaimer}</span>
                ))}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}