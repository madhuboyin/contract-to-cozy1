'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Box, 
  FileText, 
  LayoutGrid, 
  ShieldCheck, 
  Share2, 
  Zap, 
  Lock,
  ArrowRight,
  Loader2,
  CheckCircle2,
  History,
  Award,
  ExternalLink
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
import { MagicCaptureSheet } from '@/components/orchestration/MagicCaptureSheet';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

/**
 * VaultHubPage unifies the "Memory Layer":
 * 1. Inventory (Physical Assets)
 * 2. Documents (Proof & Records)
 * 3. Rooms (Spatial Twin)
 * 4. Proof of Care (Certified History)
 */
export default function VaultHubPage() {
  const { selectedPropertyId } = usePropertyContext();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const vaultStatsQuery = useQuery({
    queryKey: ['vault-stats', selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId) return null;
      const [docs, items, rooms, propertyRes] = await Promise.all([
        api.listDocuments(selectedPropertyId),
        api.get<{ items: any[] }>(`/api/properties/${selectedPropertyId}/inventory`),
        api.get<{ rooms: any[] }>(`/api/properties/${selectedPropertyId}/rooms`),
        api.getProperty(selectedPropertyId)
      ]);
      return {
        docCount: docs.success ? docs.data.documents.length : 0,
        itemCount: items.data?.items?.length || 0,
        roomCount: rooms.data?.rooms?.length || 0,
        healthScore: propertyRes.success ? (propertyRes.data as any).healthScore?.totalScore || 0 : 0
      };
    },
    enabled: Boolean(selectedPropertyId),
  });

  const stats = vaultStatsQuery.data || { docCount: 0, itemCount: 0, roomCount: 0, healthScore: 0 };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:px-8 lg:pb-12">
      {/* 1. Page Header - Premium "Secure" Feel */}
      <MobilePageIntro
        title="My Home History"
        subtitle="The secure, verified record of everything you own and every care action you've taken."
        action={
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-700">
            <Lock className="h-5 w-5" />
          </div>
        }
      />

      {/* 2. Record Snapshot */}
      <MobileKpiStrip className="sm:grid-cols-4">
        <MobileKpiTile 
          label="Records" 
          value={stats.docCount + stats.itemCount} 
          hint="Verified entries" 
          tone="positive" 
        />
        <MobileKpiTile 
          label="Rooms" 
          value={stats.roomCount} 
          hint="Mapped areas" 
          tone="neutral" 
        />

        <MobileKpiTile 
          label="Health" 
          value={`${stats.healthScore}%`} 
          hint="Proof of care" 
          tone={stats.healthScore > 80 ? 'positive' : 'neutral'}
        />
        <MobileKpiTile 
          label="Status" 
          value="SECURE" 
          hint="Bank-level encryption" 
        />
      </MobileKpiStrip>

      {/* 3. The "Digital Twin" Primary Entry Points */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button 
          variant="outline" 
          className="h-auto flex-col items-start p-6 text-left border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 rounded-2xl group"
          asChild
        >
          <Link href={selectedPropertyId ? `/dashboard/properties/${selectedPropertyId}/inventory` : '/dashboard/properties'}>
            <Box className="h-8 w-8 text-brand-600 mb-4 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-lg text-slate-900 block">Inventory</span>
            <span className="text-sm text-slate-500 mt-1">Appliances, systems, and hardware.</span>
            <div className="mt-4 flex items-center text-xs font-semibold text-brand-600 uppercase tracking-wider">
              Manage Assets <ArrowRight className="ml-1 h-3 w-3" />
            </div>
          </Link>
        </Button>

        <Button 
          variant="outline" 
          className="h-auto flex-col items-start p-6 text-left border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-2xl group"
          asChild
        >
          <Link href="/dashboard/documents">
            <FileText className="h-8 w-8 text-blue-600 mb-4 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-lg text-slate-900 block">Documents</span>
            <span className="text-sm text-slate-500 mt-1">Receipts, manuals, and policies.</span>
            <div className="mt-4 flex items-center text-xs font-semibold text-blue-600 uppercase tracking-wider">
              Open Files <ArrowRight className="ml-1 h-3 w-3" />
            </div>
          </Link>
        </Button>

        <Button 
          variant="outline" 
          className="h-auto flex-col items-start p-6 text-left border-slate-200 hover:border-purple-300 hover:bg-purple-50/50 rounded-2xl group"
          asChild
        >
          <Link href={selectedPropertyId ? `/dashboard/properties/${selectedPropertyId}/rooms` : '/dashboard/properties'}>
            <LayoutGrid className="h-8 w-8 text-purple-600 mb-4 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-lg text-slate-900 block">Room Maps</span>
            <span className="text-sm text-slate-500 mt-1">Spatial records and visual history.</span>
            <div className="mt-4 flex items-center text-xs font-semibold text-purple-600 uppercase tracking-wider">
              View Digital Twin <ArrowRight className="ml-1 h-3 w-3" />
            </div>
          </Link>
        </Button>
      </div>

      {/* 4. Proof of Care / Resale Section */}
      <MobileSection>
        <MobileSectionHeader 
          title="Proof of Care" 
          subtitle="Generate a certified report to prove your home's maintenance history to buyers or insurers."
        />
        <MobileCard className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-2xl relative overflow-hidden p-8">
          <div className="absolute -top-10 -right-10 opacity-10">
            <Award className="h-64 w-64 rotate-12" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1 space-y-4 text-center md:text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400 uppercase tracking-widest">
                <ShieldCheck className="h-3.5 w-3.5" /> Certified Record
              </div>
              <h3 className="text-2xl font-bold">Maximize Resale Value</h3>
              <p className="text-slate-400 text-sm leading-relaxed max-w-md">
                Homes with a visible care history sell for an average of 4-7% more. 
                Share your verified "Seller's Vault" with realtors or prospective buyers.
              </p>
              <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                <Button className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl h-11" asChild>
                  <Link href={`/vault/${selectedPropertyId}`} target="_blank">
                    <ExternalLink className="mr-2 h-4 w-4" /> Preview My Report
                  </Link>
                </Button>
                <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl h-11">
                  <Share2 className="mr-2 h-4 w-4" /> Share Public Link
                </Button>
              </div>
            </div>
            
            {/* Visual representation of a "Record" */}
            <div className="w-48 h-64 bg-white/5 rounded-2xl border border-white/10 p-4 space-y-4 shadow-inner flex-shrink-0 flex flex-col justify-center items-center text-center">
               <History className="h-12 w-12 text-brand-400 mb-2" />
               <div className="space-y-1">
                 <div className="h-2 w-24 bg-white/20 rounded mx-auto" />
                 <div className="h-2 w-16 bg-white/10 rounded mx-auto" />
               </div>
               <div className="pt-4 space-y-2 w-full">
                 <div className="h-8 w-full bg-brand-500/20 rounded-lg flex items-center justify-center text-[10px] font-bold text-brand-400">
                    VERIFIED
                 </div>
               </div>
            </div>
          </div>
        </MobileCard>
      </MobileSection>

      {/* 5. The "Magic Scan" CTA for the Vault */}
      <MobileSection>
        <MobileSectionHeader title="Instant Digitization" />
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-2">
            <Zap className="h-8 w-8 text-brand-600" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-slate-900">Add to your Home Record</h4>
            <p className="text-sm text-slate-500 max-w-xs mx-auto mt-1">
              Snap a photo of an appliance label or a service receipt to instantly secure it in the vault.
            </p>
          </div>
          <Button 
            onClick={() => setIsScannerOpen(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-2xl h-14 px-8 shadow-lg shadow-brand-100"
          >
            <Zap className="mr-2 h-5 w-5 fill-current" />
            <span className="text-lg font-bold">Magic Scan</span>
          </Button>
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
