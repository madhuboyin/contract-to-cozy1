// apps/frontend/src/components/seller-prep/SellerPrepOverview.tsx
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
    interviews?: any[];
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
  
  // State for agent interviews persistence (max 3)
  const [interviews, setInterviews] = useState(overview.interviews || []);

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
      {/* LEFT COLUMN: Main Interaction Area */}
      <div className="lg:col-span-8 space-y-6">
        <Tabs defaultValue="checklist" className="w-full">
          {/* Layout Fix: Single row grid-cols-4 */}
          <TabsList className="mb-6 grid h-auto w-full grid-cols-4 rounded-2xl border border-white/70 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/50">
            <TabsTrigger value="checklist" className="flex items-center gap-2 text-xs md:text-sm py-2 px-1">
              <Hammer className="h-4 w-4 hidden sm:inline" /> <span>Tasks</span>
            </TabsTrigger>
            <TabsTrigger value="financials" className="flex items-center gap-2 text-xs md:text-sm py-2 px-1">
              <DollarSign className="h-4 w-4 hidden sm:inline" /> <span>Finance</span>
            </TabsTrigger>
            <TabsTrigger value="market" className="flex items-center gap-2 text-xs md:text-sm py-2 px-1">
              <TrendingUp className="h-4 w-4 hidden sm:inline" /> <span>Market</span>
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex items-center gap-2 text-xs md:text-sm py-2 px-1">
              <Users className="h-4 w-4 hidden sm:inline" /> <span>Agents</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Action Plan & History */}
          <TabsContent value="checklist" className="space-y-6 outline-none">
            <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/55">
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
                  <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-300">No tasks available.</p>
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
            <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/55">
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

            <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/55">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" /> Readiness Report
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed">{report.summary}</p>
                {report.risks && report.risks.length > 0 && (
                  <div className="rounded-xl border border-amber-200/70 bg-amber-50/85 p-3 shadow-sm backdrop-blur">
                    <p className="text-xs font-medium text-amber-800 mb-2">⚠️ Areas for Attention:</p>
                    <ul className="list-disc ml-5 space-y-1 text-sm text-amber-800">
                      {report.risks.map((risk, i) => <li key={i}>{risk}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Agent Interview Guide (Interactive Comparison Matrix) */}
          <TabsContent value="agents" className="outline-none">
            <AgentInterviewGuide 
              propertyId={propertyId} 
              interviews={interviews}
              onInterviewsChange={setInterviews}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* RIGHT COLUMN: Persistent Sidebar Stats */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="sticky top-6 rounded-2xl border-white/70 bg-white/80 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/55">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <LayoutDashboard className="h-4 w-4" /> Readiness Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span>Progress</span>
                <span>{overview.completionPercent}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200/80 dark:bg-slate-700/60">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                  style={{ width: `${overview.completionPercent}%` }}
                />
              </div>
            </div>

            {hasPreferences && overview.personalizedSummary && (
              <div className="rounded-xl border border-blue-200/70 bg-blue-50/85 p-3 text-xs leading-relaxed text-blue-800 shadow-sm backdrop-blur">
                <strong>Current Strategy:</strong> {overview.personalizedSummary}
              </div>
            )}

            <div className="space-y-3 border-t border-slate-200/70 pt-4 dark:border-slate-700/70">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Expert Assistance</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300">Need help with repairs or staging?</p>
              <Button 
                onClick={() => setShowLeadModal(true)} 
                className="h-10 w-full rounded-full bg-slate-900 text-xs text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
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

// Sub-components
function TaskItem({ item, onUpdate, isUpdating }: any) {
  const isDone = item.status === 'DONE';
  const isSkipped = item.status === 'SKIPPED';
  return (
    <div className={`rounded-2xl border p-4 shadow-sm backdrop-blur transition-all ${
      isDone
        ? 'border-emerald-200/70 bg-emerald-50/80'
        : isSkipped
          ? 'border-slate-300/70 bg-slate-50/85 dark:border-slate-700/70 dark:bg-slate-900/50'
          : 'border-white/70 bg-white/75 hover:bg-white/90 dark:border-slate-700/70 dark:bg-slate-900/55'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {isDone && <CheckCircle className="h-4 w-4 text-green-600" />}
            <p className={`text-sm font-medium ${isDone ? 'line-through text-slate-500 dark:text-slate-300' : 'text-slate-800 dark:text-slate-100'}`}>{item.title}</p>
          </div>
          <div className="flex gap-2 items-center">
            <Badge variant={item.priority === 'HIGH' ? 'destructive' : 'secondary'} className="text-xs px-1.5 h-5 uppercase">{item.priority}</Badge>
            <span className="text-xs text-slate-500 dark:text-slate-300">ROI: {item.roiRange} • {item.costBucket}</span>
          </div>
        </div>
        <div className="flex gap-1">
          {!isDone && !isSkipped ? (
            <>
              <Button size="sm" variant="outline" className="h-11 sm:h-8 text-xs px-3 sm:px-2 text-green-700 hover:bg-green-50 touch-manipulation" onClick={() => onUpdate(item.id, 'DONE')} disabled={isUpdating}>✓ Done</Button>
              <Button size="sm" variant="ghost" className="h-11 sm:h-8 text-xs px-3 sm:px-2 touch-manipulation" onClick={() => onUpdate(item.id, 'SKIPPED')} disabled={isUpdating}>Skip</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="h-11 sm:h-8 text-xs touch-manipulation" onClick={() => onUpdate(item.id, 'PLANNED')} disabled={isUpdating}><Undo2 className="h-3 w-3 mr-1" /> Undo</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CompItem({ comp }: { comp: ComparableHome }) {
  return (
    <div className="flex items-start justify-between border-b border-slate-200/70 pb-3 last:border-0 last:pb-0 dark:border-slate-700/70">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{comp.address}</p>
        <p className="text-xs text-slate-500 dark:text-slate-300">
          {comp.sqft?.toLocaleString()} sqft • {comp.beds} bed • {comp.baths} bath
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{comp.soldPrice ? `$${comp.soldPrice.toLocaleString()}` : 'Price N/A'}</p>
        <p className="text-xs text-slate-400 dark:text-slate-400">Sold: {comp.soldDate ? new Date(comp.soldDate).toLocaleDateString() : 'N/A'}</p>
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
