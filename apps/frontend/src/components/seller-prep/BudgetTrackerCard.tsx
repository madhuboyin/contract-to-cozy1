// apps/frontend/src/components/seller-prep/BudgetTrackerCard.tsx
"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DollarSign, AlertCircle } from "lucide-react";

interface BudgetTrackerCardProps {
  totalBudget: number;
  spentAmount: number;
  remainingTasks: Array<{
    title: string;
    estimatedCost: number;
  }>;
}

export function BudgetTrackerCard({
  totalBudget,
  spentAmount,
  remainingTasks,
}: BudgetTrackerCardProps) {
  const percentSpent = totalBudget > 0 ? (spentAmount / totalBudget) * 100 : 0;
  const remainingBudget = totalBudget - spentAmount;
  const estimatedRemainingCost = remainingTasks.reduce((sum, task) => sum + task.estimatedCost, 0);
  const projectedTotal = spentAmount + estimatedRemainingCost;
  const wouldExceedBudget = projectedTotal > totalBudget;

  return (
    <Card className="border-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-5 w-5 text-blue-600" />
          Budget Tracker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Status */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Spent</span>
            <span className="text-sm font-semibold">
              ${spentAmount.toLocaleString()} of ${totalBudget.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                percentSpent > 90
                  ? "bg-red-600"
                  : percentSpent > 75
                  ? "bg-yellow-600"
                  : "bg-blue-600"
              }`}
              style={{ width: `${Math.min(percentSpent, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {percentSpent.toFixed(0)}% of budget used
          </p>
        </div>

        {/* Warning if approaching limit */}
        {percentSpent > 75 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-yellow-800">
              {percentSpent > 90 ? (
                <p>
                  <strong>Budget alert:</strong> You're approaching your budget limit.
                  Consider prioritizing remaining tasks.
                </p>
              ) : (
                <p>
                  <strong>Heads up:</strong> You've used over 75% of your budget.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Projection */}
        {remainingTasks.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-gray-700 mb-2">
              Projected Total with Remaining Tasks:
            </p>
            <div className="space-y-1">
              {remainingTasks.map((task, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-600">
                  <span>• {task.title}</span>
                  <span>~${task.estimatedCost.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 pt-2 border-t">
              <span className="text-sm font-medium">Projected Total:</span>
              <span
                className={`text-sm font-semibold ${
                  wouldExceedBudget ? "text-red-600" : "text-blue-600"
                }`}
              >
                ${projectedTotal.toLocaleString()}
              </span>
            </div>
            {wouldExceedBudget && (
              <p className="text-xs text-red-600 mt-1">
                ⚠️ Projected to exceed budget by ${(projectedTotal - totalBudget).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Remaining Budget */}
        <div className="bg-blue-50 rounded-md p-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-blue-900">Remaining Budget:</span>
            <span className="text-lg font-semibold text-blue-900">
              ${Math.max(0, remainingBudget).toLocaleString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}