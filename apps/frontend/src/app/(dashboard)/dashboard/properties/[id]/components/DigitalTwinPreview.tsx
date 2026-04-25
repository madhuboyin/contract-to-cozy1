'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Loader2, ArrowRight, Home, Thermometer, Droplets, Zap, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export function DigitalTwinPreview({ propertyId }: { propertyId: string }) {
  const { data: twinData, isLoading } = useQuery({
    queryKey: ['home-digital-twin', propertyId],
    queryFn: () => api.getHomeDigitalTwin(propertyId),
    enabled: !!propertyId,
  });

  if (isLoading) {
    return (
      <div className="rounded-3xl border-2 border-slate-50 bg-white p-6 flex flex-col items-center justify-center min-h-[200px] space-y-3 shadow-sm">
        <Loader2 className="h-6 w-6 text-brand-400 animate-spin" />
        <p className="text-xs font-bold tracking-normal text-slate-400">Loading Digital Twin...</p>
      </div>
    );
  }

  const twin = twinData;
  const components = twin?.components || [];
  
  // Categorize components for the visual map
  const hvac = components.filter(c => c.componentType === 'HVAC');
  const plumbing = components.filter(c => c.componentType === 'PLUMBING' || c.componentType === 'WATER_HEATER');
  const structural = components.filter(c => c.componentType === 'ROOF' || c.componentType === 'WINDOWS' || c.componentType === 'INSULATION');
  const electrical = components.filter(c => c.componentType === 'ELECTRICAL' || c.componentType === 'SOLAR');

  const getStatusColor = (status: string) => {
    if (status === 'GOOD' || status === 'EXCELLENT') return 'bg-emerald-500 shadow-emerald-200';
    if (status === 'FAIR' || status === 'MONITOR') return 'bg-amber-500 shadow-amber-200';
    if (status === 'POOR' || status === 'REPLACE_SOON') return 'bg-red-500 shadow-red-200';
    return 'bg-slate-300 shadow-slate-100';
  };

  const getSystemStatus = (group: any[]) => {
    if (group.length === 0) return 'UNKNOWN';
    if (group.some(c => c.status === 'POOR' || c.status === 'REPLACE_SOON')) return 'POOR';
    if (group.some(c => c.status === 'FAIR' || c.status === 'MONITOR')) return 'FAIR';
    return 'GOOD';
  };

  return (
    <div className="rounded-3xl border-2 border-slate-50 bg-white p-6 space-y-6 shadow-sm overflow-hidden relative">
      {/* Background wireframe pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      <div className="relative z-10 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand-600 font-bold text-[10px] tracking-normal">
            <Box className="h-3.5 w-3.5" />
            Digital Twin Model
          </div>
          <h3 className="text-xl font-bold text-slate-900">System Map</h3>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-2xl font-black text-slate-900 leading-none">{components.length}</p>
          <p className="text-[10px] font-bold tracking-normal text-slate-400">Tracked Nodes</p>
        </div>
      </div>

      {!twin ? (
        <div className="relative z-10 rounded-2xl bg-slate-50/50 border border-dashed border-slate-200 p-6 text-center space-y-3">
          <Box className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-500">No Digital Twin view generated yet.</p>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs font-bold">
            <Link href={`/dashboard/properties/${propertyId}/tools/home-digital-twin`}>
              Initialize Model
            </Link>
          </Button>
        </div>
      ) : (
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Structural Node */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3 group hover:border-brand-200 transition-colors">
            <div className="flex items-start justify-between">
              <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <Home className="h-4 w-4 text-slate-700" />
              </div>
              <div className={cn("h-2.5 w-2.5 rounded-full shadow-sm", getStatusColor(getSystemStatus(structural)))} />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-normal text-slate-400">Structural</p>
              <p className="text-xs font-bold text-slate-900 mt-0.5">{structural.length} Assets</p>
            </div>
          </div>

          {/* HVAC Node */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3 group hover:border-brand-200 transition-colors">
            <div className="flex items-start justify-between">
              <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <Thermometer className="h-4 w-4 text-slate-700" />
              </div>
              <div className={cn("h-2.5 w-2.5 rounded-full shadow-sm", getStatusColor(getSystemStatus(hvac)))} />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-normal text-slate-400">Climate</p>
              <p className="text-xs font-bold text-slate-900 mt-0.5">{hvac.length} Assets</p>
            </div>
          </div>

          {/* Plumbing Node */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3 group hover:border-brand-200 transition-colors">
            <div className="flex items-start justify-between">
              <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <Droplets className="h-4 w-4 text-slate-700" />
              </div>
              <div className={cn("h-2.5 w-2.5 rounded-full shadow-sm", getStatusColor(getSystemStatus(plumbing)))} />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-normal text-slate-400">Water</p>
              <p className="text-xs font-bold text-slate-900 mt-0.5">{plumbing.length} Assets</p>
            </div>
          </div>

          {/* Electrical Node */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3 group hover:border-brand-200 transition-colors">
            <div className="flex items-start justify-between">
              <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <Zap className="h-4 w-4 text-slate-700" />
              </div>
              <div className={cn("h-2.5 w-2.5 rounded-full shadow-sm", getStatusColor(getSystemStatus(electrical)))} />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-normal text-slate-400">Power</p>
              <p className="text-xs font-bold text-slate-900 mt-0.5">{electrical.length} Assets</p>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 pt-4 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-[11px] font-medium text-slate-500">
            Completeness Score: <strong className="text-slate-900">{twin ? Math.round((twin.completenessScore ?? 0) * 100) : 0}%</strong>
          </span>
        </div>
        <Button asChild variant="ghost" className="h-8 px-2 text-[11px] font-bold text-brand-600 hover:bg-brand-50">
          <Link href={`/dashboard/properties/${propertyId}/tools/home-digital-twin`}>
            Open Full Model
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
