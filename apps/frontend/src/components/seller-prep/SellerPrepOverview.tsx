"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Hammer, TrendingUp, FileText } from "lucide-react";

interface SellerPrepOverviewProps {
  overview: {
    items: Array<{
      id: string;
      title: string;
      priority: string;
      roiRange: string;
      costBucket: string;
      status: string;
    }>;
    completionPercent: number;
  };
  comparables: any[];
  report: {
    summary: string;
    highlights?: string[];
    risks?: string[];
  };
}

export default function SellerPrepOverview({
  overview,
  comparables,
  report,
}: SellerPrepOverviewProps) {
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
          {overview.items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center border rounded-md p-3"
            >
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  ROI: {item.roiRange} • Cost: {item.costBucket}
                </p>
              </div>
              <Badge variant={item.status === "DONE" ? "default" : "secondary"}>
                {item.status}
              </Badge>
            </div>
          ))}
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
          {comparables.map((c: any, i: number) => (
            <div key={i} className="flex justify-between text-sm">
              <span>{c.address}</span>
              <strong>${Number(c.soldPrice).toLocaleString()}</strong>
            </div>
          ))}
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
        <CardContent className="space-y-2">
          <p className="text-sm">{report.summary}</p>

          {report.highlights && (
            <ul className="list-disc ml-5 text-sm">
              {report.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
