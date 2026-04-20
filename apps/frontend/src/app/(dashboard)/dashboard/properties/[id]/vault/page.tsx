'use client';

import React, { useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  Box,
  Camera,
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  Upload,
  Zap,
} from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';

import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { listInventoryItems } from '../../../inventory/inventoryApi';
import { MagicCaptureSheet } from '@/components/orchestration/MagicCaptureSheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { useToast } from '@/components/ui/use-toast';
import type { InventoryItem } from '@/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function coverageStatus(item: InventoryItem): 'covered' | 'partial' | 'none' {
  const w = Boolean(item.warrantyId);
  const i = Boolean(item.insurancePolicyId);
  if (w && i) return 'covered';
  if (w || i) return 'partial';
  return 'none';
}

function coverageDot(status: 'covered' | 'partial' | 'none') {
  if (status === 'covered') return 'bg-emerald-500';
  if (status === 'partial') return 'bg-amber-400';
  return 'bg-slate-300';
}

function warrantyDaysLeft(expiryDate: string): number {
  try {
    return differenceInCalendarDays(parseISO(expiryDate), new Date());
  } catch {
    return 0;
  }
}

function warrantyStatusColor(days: number) {
  if (days < 0) return 'text-slate-400';
  if (days <= 30) return 'text-red-600';
  if (days <= 90) return 'text-amber-600';
  return 'text-emerald-600';
}

function warrantyBadge(days: number) {
  if (days < 0) return { label: 'Expired', cls: 'bg-slate-100 text-slate-500' };
  if (days <= 30) return { label: `${days}d left`, cls: 'bg-red-50 text-red-600' };
  if (days <= 90) return { label: `${days}d left`, cls: 'bg-amber-50 text-amber-700' };
  return {
    label: format(parseISO('2000-01-01'), 'MMM yyyy').replace(
      '2000',
      parseISO('2000-01-01').getFullYear().toString(),
    ),
    cls: 'bg-emerald-50 text-emerald-700',
  };
}

// ─── Quick Capture Bar ───────────────────────────────────────────────────────

function QuickCaptureBar({
  propertyId,
  onCameraClick,
  onUploadClick,
}: {
  propertyId: string;
  onCameraClick: () => void;
  onUploadClick: () => void;
}) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur-sm">
      <button
        onClick={onCameraClick}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
      >
        <Camera className="h-3.5 w-3.5" />
        Photo
      </button>
      <button
        onClick={onUploadClick}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-muted/60 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Upload className="h-3.5 w-3.5" />
        Upload Doc
      </button>
      <button
        onClick={() =>
          router.push(`/dashboard/properties/${propertyId}/inventory?openDrawer=true`)
        }
        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-muted/60 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Item
      </button>
    </div>
  );
}

// ─── Assets Tab ─────────────────────────────────────────────────────────────

function AssetsTab({
  propertyId,
  onItemClick,
  onCameraClick,
}: {
  propertyId: string;
  onItemClick: (item: InventoryItem) => void;
  onCameraClick: () => void;
}) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['vault-items', propertyId],
    queryFn: () => listInventoryItems(propertyId, {}),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyStateCard
        title="No assets recorded yet"
        description="Snap a photo of any appliance label to instantly add it to your home record."
        action={
          <Button
            onClick={onCameraClick}
            className="mt-4 gap-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700"
          >
            <Camera className="h-4 w-4" />
            Scan First Asset
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const status = coverageStatus(item);
        return (
          <button
            key={item.id}
            onClick={() => onItemClick(item)}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/40"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
              <Box className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {item.name}
                </span>
                <span
                  className={cn('h-2 w-2 flex-shrink-0 rounded-full', coverageDot(status))}
                  title={`Coverage: ${status}`}
                />
              </div>
              {item.brand && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {item.brand}
                  {item.model ? ` · ${item.model}` : ''}
                </p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
          </button>
        );
      })}
    </div>
  );
}

// ─── Documents Tab ───────────────────────────────────────────────────────────

function DocumentsTab({
  propertyId,
  onUploadClick,
}: {
  propertyId: string;
  onUploadClick: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['vault-docs', propertyId],
    queryFn: () => api.listDocuments(propertyId),
    staleTime: 5 * 60 * 1000,
  });

  const docs = data?.success ? data.data.documents : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <EmptyStateCard
        title="No documents yet"
        description="Upload receipts, manuals, permits, and insurance policies to secure them here."
        action={
          <Button
            onClick={onUploadClick}
            variant="outline"
            className="mt-4 gap-2 rounded-xl"
          >
            <Upload className="h-4 w-4" />
            Upload First Document
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {docs.map((doc: any) => (
        <a
          key={doc.id}
          href={doc.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-blue-200 hover:bg-blue-50/30"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{doc.name || 'Untitled'}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {doc.documentType?.replace(/_/g, ' ') ?? 'Document'}
              {doc.createdAt
                ? ` · ${format(parseISO(doc.createdAt), 'MMM d, yyyy')}`
                : ''}
            </p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50" />
        </a>
      ))}
    </div>
  );
}

// ─── Coverage Tab ─────────────────────────────────────────────────────────────

function CoverageTab({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['vault-warranties', propertyId],
    queryFn: () => api.listWarranties(propertyId),
    staleTime: 5 * 60 * 1000,
  });

  const warranties = data?.success ? data.data.warranties : [];
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
      </div>
    );
  }

  if (warranties.length === 0) {
    return (
      <EmptyStateCard
        title="No warranties or policies"
        description="Track appliance warranties and insurance policies to stay protected and never miss an expiry."
        action={
          <Button
            onClick={() => router.push('/dashboard/warranties')}
            variant="outline"
            className="mt-4 gap-2 rounded-xl"
          >
            <Plus className="h-4 w-4" />
            Add Coverage
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {warranties.map((w: any) => {
        const days = warrantyDaysLeft(w.expiryDate);
        const badge = warrantyBadge(days);
        return (
          <div
            key={w.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50">
              <BadgeCheck className="h-4 w-4 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {w.providerName || 'Coverage'}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {w.category?.replace(/_/g, ' ') ?? 'Warranty'}
                {w.expiryDate
                  ? ` · expires ${format(parseISO(w.expiryDate), 'MMM d, yyyy')}`
                  : ''}
              </p>
            </div>
            <span
              className={cn(
                'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                badge.cls,
              )}
            >
              {days < 0 ? 'Expired' : `${days}d left`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────

function TimelineTab({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['vault-events', propertyId],
    queryFn: () => api.get<{ events: any[] }>(`/api/properties/${propertyId}/home-events?limit=20`),
    staleTime: 5 * 60 * 1000,
  });

  const events: any[] = (data as any)?.data?.events ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyStateCard
        title="No care history yet"
        description="Every scan, upload, and action you take builds a verified timeline here — proof of care that adds resale value."
      />
    );
  }

  return (
    <div className="relative space-y-0 pl-6">
      <div className="absolute left-2.5 top-2 bottom-2 w-px bg-border" />
      {events.map((ev: any, idx: number) => (
        <div key={ev.id ?? idx} className="relative pb-4">
          <div className="absolute -left-[15px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-brand-500" />
          <p className="text-sm font-medium text-foreground leading-snug">
            {ev.title ?? ev.eventType?.replace(/_/g, ' ')}
          </p>
          {ev.description && (
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
              {ev.description}
            </p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {ev.eventDate
              ? format(parseISO(ev.eventDate), 'MMM d, yyyy')
              : ev.createdAt
              ? format(parseISO(ev.createdAt), 'MMM d, yyyy')
              : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

import { 
  ConfidenceBadge, 
  SourceChip, 
  WhyThisMattersCard, 
  EstimatedSavingsBadge, 
  RiskOfDelayBadge,
  TrustMetadataBar 
} from '@/components/trust';
import { listIncidents } from '../incidents/incidentsApi';

// ... (existing imports)

// ─── Asset Detail Sheet ───────────────────────────────────────────────────────

function AssetDetailSheet({
  item,
  onClose,
}: {
  item: InventoryItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const propertyId = item?.propertyId;

  // 1. Fetch linked documents
  const { data: allDocsData } = useQuery({
    queryKey: ['vault-docs', propertyId],
    queryFn: async () => {
      if (!propertyId) return { documents: [] };
      const res = await api.listDocuments(propertyId);
      if (res.success) return res.data;
      return { documents: [] };
    },
    enabled: !!propertyId,
  });

  // 2. Fetch history (Incidents/Service)
  const { data: incidentsData } = useQuery({
    queryKey: ['asset-history', item?.id],
    queryFn: async () => {
      if (!propertyId || !item?.id) return { items: [] };
      return listIncidents({ propertyId, limit: 10 });
    },
    enabled: !!(propertyId && item?.id),
  });

  // 3. Fetch AI Recommendations (from Risk Report)
  const { data: riskReport } = useQuery({
    queryKey: ['risk-report-summary', propertyId],
    queryFn: () => propertyId ? api.getRiskReportSummary(propertyId) : Promise.resolve(null),
    enabled: !!propertyId,
  });

  if (!item) return null;

  const linkedDocs = (allDocsData?.documents || []).filter(
    (doc: any) => doc.inventoryItemId === item.id || (item.warrantyId && doc.warrantyId === item.warrantyId)
  );

  const assetHistory = (incidentsData as any)?.items?.filter(
    (inc: any) => inc.inventoryItemId === item.id
  ) || [];

  const assetRiskDetail = (riskReport && typeof riskReport !== 'string') 
    ? riskReport.details.find(d => d.inventoryItemId === item.id)
    : null;

  const status = coverageStatus(item);
  const statusLabel =
    status === 'covered' ? 'Fully covered' : status === 'partial' ? 'Partially covered' : 'No coverage';
  const statusCls =
    status === 'covered'
      ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
      : status === 'partial'
      ? 'text-amber-700 bg-amber-50 border-amber-100'
      : 'text-slate-500 bg-slate-100 border-slate-200';

  return (
    <Sheet open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl px-0 pb-10 border-t-0 shadow-2xl">
        <div className="mx-auto w-12 h-1.5 bg-slate-200 rounded-full mb-2" />
        
        <SheetHeader className="px-6 pb-4 border-b border-slate-50">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <SheetTitle className="text-left text-xl font-bold text-slate-900">{item.name}</SheetTitle>
              <div className="flex items-center gap-2">
                <ConfidenceBadge level={item.brand && item.model ? 'high' : 'medium'} />
                {item.category && <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.category}</span>}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 py-6 space-y-8">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Make & Model</p>
              <p className="text-sm font-bold text-slate-900 truncate">{item.brand || 'Unknown'} {item.model || ''}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">{item.serialNo || 'No serial recorded'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Age & Status</p>
              <p className="text-sm font-bold text-slate-900">
                {item.purchasedOn ? `${differenceInCalendarDays(new Date(), parseISO(item.purchasedOn)) / 365 > 1 ? Math.floor(differenceInCalendarDays(new Date(), parseISO(item.purchasedOn)) / 365) + ' years old' : 'New'}` : 'Age unknown'}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={cn("h-1.5 w-1.5 rounded-full", coverageDot(status))} />
                <span className="text-[11px] font-medium text-slate-600">{statusLabel}</span>
              </div>
            </div>
          </div>

          {/* AI Recommendations (Dynamic from Risk Engine) */}
          {assetRiskDetail && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-brand-600" />
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">AI Recommendation</h4>
              </div>
              <div className="rounded-2xl border-2 border-brand-100 bg-brand-50/30 p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900 leading-tight">
                      {assetRiskDetail.actionCta || `Schedule ${item.name} Inspection`}
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {assetRiskDetail.riskLevel === 'HIGH' || assetRiskDetail.riskLevel === 'ELEVATED' 
                        ? `This asset is approaching its ${assetRiskDetail.expectedLife}-year life expectancy. Proactive service can prevent a $${assetRiskDetail.replacementCost} emergency replacement.`
                        : `Your ${item.name} is in good health. Keep it that way with regular filter changes.`}
                    </p>
                  </div>
                  {assetRiskDetail.riskLevel === 'HIGH' && (
                    <div className="shrink-0 bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded-lg uppercase">High Risk</div>
                  )}
                </div>
                
                <WhyThisMattersCard 
                  explanation={`Based on the ${item.brand} ${item.model} reliability data and your installation date, there is a ${Math.round(assetRiskDetail.probability * 100)}% probability of failure within 12 months.`}
                  assumptions={[`Installation Year: ${item.purchasedOn ? format(parseISO(item.purchasedOn), 'yyyy') : 'Estimate'}`, `Industry Avg Life: ${assetRiskDetail.expectedLife} years`]}
                  className="bg-white border-brand-100 shadow-sm"
                />

                <Button className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-6 font-bold shadow-lg shadow-brand-100">
                  Book Service Estimate
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* History Timeline */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Care History</h4>
              </div>
              <span className="text-[11px] font-bold text-brand-600 uppercase tracking-widest">{assetHistory.length} Events</span>
            </div>
            
            {assetHistory.length > 0 ? (
              <div className="space-y-3 pl-2">
                {assetHistory.map((ev: any) => (
                  <div key={ev.id} className="flex gap-4 border-l-2 border-slate-100 pl-4 py-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 leading-none">{ev.title}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{format(parseISO(ev.openedAt), 'MMM d, yyyy')} · {ev.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                <p className="text-xs text-slate-500 italic">No previous service or incidents recorded for this asset.</p>
              </div>
            )}
          </div>

          {/* Linked Documents */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Linked Documents</h4>
            </div>
            
            {linkedDocs.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {linkedDocs.map((doc: any) => (
                  <a 
                    key={doc.id} 
                    href={doc.fileUrl} 
                    target="_blank" 
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white hover:border-brand-200 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-50 p-2 rounded-lg group-hover:bg-brand-50 transition-colors">
                        <FileText className="h-4 w-4 text-blue-600 group-hover:text-brand-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{doc.name}</p>
                        <p className="text-[10px] text-slate-500 uppercase font-medium">{doc.type}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-brand-600" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                <p className="text-xs text-slate-500 italic">No manuals or receipts linked to this asset.</p>
                <Button variant="ghost" className="mt-2 text-[11px] text-brand-600 font-bold hover:bg-brand-50">
                  <Upload className="h-3 w-3 mr-1.5" />
                  Upload Receipt
                </Button>
              </div>
            )}
          </div>

          {/* Advanced Actions */}
          <div className="pt-4 border-t border-slate-100">
            <Button
              onClick={() => {
                onClose();
                if (propertyId) {
                  router.push(
                    `/dashboard/properties/${propertyId}/inventory?openItemId=${item.id}`,
                  );
                }
              }}
              variant="ghost"
              className="w-full justify-between rounded-xl text-slate-500 hover:text-slate-900"
            >
              Edit technical specifications
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Upload Doc Dialog (lightweight) ─────────────────────────────────────────

function useDocUpload(propertyId: string) {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const trigger = () => fileRef.current?.click();

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !propertyId) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Unsupported file type', description: 'Use JPEG, PNG, WEBP, or PDF.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const res = await api.uploadDocument(file, { propertyId, type: 'OTHER', name: file.name });
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['vault-docs', propertyId] });
        toast({ title: 'Document uploaded', description: file.name });
      } else {
        toast({ title: 'Upload failed', variant: 'destructive' });
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const Input = (
    <input
      ref={fileRef}
      type="file"
      accept=".jpg,.jpeg,.png,.webp,.pdf"
      className="hidden"
      onChange={handleChange}
    />
  );

  return { trigger, Input, uploading };
}

// ─── Vault KPI Strip ──────────────────────────────────────────────────────────

function VaultKpiStrip({ propertyId }: { propertyId: string }) {
  const itemsQ = useQuery({
    queryKey: ['vault-items', propertyId],
    queryFn: () => listInventoryItems(propertyId, {}),
    staleTime: 5 * 60 * 1000,
  });
  const docsQ = useQuery({
    queryKey: ['vault-docs', propertyId],
    queryFn: () => api.listDocuments(propertyId),
    staleTime: 5 * 60 * 1000,
  });
  const warQ = useQuery({
    queryKey: ['vault-warranties', propertyId],
    queryFn: () => api.listWarranties(propertyId),
    staleTime: 5 * 60 * 1000,
  });

  const itemCount = itemsQ.data?.length ?? 0;
  const docCount = docsQ.data?.success ? docsQ.data.data.documents.length : 0;
  const warCount = warQ.data?.success ? warQ.data.data.warranties.length : 0;
  const coveredCount = (itemsQ.data ?? []).filter(
    (i) => coverageStatus(i) === 'covered',
  ).length;

  const kpis = [
    { label: 'Assets', value: itemCount },
    { label: 'Documents', value: docCount },
    { label: 'Coverage', value: warCount },
    {
      label: 'Protected',
      value: itemCount > 0 ? `${Math.round((coveredCount / itemCount) * 100)}%` : '—',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {kpis.map((k) => (
        <div key={k.label} className="flex flex-col items-center rounded-xl bg-muted/60 py-3">
          <span className="text-[18px] font-bold leading-none text-foreground">{k.value}</span>
          <span className="mt-1 text-[10px] text-muted-foreground">{k.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const VALID_TABS = ['assets', 'documents', 'coverage', 'timeline'] as const;
type VaultTab = (typeof VALID_TABS)[number];

export default function VaultPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab') as VaultTab | null;
  const defaultTab: VaultTab =
    rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'assets';

  const [activeTab, setActiveTab] = useState<VaultTab>(defaultTab);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const { trigger: triggerUpload, Input: UploadInput, uploading } = useDocUpload(propertyId);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as VaultTab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <div className="flex flex-col">
      {UploadInput}

      <QuickCaptureBar
        propertyId={propertyId}
        onCameraClick={() => setScannerOpen(true)}
        onUploadClick={triggerUpload}
      />

      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
        <MobilePageIntro
          title="Vault"
          subtitle="Your home's secure memory layer — assets, documents, coverage, and history."
        />

        <VaultKpiStrip propertyId={propertyId} />

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="w-full rounded-xl bg-muted/60 p-1">
            <TabsTrigger value="assets" className="flex-1 rounded-lg text-xs">
              Assets
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex-1 rounded-lg text-xs">
              Docs
            </TabsTrigger>
            <TabsTrigger value="coverage" className="flex-1 rounded-lg text-xs">
              Coverage
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex-1 rounded-lg text-xs">
              Timeline
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="assets" className="m-0">
              <AssetsTab
                propertyId={propertyId}
                onItemClick={setSelectedItem}
                onCameraClick={() => setScannerOpen(true)}
              />
            </TabsContent>

            <TabsContent value="documents" className="m-0">
              <DocumentsTab propertyId={propertyId} onUploadClick={triggerUpload} />
            </TabsContent>

            <TabsContent value="coverage" className="m-0">
              <CoverageTab propertyId={propertyId} />
            </TabsContent>

            <TabsContent value="timeline" className="m-0">
              <TimelineTab propertyId={propertyId} />
            </TabsContent>
          </div>
        </Tabs>

        {/* Proof of care CTA */}
        <MobileSection className="pt-2">
          <MobileCard className="flex items-center gap-3 border-brand-100 bg-brand-50/50 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-100">
              <Zap className="h-5 w-5 text-brand-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Build your Proof of Care</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Verified home history adds 4–7% to resale value.
              </p>
            </div>
            <a
              href={`/vault/${propertyId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              Preview
            </a>
          </MobileCard>
        </MobileSection>

        <BottomSafeAreaReserve size="chatAware" />
      </div>

      <MagicCaptureSheet isOpen={scannerOpen} onOpenChange={setScannerOpen} />

      <AssetDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
