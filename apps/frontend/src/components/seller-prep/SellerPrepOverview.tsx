// apps/frontend/src/components/seller-prep/SellerPrepOverview.tsx (REDESIGNED)
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle, 
  Hammer, 
  TrendingUp, 
  FileText, 
  AlertCircle, 
  Loader2, 
  Undo2, 
  LayoutDashboard, 
  DollarSign, 
  Users 
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/use-toast";
import { LeadCaptureModal } from "@/components/seller-prep/LeadCaptureModal";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { BudgetTrackerCard } from "./BudgetTrackerCard";
import { ValueEstimatorCard } from "./ValueEstimatorCard";
import { ProgressTimeline } from "./ProgressTimeline";
import { AgentInterviewGuide } from "./AgentInterviewGuide";

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
  const [showLeadModal, setShowLeadModal] = useState(false);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      return api.updateSellerPrepItem(itemId, status);
    },
    onMutate: async ({ itemId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['seller-prep', propertyId] });
      const previousData = queryClient.getQueryData(['seller-prep', propertyId]);
      queryClient.setQueryData(['seller-prep', propertyId], (old: any) => {
        if (!old) return old;
        const updatedItems = old.overview.items.map((item: any) =>
          item.id === itemId ? { ...item, status } : item
        );
        const done = updatedItems.filter((i: any) => i.status === 'DONE').length;
        const total = updatedItems.length;
        const completionPercent = total ? Math.round((done / total) * 100) : 0;
        return {
          ...old,
          overview: { ...old.overview, items: updatedItems, completionPercent },
        };
      });
      return { previousData };
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Task updated successfully!" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-prep', propertyId] });
    },
  });

  const handleStatusUpdate = (itemId: string, status: 'DONE' | 'SKIPPED' | 'PLANNED') => {
    updateStatusMutation.mutate({ itemId, status });
  };

  const hasComparables = comparables && comparables.length > 0;
  const hasPreferences = overview.preferences;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* LEFT COLUMN: Main Content Area (Tabs) */}
      <div className="lg:col-span-8 space-y-6">
        <Tabs defaultValue="checklist" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="checklist" className="flex items-center gap-2">
              <Hammer className="h-4 w-4" /> Action Plan
            </TabsTrigger>
            <TabsTrigger value="financials" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Financials
            </TabsTrigger>
            <TabsTrigger value="market" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Market Insights
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Agent Guide
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Action Plan & History */}
          <TabsContent value="checklist" className="space-y-6 outline-none">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {hasPreferences ? 'Your Personalized Checklist' : 'ROI-Based Prep Checklist'}
                </CardTitle>
                <CardDescription>
                  Focus on high-ROI tasks to maximize your sale price.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.items.length === 0 ? (
                  <p className="text-sm text-gray-500 py-8 text-center">No tasks available.</p>
                ) : (
                  overview.items.map((item) => (
                    <TaskItem 
                      key={item.id} 
                      item={item} 
                      onUpdate={handleStatusUpdate} 
                      isUpdating={updateStatusMutation.isPending && updateStatusMutation.variables?.itemId === item.id}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <ProgressTimeline items={overview.items as any} startDate={new Date().toISOString()} />
          </TabsContent>

          {/* TAB 2: Budget & Value Estimates */}
          <TabsContent value="financials" className="space-y-6 outline-none">
            {FEATURE_FLAGS.VALUE_ESTIMATOR && overview.value && (
              <ValueEstimatorCard {...overview.value} />
            )}
            {FEATURE_FLAGS.BUDGET_TRACKER && overview.budget && (
              <BudgetTrackerCard {...overview.budget} />
            )}
          </TabsContent>

          {/* TAB 3: Comps & Report */}
          <TabsContent value="market" className="space-y-6 outline-none">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" /> Comparable Sales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!hasComparables ? (
                  <AlertMessage title="No data available" description="Real estate data integration coming soon." />
                ) : (
                  comparables.map((comp, i) => <CompItem key={i} comp={comp} />)
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" /> Readiness Report
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed">{report.summary}</p>
                {report.risks && report.risks.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                    <p className="text-xs font-medium text-amber-800 mb-2">⚠️ Areas for Attention:</p>
                    <ul className="list-disc ml-5 space-y-1 text-sm text-amber-800">
                      {report.risks.map((risk, i) => <li key={i}>{risk}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* TAB 4: Agent Interview Guide */}
          <TabsContent value="agents" className="outline-none">
            <AgentInterviewGuide />
          </TabsContent>
        </Tabs>
      </div>

      {/* RIGHT COLUMN: Sidebar (Sticky on Desktop) */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="sticky top-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
              <LayoutDashboard className="h-4 w-4" /> Readiness Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Completion Widget */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span>Progress</span>
                <span>{overview.completionPercent}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${overview.completionPercent}%` }}
                />
              </div>
            </div>

            {hasPreferences && overview.personalizedSummary && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 leading-relaxed">
                <strong>Current Strategy:</strong> {overview.personalizedSummary}
              </div>
            )}

            {/* CTA Section */}
            <div className="pt-4 border-t space-y-3">
              <h4 className="text-xs font-bold uppercase text-gray-500 tracking-wider">Expert Assistance</h4>
              <p className="text-xs text-gray-600">Need help with repairs or staging?</p>
              <Button 
                onClick={() => setShowLeadModal(true)} 
                className="w-full bg-blue-600 hover:bg-blue-700 h-9 text-xs"
              >
                Get Free Contractor Quotes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <LeadCaptureModal
        propertyId={propertyId}
        open={showLeadModal}
        onClose={() => setShowLeadModal(false)}
        checklistItems={overview.items.map(item => ({ code: item.id, title: item.title }))}
      />
    </div>
  );
}

// Sub-components for cleaner main render
function TaskItem({ item, onUpdate, isUpdating }: any) {
  const isDone = item.status === 'DONE';
  const isSkipped = item.status === 'SKIPPED';
  return (
    <div className={`border rounded-lg p-4 transition-all ${isDone ? 'bg-green-50 border-green-200' : isSkipped ? 'bg-gray-50 border-gray-200' : 'hover:bg-gray-50'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {isDone && <CheckCircle className="h-4 w-4 text-green-600" />}
            <p className={`text-sm font-medium ${isDone ? 'line-through text-gray-500' : ''}`}>{item.title}</p>
          </div>
          <div className="flex gap-2 items-center">
            <Badge variant={item.priority === 'HIGH' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 h-4 uppercase">{item.priority}</Badge>
            <span className="text-[11px] text-gray-500">ROI: {item.roiRange} • {item.costBucket}</span>
          </div>
        </div>
        <div className="flex gap-1">
          {!isDone && !isSkipped ? (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs px-2 text-green-700 hover:bg-green-50" onClick={() => onUpdate(item.id, 'DONE')} disabled={isUpdating}>✓ Done</Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs px-2" onClick={() => onUpdate(item.id, 'SKIPPED')} disabled={isUpdating}>Skip</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onUpdate(item.id, 'PLANNED')} disabled={isUpdating}><Undo2 className="h-3 w-3 mr-1" /> Undo</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CompItem({ comp }: { comp: ComparableHome }) {
  return (
    <div className="flex justify-between items-start border-b pb-3 last:border-0 last:pb-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{comp.address}</p>
        <p className="text-xs text-gray-500">
          {comp.sqft?.toLocaleString()} sqft • {comp.beds} bed • {comp.baths} bath
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-gray-900">{comp.soldPrice ? `$${comp.soldPrice.toLocaleString()}` : 'Price N/A'}</p>
        <p className="text-[10px] text-gray-400">Sold: {comp.soldDate ? new Date(comp.soldDate).toLocaleDateString() : 'N/A'}</p>
      </div>
    </div>
  );
}

function AlertMessage({ title, description }: { title: string, description: string }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-md">
      <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-amber-800">{title}</p>
        <p className="text-xs text-amber-700 mt-1">{description}</p>
      </div>
    </div>
  );
}