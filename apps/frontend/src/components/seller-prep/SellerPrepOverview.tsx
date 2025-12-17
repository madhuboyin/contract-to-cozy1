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
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Hammer,
  Home,
  Camera,
  Users,
  CheckCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types (kept local on purpose – no global coupling in Phase 2)       */
/* ------------------------------------------------------------------ */

interface ROIFix {
  item: string;
  roiPercent: number;
  estimatedCost?: number;
}

interface ComparableSale {
  address: string;
  soldPrice: number;
  soldDate: string;
  distanceMiles?: number;
}

interface CurbAppealResult {
  score: number;
  summary: string;
  recommendations: string[];
}

interface StagingTip {
  room: string;
  suggestion: string;
}

interface AgentQuestion {
  category: string;
  questions: string[];
}

interface SellerPrepOverviewProps {
  roi: ROIFix[];
  comparables: ComparableSale[];
  curbAppeal: CurbAppealResult;
  staging: StagingTip[];
  agentGuide: AgentQuestion[];
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function SellerPrepOverview({
  roi,
  comparables,
  curbAppeal,
  staging,
  agentGuide,
}: SellerPrepOverviewProps) {
  return (
    <div className="space-y-6">

      {/* ROI Repairs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hammer className="h-5 w-5 text-green-600" />
            ROI-Driven Repair Recommendations
          </CardTitle>
          <CardDescription>
            Focus on improvements that historically increase sale price
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {roi.map((fix, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 border rounded-md"
            >
              <div>
                <p className="font-medium">{fix.item}</p>
                {fix.estimatedCost && (
                  <p className="text-xs text-muted-foreground">
                    Est. Cost: ${fix.estimatedCost.toLocaleString()}
                  </p>
                )}
              </div>
              <Badge variant={fix.roiPercent >= 80 ? "default" : "secondary"}>
                {fix.roiPercent}% ROI
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Curb Appeal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-blue-600" />
            Curb Appeal Score
          </CardTitle>
          <CardDescription>
            Exterior attractiveness as seen by buyers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-lg">
              {curbAppeal.score} / 100
            </Badge>
            <p className="text-sm text-muted-foreground">
              {curbAppeal.summary}
            </p>
          </div>

          <ul className="list-disc ml-5 text-sm space-y-1">
            {curbAppeal.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Comparable Sales */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-600" />
            Comparable Home Sales
          </CardTitle>
          <CardDescription>
            Recently sold homes influencing buyer expectations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {comparables.map((comp, idx) => (
            <div
              key={idx}
              className="flex justify-between items-center border-b pb-2 last:border-none"
            >
              <div>
                <p className="font-medium">{comp.address}</p>
                <p className="text-xs text-muted-foreground">
                  Sold {new Date(comp.soldDate).toLocaleDateString()}
                </p>
              </div>
              <p className="font-semibold">
                ${comp.soldPrice.toLocaleString()}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Staging */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-orange-600" />
            Staging Recommendations
          </CardTitle>
          <CardDescription>
            Presentation tips that improve buyer perception
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {staging.map((tip, idx) => (
            <div key={idx} className="text-sm">
              <span className="font-medium">{tip.room}:</span>{" "}
              {tip.suggestion}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Agent Interview Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-teal-600" />
            Agent Interview Guide
          </CardTitle>
          <CardDescription>
            Questions to help you select the right listing agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {agentGuide.map((section, idx) => (
            <div key={idx}>
              <p className="font-medium mb-1">{section.category}</p>
              <ul className="list-disc ml-5 text-sm space-y-1">
                {section.questions.map((q, qIdx) => (
                  <li key={qIdx}>{q}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Soft Completion State */}
      <Card className="bg-green-50 border-green-200">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="h-6 w-6 text-green-600" />
          <p className="text-sm text-green-800">
            Completing high-ROI prep steps increases buyer confidence and
            reduces time-on-market.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
