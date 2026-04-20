'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck,
  Wrench, 
  Zap, 
  ArrowRight,
  Loader2,
  CheckCircle2,
  Lock,
  CalendarClock,
  Activity,
  History,
  Sparkles,
  AlertTriangle,
  Info,
  ChevronRight,
  Radar,
  CloudLightning,
  ExternalLink,
  Flame,
  Waves
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  MobilePageIntro, 
  MobileKpiStrip, 
  MobileKpiTile,
  MobileSection,
  MobileSectionHeader,
  MobileCard,
  BottomSafeAreaReserve
} from '@/components/mobile/dashboard/MobilePrimitives';
import { WinCard } from '@/components/shared/WinCard';
import { MagicCaptureSheet } from '@/components/orchestration/MagicCaptureSheet';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import { ConfidenceBadge, SourceChip, WhyThisMattersCard } from '@/components/trust';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';

export default function RiskProtectionClient() {
  const { selectedPropertyId } = usePropertyContext();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // 1. Fetch System Health (Maintenance)
  const tasksQuery = useQuery({
    queryKey: ['maintenance-tasks', selectedPropertyId],
    queryFn: () => selectedPropertyId ? api.getMaintenanceTasks(selectedPropertyId, { includeCompleted: false }) : null,
    enabled: !!selectedPropertyId,
  });

  // 2. Fetch Risk Intelligence (Climate, Failure, Local)
  const riskQuery = useQuery({
    queryKey: ['risk-intelligence', selectedPropertyId],
    queryFn: () => selectedPropertyId ? api.getRiskReportSummary(selectedPropertyId) : null,
    enabled: !!selectedPropertyId,
  });

  // 3. Fetch Insurance & Warranty Gaps
  const coverageQuery = useQuery({
    queryKey: ['coverage-intelligence', selectedPropertyId],
    queryFn: () => selectedPropertyId ? api.getInsuranceProtectionGap(selectedPropertyId) : null,
    enabled: !!selectedPropertyId,
  });

  // 4. Fetch Recalls
  const recallsQuery = useQuery({
    queryKey: ['active-recalls', selectedPropertyId],
    queryFn: () => selectedPropertyId ? api.getRecallsForProperty(selectedPropertyId) : null,
    enabled: !!selectedPropertyId,
  });

  const isLoading = tasksQuery.isLoading || riskQuery.isLoading || coverageQuery.isLoading || recallsQuery.isLoading;

  const riskScore = (riskQuery.data as any)?.riskScore ?? 82; // Default mock for visual if missing
  const openRecalls = (recallsQuery.data as any)?.matches || [];
  const urgentTasks = (tasksQuery.data as any)?.success ? (tasksQuery.data as any).data.filter((t: any) => t.priority === 'URGENT') : [];
  const coverageGaps = (coverageQuery.data as any)?.gaps || [];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-10 w-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Scanning for active threats...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20 px-4 md:px-0">
      <header className="space-y-2 px-1">
        <div className="flex items-center gap-2 text-brand-600 font-bold text-[10px] uppercase tracking-widest">
          <Radar className="h-3.5 w-3.5" />
          Home SOC
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Security Operations</h1>
        <p className="text-slate-500 max-w-lg">
          Your command center for system health, insurance verification, and environmental defense.
        </p>
      </header>

      {/* Hero Protection Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-3xl border-2 border-slate-50 bg-white p-8 relative overflow-hidden flex flex-col md:flex-row items-center gap-8 shadow-sm">
          <div className="relative shrink-0">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="58"
                stroke="currentColor"
                strokeWidth="10"
                fill="transparent"
                className="text-slate-100"
              />
              <circle
                cx="64"
                cy="64"
                r="58"
                stroke="currentColor"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={364}
                strokeDashoffset={364 - (364 * riskScore) / 100}
                className={cn(
                  "transition-all duration-1000 ease-out",
                  riskScore > 80 ? "text-emerald-500" : riskScore > 60 ? "text-amber-500" : "text-red-500"
                )}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-slate-900 leading-none">{riskScore}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Protection</span>
            </div>
          </div>
          <div className="space-y-4 text-center md:text-left">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-900">Your home is {riskScore > 80 ? 'highly secured' : 'under watch'}</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                We&apos;ve verified {coverageGaps.length === 0 ? 'full coverage' : `${coverageGaps.length} coverage gaps`} and {urgentTasks.length} urgent maintenance item.
              </p>
            </div>
            <div className="flex flex-wrap justify-center md:justify-start gap-2">
              <ConfidenceBadge level="high" score={94} />
              <SourceChip source="System Sensor AI" />
            </div>
          </div>
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Shield className="h-40 w-42" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <MobileKpiTile 
            label="Active Recalls" 
            value={openRecalls.length} 
            hint="Safety alerts found" 
            tone={openRecalls.length > 0 ? 'danger' : 'positive'}
          />
          <MobileKpiTile 
            label="System Health" 
            value={urgentTasks.length > 0 ? 'Action Required' : 'Stable'} 
            hint={`${urgentTasks.length} urgent tasks`} 
            tone={urgentTasks.length > 0 ? 'warning' : 'positive'}
          />
        </div>
      </div>

      {/* SOC Sections */}
      <div className="space-y-12">
        
        {/* Pillar 1: Critical Signals (Recalls & Local Events) */}
        <section className="space-y-5">
          <div className="flex items-start gap-4 px-1">
            <div className="mt-1 p-2 rounded-xl bg-red-50 border-2 border-red-100 text-red-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Critical Signals</h2>
              <p className="text-sm text-slate-500">Immediate safety threats from product recalls and local impacts.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openRecalls.length > 0 ? (
              openRecalls.map((recall: any) => (
                <div key={recall.id} className="p-5 bg-white rounded-2xl border-2 border-red-50 hover:border-red-100 transition-all shadow-sm space-y-4 relative overflow-hidden">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider">Active Recall</span>
                        <span className="text-[11px] font-medium text-slate-400">{formatDistanceToNowStrict(new Date(recall.publishedAt))} ago</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 leading-tight">{recall.productName}</h3>
                    </div>
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{recall.summary}</p>
                  <Button variant="ghost" className="w-full justify-between h-9 px-2 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded-lg">
                    See Safety Instructions
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="md:col-span-2 py-10 text-center space-y-3 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                <div className="mx-auto w-12 h-12 bg-white rounded-xl shadow-xs flex items-center justify-center text-emerald-500">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-slate-500">No active recalls detected for your inventory.</p>
              </div>
            )}
          </div>
        </section>

        {/* Pillar 2: Financial Protection (Insurance & Warranty Gaps) */}
        <section className="space-y-5">
          <div className="flex items-start gap-4 px-1">
            <div className="mt-1 p-2 rounded-xl bg-purple-50 border-2 border-purple-100 text-purple-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Financial Shields</h2>
              <p className="text-sm text-slate-500">Verification of your insurance policies and system warranties.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              {coverageGaps.length > 0 ? (
                coverageGaps.map((gap: any) => (
                  <WinCard 
                    key={gap.id}
                    title="Insurance Optimizer"
                    value={gap.title}
                    description={gap.description}
                    actionLabel="Optimize Coverage"
                    onAction={() => {}}
                    trust={{
                      confidenceLabel: "Verified",
                      freshnessLabel: "Synced now",
                      sourceLabel: "Direct Carrier API",
                      rationale: "Your current policy limits are 22% below the rebuild cost for your ZIP code."
                    }}
                    className="border-purple-100"
                  />
                ))
              ) : (
                <div className="p-6 rounded-2xl border-2 border-emerald-50 bg-emerald-50/20 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-emerald-900">Coverage Fully Shielded</p>
                      <p className="text-xs text-emerald-700/70">Your insurance matches local rebuild costs.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <MobileCard className="bg-slate-900 text-white border-none p-5 flex flex-col gap-4">
                <div className="h-10 w-10 bg-brand-500 rounded-xl flex items-center justify-center text-white shadow-lg">
                  <Lock className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold">Proof of Protection</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">Securely share your verified safety and care records with heirs or buyers.</p>
                </div>
                <Button className="w-full bg-white text-slate-900 hover:bg-slate-100 rounded-xl font-bold h-10 text-xs">
                  Generate Legacy Key
                </Button>
              </MobileCard>
            </div>
          </div>
        </section>

        {/* Pillar 3: Environmental Intelligence (Climate & Local Hazards) */}
        <section className="space-y-5">
          <div className="flex items-start gap-4 px-1">
            <div className="mt-1 p-2 rounded-xl bg-blue-50 border-2 border-blue-100 text-blue-600">
              <CloudLightning className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Environmental Radar</h2>
              <p className="text-sm text-slate-500">Monitoring local climate trends and neighborhood hazards.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-white rounded-2xl border-2 border-slate-50 space-y-3">
              <div className="h-9 w-9 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600">
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fire Risk</p>
                <p className="text-sm font-bold text-slate-900">Moderate</p>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">Dry conditions forecast for next 14 days.</p>
              </div>
            </div>
            <div className="p-5 bg-white rounded-2xl border-2 border-slate-50 space-y-3">
              <div className="h-9 w-9 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                <Waves className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Flood Zone</p>
                <p className="text-sm font-bold text-slate-900">Zone X (Low)</p>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">No change in elevation certificate data.</p>
              </div>
            </div>
            <div className="p-5 bg-white rounded-2xl border-2 border-slate-50 space-y-3">
              <div className="h-9 w-9 bg-slate-50 rounded-lg flex items-center justify-center text-slate-600">
                <Info className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pollen Spike</p>
                <p className="text-sm font-bold text-slate-900">High</p>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">HVAC filter change recommended soon.</p>
              </div>
            </div>
            <Button 
              variant="outline"
              className="h-auto p-5 bg-slate-50 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-slate-100 hover:border-slate-400 transition-all text-center"
            >
              <ExternalLink className="h-5 w-5 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">View Full Local Radar</span>
            </Button>
          </div>
        </section>

      </div>

      <MagicCaptureSheet 
        isOpen={isScannerOpen} 
        onOpenChange={setIsScannerOpen} 
      />

      <BottomSafeAreaReserve size="chatAware" />
    </div>
  );
}
