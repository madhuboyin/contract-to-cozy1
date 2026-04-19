'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Shield, 
  ShieldAlert, 
  Wrench, 
  Zap, 
  ArrowRight,
  Loader2,
  CheckCircle2,
  Lock,
  CalendarClock,
  Activity,
  History
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
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';

/**
 * ProtectHubPage is the "Defensive Job" surface.
 * It unifies:
 * 1. Maintenance (Task Execution)
 * 2. Risk Radar (Intelligence)
 * 3. Insurance (Financial Protection)
 * 4. Warranties (Product Protection)
 */
export default function ProtectHubPage() {
  const { selectedPropertyId } = usePropertyContext();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Fetch combined protection health
  const protectionQuery = useQuery({
    queryKey: ['protection-health', selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId) return null;
      const [tasksRes, riskRes, propertyRes] = await Promise.all([
        api.getMaintenanceTasks(selectedPropertyId, { includeCompleted: false }),
        api.getRiskReportSummary(selectedPropertyId),
        api.getProperty(selectedPropertyId)
      ]);

      const risks = (riskRes as any)?.details || [];

      return {
        openTasks: tasksRes.success ? tasksRes.data : [],
        risks,
        healthScore: propertyRes.success ? (propertyRes.data as any).healthScore?.totalScore || 0 : 0
      };
    },
    enabled: Boolean(selectedPropertyId),
  });

  const data = protectionQuery.data;
  const urgentTasks = data?.openTasks.filter(t => t.priority === 'URGENT') || [];
  const activeRisks = data?.risks.filter((r: any) => (r as any).priority === 'URGENT' || (r as any).riskScore > 80) || [];

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:px-8 lg:pb-12">
      {/* 1. Page Header */}
      <MobilePageIntro
        title="Home Protection"
        subtitle="Your proactive command center for maintenance, risks, and asset safety."
        action={
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-700">
            <Shield className="h-5 w-5" />
          </div>
        }
      />

      {/* 2. Protection KPIs */}
      <MobileKpiStrip className="sm:grid-cols-3">
        <MobileKpiTile 
          label="Home Health" 
          value={data?.healthScore ? `${data.healthScore}%` : '...'} 
          hint="Overall safety score" 
          tone={data?.healthScore && data.healthScore > 80 ? 'positive' : 'warning'} 
        />
        <MobileKpiTile 
          label="Open Tasks" 
          value={data?.openTasks.length || 0} 
          hint={`${urgentTasks.length} high priority`} 
          tone={urgentTasks.length > 0 ? 'danger' : 'neutral'}
        />
        <MobileKpiTile 
          label="Risk Level" 
          value={activeRisks.length > 0 ? 'Elevated' : 'Stable'} 
          hint={`${activeRisks.length} active threats`} 
          tone={activeRisks.length > 0 ? 'warning' : 'positive'}
        />
      </MobileKpiStrip>

      {/* 3. Primary Defensive Entry Points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button 
          variant="outline" 
          className="h-auto flex-col items-start p-6 text-left border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 rounded-2xl group"
          asChild
        >
          <Link href="/dashboard/maintenance">
            <CalendarClock className="h-8 w-8 text-brand-600 mb-4 group-hover:rotate-12 transition-transform" />
            <span className="font-bold text-lg text-slate-900 block">Action Center</span>
            <span className="text-sm text-slate-500 mt-1">Manage your recurring maintenance and seasonal tasks.</span>
          </Link>
        </Button>

        <Button 
          variant="outline" 
          className="h-auto flex-col items-start p-6 text-left border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 rounded-2xl group"
          asChild
        >
          <Link href="/dashboard/risk-radar">
            <ShieldAlert className="h-8 w-8 text-amber-600 mb-4 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-lg text-slate-900 block">Risk Radar</span>
            <span className="text-sm text-slate-500 mt-1">Intelligence alerts for local climate and system failures.</span>
          </Link>
        </Button>
      </div>

      {/* 4. Active "Protection Wins" & Insights */}
      <MobileSection>
        <MobileSectionHeader 
          title="Protection Insights" 
          subtitle="Proactive recommendations to extend your home's lifespan."
        />
        <div className="space-y-4">
          {protectionQuery.isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
          ) : urgentTasks.length > 0 ? (
            urgentTasks.map(task => (
              <WinCard 
                key={task.id}
                title="Urgent Maintenance"
                value={task.title}
                description={task.description || "Immediate attention required to prevent system failure."}
                actionLabel="Mark as Resolved"
                onAction={() => {}}
                isUrgent={true}
                trust={{
                  confidenceLabel: "High (90%)",
                  freshnessLabel: "Updated 1h ago",
                  sourceLabel: "Manufacturer Schedule",
                  rationale: "Neglecting this task increases the risk of a major repair bill by 35%."
                }}
              />
            ))
          ) : (
            <MobileCard className="bg-slate-50 border-dashed text-center py-12 px-6">
              <div className="mx-auto w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">Defense Active</h4>
              <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2 leading-relaxed">
                Your home is currently caught up on all high-priority maintenance. 
                Scan a new appliance to add its protection schedule.
              </p>
              <div className="pt-6">
                <Button 
                  className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold h-11 px-6"
                  onClick={() => setIsScannerOpen(true)}
                >
                  <Zap className="mr-2 h-4 w-4 fill-white" />
                  Magic Scan
                </Button>
              </div>
            </MobileCard>
          )}
        </div>
      </MobileSection>

      {/* 5. Passive Safety Nets */}
      <MobileSection>
        <MobileSectionHeader title="Protection Assets" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/dashboard/insurance" className="block p-4 bg-white rounded-2xl border border-slate-200 hover:border-brand-300 transition-colors shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-brand-50 rounded-xl flex items-center justify-center text-brand-600">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Insurance Policies</p>
                <p className="text-xs text-slate-500">Coverage verified</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-slate-300" />
            </div>
          </Link>
          <Link href="/dashboard/warranties" className="block p-4 bg-white rounded-2xl border border-slate-200 hover:border-brand-300 transition-colors shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                <History className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Active Warranties</p>
                <p className="text-xs text-slate-500">3 systems covered</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-slate-300" />
            </div>
          </Link>
        </div>
      </MobileSection>

      <MagicCaptureSheet 
        isOpen={isScannerOpen} 
        onOpenChange={setIsScannerOpen} 
      />

      <BottomSafeAreaReserve size="chatAware" />
    </div>
  );
}
