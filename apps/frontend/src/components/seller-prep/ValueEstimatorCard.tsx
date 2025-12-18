// apps/frontend/src/components/seller-prep/ValueEstimatorCard.tsx
"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TrendingUp, CheckCircle, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ValueEstimate {
  minValue: number;
  maxValue: number;
}

interface CompletedImprovement {
  title: string;
  roiRange: string;
  estimatedCost: number;
}

interface RemainingImprovement {
  title: string;
  roiRange: string;
  estimatedCost: number;
  priority: string;
}

interface ValueEstimatorCardProps {
  completedImprovements: CompletedImprovement[];
  remainingImprovements: RemainingImprovement[];
  completedValueIncrease: ValueEstimate;
  potentialValueIncrease: ValueEstimate;
}

export function ValueEstimatorCard({
  completedImprovements,
  remainingImprovements,
  completedValueIncrease,
  potentialValueIncrease,
}: ValueEstimatorCardProps) {
  const totalPotentialMin = completedValueIncrease.minValue + potentialValueIncrease.minValue;
  const totalPotentialMax = completedValueIncrease.maxValue + potentialValueIncrease.maxValue;
  const hasCompleted = completedImprovements.length > 0;
  const hasRemaining = remainingImprovements.length > 0;

  return (
    <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-green-600" />
          Estimated Value Increase
        </CardTitle>
        <CardDescription>
          Based on completed and planned improvements
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Completed Improvements */}
        {hasCompleted && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <h4 className="text-sm font-semibold text-green-900">
                Completed Improvements
              </h4>
            </div>
            <div className="space-y-2 mb-3">
              {completedImprovements.map((improvement, i) => (
                <div
                  key={i}
                  className="flex justify-between items-start text-xs bg-white rounded-md p-2 border border-green-100"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{improvement.title}</p>
                    <p className="text-gray-500">
                      ROI: {improvement.roiRange} • Cost: ${improvement.estimatedCost.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-green-100 rounded-lg p-4">
              <p className="text-xs text-green-800 mb-1">Current value increase:</p>
              <p className="text-2xl font-bold text-green-900">
                ${completedValueIncrease.minValue.toLocaleString()} - $
                {completedValueIncrease.maxValue.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Remaining Improvements */}
        {hasRemaining && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Circle className="h-4 w-4 text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-700">
                Potential with Remaining Tasks
              </h4>
            </div>
            <div className="space-y-2 mb-3">
              {remainingImprovements.slice(0, 3).map((improvement, i) => (
                <div
                  key={i}
                  className="flex justify-between items-start text-xs bg-white rounded-md p-2 border"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-700">{improvement.title}</p>
                      <Badge
                        variant={
                          improvement.priority === "HIGH"
                            ? "destructive"
                            : improvement.priority === "MEDIUM"
                            ? "default"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {improvement.priority}
                      </Badge>
                    </div>
                    <p className="text-gray-500">
                      ROI: {improvement.roiRange} • Est: ${improvement.estimatedCost.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {remainingImprovements.length > 3 && (
                <p className="text-xs text-gray-500 text-center">
                  +{remainingImprovements.length - 3} more improvements
                </p>
              )}
            </div>
            <div className="bg-gray-100 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">Additional potential:</p>
              <p className="text-xl font-bold text-gray-800">
                ${potentialValueIncrease.minValue.toLocaleString()} - $
                {potentialValueIncrease.maxValue.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Total Potential */}
        <div className="border-t-2 border-green-200 pt-4">
          <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg p-4 text-white">
            <p className="text-sm opacity-90 mb-1">
              {hasCompleted
                ? "Total Potential Value Increase"
                : "Estimated Value Increase (All Tasks)"}
            </p>
            <p className="text-3xl font-bold">
              ${totalPotentialMin.toLocaleString()} - $
              {totalPotentialMax.toLocaleString()}
            </p>
            {hasRemaining && (
              <p className="text-xs opacity-90 mt-2">
                Complete {remainingImprovements.length} remaining task
                {remainingImprovements.length !== 1 ? "s" : ""} to maximize your home's value
              </p>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>
            * Estimates based on industry ROI data and may vary by location, market
            conditions, and quality of work.
          </p>
          <p>
            * Value increases are potential and not guaranteed. Actual results depend on
            buyer preferences and timing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}