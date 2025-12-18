// apps/frontend/src/components/seller-prep/SellerPrepOverview.tsx (UPDATED)
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Hammer, TrendingUp, FileText, AlertCircle, Loader2, Undo2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/use-toast";
import { LeadCaptureModal } from "@/components/seller-prep/LeadCaptureModal";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { BudgetTrackerCard } from "./BudgetTrackerCard";
import { ValueEstimatorCard } from "./ValueEstimatorCard";

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
    preferences?: any;
    personalizedSummary?: string;
    // ADD THESE TWO FIELDS:
    budget?: {
      totalBudget: number;
      spentAmount: number;
      remainingTasks: Array<{
        title: string;
        estimatedCost: number;
      }>;
    };
    value?: {
      completedImprovements: Array<{
        title: string;
        roiRange: string;
        estimatedCost: number;
      }>;
      remainingImprovements: Array<{
        title: string;
        roiRange: string;
        estimatedCost: number;
        priority: string;
      }>;
      completedValueIncrease: {
        minValue: number;
        maxValue: number;
      };
      potentialValueIncrease: {
        minValue: number;
        maxValue: number;
      };
    };
  };
  comparables: ComparableHome[];
  report: ReadinessReport;
  propertyId: string;
}

export default function SellerPrepOverview({
  overview,
  comparables,
  report,
  propertyId,
}: SellerPrepOverviewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      return api.updateSellerPrepItem(itemId, status);
    },
    onMutate: async ({ itemId, status }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['seller-prep', propertyId] });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(['seller-prep', propertyId]);

      // Optimistically update
      queryClient.setQueryData(['seller-prep', propertyId], (old: any) => {
        if (!old) return old;
        
        const updatedItems = old.overview.items.map((item: SellerPrepItem) =>
          item.id === itemId ? { ...item, status } : item
        );
        
        const done = updatedItems.filter((i: SellerPrepItem) => i.status === 'DONE').length;
        const total = updatedItems.length;
        const completionPercent = total ? Math.round((done / total) * 100) : 0;

        return {
          ...old,
          overview: {
            ...old.overview,
            items: updatedItems,
            completionPercent,
          },
        };
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['seller-prep', propertyId], context.previousData);
      }
      toast({
        title: "Error",
        description: "Failed to update task status. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: (data, { status }) => {
      const actionText = status === 'DONE' ? 'completed' : status === 'SKIPPED' ? 'skipped' : 'updated';
      toast({
        title: "Success",
        description: `Task ${actionText} successfully!`,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-prep', propertyId] });
    },
  });

  const handleStatusUpdate = (itemId: string, status: 'DONE' | 'SKIPPED' | 'PLANNED') => {
    updateStatusMutation.mutate({ itemId, status });
  };

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const hasComparables = comparables && comparables.length > 0;
  const hasPreferences = overview.preferences;
  const [showLeadModal, setShowLeadModal] = useState(false);

  return (
    <div className="space-y-6">
      {/* Personalized Summary (if preferences exist) */}
      {hasPreferences && overview.personalizedSummary && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-sm text-blue-900">
              <strong>Your Plan:</strong> {overview.personalizedSummary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Completion */}
      <Card className="bg-green-50 border-green-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <p className="text-sm text-green-800">
                Seller prep completion: <strong>{overview.completionPercent}%</strong>
              </p>
            </div>
            <div className="w-32 bg-green-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${overview.completionPercent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* NEW: Value Estimator */}
      {FEATURE_FLAGS.VALUE_ESTIMATOR && overview.value && (
        <ValueEstimatorCard
          completedImprovements={overview.value.completedImprovements}
          remainingImprovements={overview.value.remainingImprovements}
          completedValueIncrease={overview.value.completedValueIncrease}
          potentialValueIncrease={overview.value.potentialValueIncrease}
        />
      )}

      {/* NEW: Budget Tracker */}
      {FEATURE_FLAGS.BUDGET_TRACKER && overview.budget && (
        <BudgetTrackerCard
          totalBudget={overview.budget.totalBudget}
          spentAmount={overview.budget.spentAmount}
          remainingTasks={overview.budget.remainingTasks}
        />
      )}

      {/* ROI Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hammer className="h-5 w-5 text-green-600" />
            {hasPreferences ? 'Your Personalized Action Plan' : 'ROI-Based Prep Checklist'}
          </CardTitle>
          <CardDescription>
            {hasPreferences
              ? 'Prioritized for your timeline, budget, and goals'
              : 'Prioritized improvements based on resale impact'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.items.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No preparation items available.
            </p>
          ) : (
            overview.items.map((item) => {
              const isExpanded = expandedItems.has(item.id);
              const isDone = item.status === 'DONE';
              const isSkipped = item.status === 'SKIPPED';
              const isUpdating = updateStatusMutation.isPending && 
                updateStatusMutation.variables?.itemId === item.id;

              return (
                <div
                  key={item.id}
                  className={`border rounded-lg p-4 transition-all ${
                    isDone ? 'bg-green-50 border-green-200' :
                    isSkipped ? 'bg-gray-50 border-gray-200' :
                    'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {isDone && <CheckCircle className="h-5 w-5 text-green-600" />}
                        <p className={`font-medium ${isDone ? 'line-through text-gray-500' : ''}`}>
                          {item.title}
                        </p>
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
                      <p className="text-xs text-muted-foreground">
                        ROI: {item.roiRange} • Cost: {item.costBucket}
                      </p>
                    </div>

                    <Badge
                      variant={
                        isDone ? "default" :
                        isSkipped ? "outline" :
                        "secondary"
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                    {!isDone && !isSkipped && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleStatusUpdate(item.id, 'DONE')}
                          disabled={isUpdating}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>✓ Mark Done</>
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusUpdate(item.id, 'SKIPPED')}
                          disabled={isUpdating}
                        >
                          Skip This
                        </Button>
                      </>
                    )}
                    
                    {(isDone || isSkipped) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStatusUpdate(item.id, 'PLANNED')}
                        disabled={isUpdating}
                      >
                        <Undo2 className="h-4 w-4 mr-1" />
                        Undo
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Comparables - unchanged */}
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
                  Real estate data integration coming soon. Check back later.
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
                      : 'Price N/A'}
                  </strong>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Readiness Report - unchanged */}
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

      {/* Lead Capture CTA */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-2">
                Need Professional Help?
              </h3>
              <p className="text-sm text-blue-800 mb-3">
                Connect with verified contractors for painting, repairs, staging, and more.
                Get free quotes in 24 hours.
              </p>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>✓ Licensed and insured professionals</li>
                <li>✓ Up to 3 free quotes to compare</li>
                <li>✓ No obligation</li>
              </ul>
            </div>

            <Button
              type="button"
              onClick={() => setShowLeadModal(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Get Free Quotes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lead Capture Modal */}
      <LeadCaptureModal
        propertyId={propertyId}
        open={showLeadModal}
        onClose={() => setShowLeadModal(false)}
        checklistItems={overview.items.map(item => ({
          code: item.id,
          title: item.title
        }))}
      />
    </div>
  );
}