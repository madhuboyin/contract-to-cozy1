'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Wrench, 
  CalendarClock, 
  ChevronRight,
  TrendingUp,
  DollarSign,
  Camera,
  CheckCircle2,
  Clock,
  Zap,
  Info
} from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import { listIncidents } from '../properties/[id]/incidents/incidentsApi';
import { OrchestratedActionDTO, IncidentDTO } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConfidenceBadge, SourceChip, WhyThisMattersCard } from '@/components/trust';
import { CompletionModal } from '@/components/orchestration/CompletionModal';
import { toast } from '@/components/ui/use-toast';
import { track } from '@/lib/analytics/events';
import { ServiceSelectionSheet } from './ServiceSelectionSheet';

interface TriageGroup {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  items: any[];
  tone: 'danger' | 'warning' | 'info' | 'success';
}

export default function ResolutionCenterClient() {
  const queryClient = useQueryClient();
  const { selectedPropertyId } = usePropertyContext();
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isServiceSheetOpen, setIsServiceSheetOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<any>(null);

  // 1. Fetch Orchestrated Actions (Maintenance/Predictive)
  const { data: orchestrationData, isLoading: orchestrationLoading } = useQuery({
    queryKey: ['orchestration-summary', selectedPropertyId],
    queryFn: () => selectedPropertyId ? api.getOrchestrationSummary(selectedPropertyId) : null,
    enabled: !!selectedPropertyId,
  });

  // 2. Fetch Open Incidents (Reactive/Immediate)
  const { data: incidentsData, isLoading: incidentsLoading } = useQuery({
    queryKey: ['active-incidents', selectedPropertyId],
    queryFn: () => selectedPropertyId ? listIncidents({ propertyId: selectedPropertyId, limit: 10 }) : { items: [] },
    enabled: !!selectedPropertyId,
  });

  const isLoading = orchestrationLoading || incidentsLoading;

  const triageGroups = useMemo(() => {
    if (!selectedPropertyId) return [];

    const actions = (orchestrationData as any)?.actions || [];
    const incidents = (incidentsData as any)?.items || [];

    const groups: TriageGroup[] = [];

    // Group A: Immediate Needs (Critical Incidents + Safety Risks)
    const immediate = [
      ...incidents.filter((inc: IncidentDTO) => inc.severity === 'CRITICAL' || inc.severity === 'WARNING'),
      ...actions.filter((a: OrchestratedActionDTO) => a.riskLevel === 'CRITICAL' || a.overdue)
    ];

    if (immediate.length > 0) {
      groups.push({
        id: 'immediate',
        title: 'Immediate Needs',
        subtitle: 'Critical safety issues and active incidents requiring triage.',
        icon: ShieldAlert,
        items: immediate,
        tone: 'danger'
      });
    }

    // Group B: Home Maintenance (Preventative + Seasonal)
    const maintenance = actions.filter((a: OrchestratedActionDTO) => 
      !immediate.some(i => i.id === (a.id || a.actionKey)) && a.status !== 'SUPPRESSED'
    );

    if (maintenance.length > 0) {
      groups.push({
        id: 'maintenance',
        title: 'Home Maintenance',
        subtitle: 'Preventative tasks to extend the life of your appliances.',
        icon: Wrench,
        items: maintenance,
        tone: 'info'
      });
    }

    return groups;
  }, [orchestrationData, incidentsData, selectedPropertyId]);

  const handleOpenComplete = (item: any) => {
    setActiveItem(item);
    setIsCompletionModalOpen(true);
  };

  const handleOpenService = (item: any) => {
    setActiveItem(item);
    setIsServiceSheetOpen(true);
  };

  const handleCompletionSubmit = async (data: any) => {
    if (!activeItem || !selectedPropertyId) return;

    try {
      await api.markOrchestrationActionCompleted(
        selectedPropertyId,
        activeItem.actionKey || activeItem.id,
        data
      );
      toast({ title: "Task completed", description: "Your proof of care has been saved." });
      setIsCompletionModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['orchestration-summary', selectedPropertyId] });
      queryClient.invalidateQueries({ queryKey: ['active-incidents', selectedPropertyId] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-10 w-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Triaging your home needs...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20 px-4 md:px-0">
      <header className="space-y-2 px-1">
        <div className="flex items-center gap-2 text-brand-600 font-bold text-[10px] uppercase tracking-widest">
          <CalendarClock className="h-3.5 w-3.5" />
          Resolution Center
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Home Triage</h1>
        <p className="text-slate-500 max-w-lg">
          We&apos;ve analyzed your home signals to rank exactly what needs your attention today.
        </p>
      </header>

      {triageGroups.length > 0 ? (
        <div className="space-y-12">
          {triageGroups.map(group => (
            <section key={group.id} className="space-y-5">
              <div className="flex items-start gap-4 px-1">
                <div className={cn(
                  "mt-1 p-2 rounded-xl border-2",
                  group.tone === 'danger' ? "bg-red-50 border-red-100 text-red-600" : "bg-blue-50 border-blue-100 text-blue-600"
                )}>
                  <group.icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-slate-900">{group.title}</h2>
                  <p className="text-sm text-slate-500">{group.subtitle}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {group.items.map((item: any) => (
                  <TriageActionCard 
                    key={item.id || item.actionKey} 
                    item={item} 
                    onComplete={() => handleOpenComplete(item)}
                    onOpenService={() => handleOpenService(item)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center space-y-4 bg-white rounded-3xl border border-dashed border-slate-200">
          <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-900">Your Home is All Set</h3>
            <p className="text-slate-500">No active incidents or urgent maintenance required.</p>
          </div>
        </div>
      )}

      {selectedPropertyId && activeItem && (
        <>
          <CompletionModal 
            open={isCompletionModalOpen}
            onClose={() => setIsCompletionModalOpen(false)}
            onSubmit={handleCompletionSubmit}
            actionTitle={activeItem.title}
            propertyId={selectedPropertyId}
            actionKey={activeItem.actionKey || activeItem.id}
            onPhotoUpload={async (file, idx) => {
              const res = await api.uploadCompletionPhoto(selectedPropertyId, activeItem.actionKey || activeItem.id, file, idx);
              return res.data.photo;
            }}
          />
          <ServiceSelectionSheet 
            item={activeItem}
            propertyId={selectedPropertyId}
            isOpen={isServiceSheetOpen}
            onOpenChange={setIsServiceSheetOpen}
          />
        </>
      )}
    </div>
  );
}

function TriageActionCard({ item, onComplete, onOpenService }: { item: any; onComplete: () => void; onOpenService: () => void }) {
  const isIncident = 'severity' in item && !('actionKey' in item);
  const priority = item.riskLevel || item.severity || 'MEDIUM';
  const hasPriceRadar = !isIncident && item.exposure > 0;
  
  return (
    <div className={cn(
      "group relative bg-white rounded-2xl border-2 p-5 transition-all hover:shadow-lg",
      priority === 'CRITICAL' || priority === 'HIGH' ? "border-red-50 hover:border-red-100 shadow-sm" : "border-slate-50 hover:border-brand-100 shadow-sm"
    )}>
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="flex-1 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                priority === 'CRITICAL' || priority === 'HIGH' ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
              )}>
                {isIncident ? 'Active Incident' : 'Maintenance'}
              </span>
              {item.nextDueDate && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                  <Clock className="h-3 w-3" />
                  Due {new Date(item.nextDueDate).toLocaleDateString()}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
              {item.title}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">
              {item.description || item.summary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <ConfidenceBadge level={item.confidence?.level?.toLowerCase() || 'medium'} score={item.confidence?.score ? Math.round(item.confidence.score) : undefined} />
            <SourceChip source={item.primarySignalSource?.sourceSystem || "CtC Intelligence"} />
            {item.exposure && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-100 text-[11px] font-bold text-amber-700">
                <DollarSign className="h-3 w-3" />
                ${Math.round(item.exposure).toLocaleString()} Risk
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0 md:w-48">
          <Button 
            onClick={onComplete}
            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold"
          >
            Mark Fixed
            <CheckCircle2 className="ml-2 h-4 w-4" />
          </Button>
          <Button 
            variant="ghost"
            onClick={onOpenService}
            className="w-full h-11 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl text-xs font-bold border border-slate-100"
          >
            Compare Prices
            <TrendingUp className="ml-2 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {(item.riskLevel === 'CRITICAL' || item.severity === 'CRITICAL') && (
        <div className="mt-5">
          <WhyThisMattersCard 
            explanation="Immediate action is required to prevent property damage or high-cost emergency repairs. Delaying this item increases financial risk."
            className="bg-red-50/50 border-red-100"
            defaultExpanded={true}
          />
        </div>
      )}
    </div>
  );
}
