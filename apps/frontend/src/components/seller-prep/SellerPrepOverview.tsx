// apps/frontend/src/components/seller-prep/SellerPrepOverview.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  AlertCircle,
  LayoutDashboard,
  Users
} from "lucide-react";
import { LeadCaptureModal } from "@/components/seller-prep/LeadCaptureModal";
import { AgentInterviewGuide } from "./AgentInterviewGuide";

interface ComparableHome {
  address: string;
  soldPrice: number | null;
  soldDate: string | null;
  sqft?: number;
  beds?: number;
  baths?: number;
  similarityReason: string;
}

interface SellerPrepOverviewProps {
  overview: {
    interviews?: any[];
  };
  comparables: ComparableHome[];
  propertyId: string;
}

export default function SellerPrepOverview({
  overview,
  comparables,
  propertyId,
}: SellerPrepOverviewProps) {
  const [showLeadModal, setShowLeadModal] = useState(false);

  // State for agent interviews persistence (max 3)
  const [interviews, setInterviews] = useState(overview.interviews || []);

  const hasComparables = comparables && comparables.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* LEFT COLUMN: Main Interaction Area */}
      <div className="lg:col-span-8 space-y-6">
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
          <p className="font-medium">Sale readiness now lives in one governed case.</p>
          <p>
            Findings, unfinished projects, permits, Home Actions, and records are projected
            directly from this property — not a generic checklist.
          </p>
          <Link href={`/dashboard/properties/${propertyId}/tools/sale-case`}>
            <Button size="sm" className="mt-1">Open Sale Readiness</Button>
          </Link>
        </div>
        <Tabs defaultValue="market" className="w-full">
          <TabsList className="no-scrollbar mb-6 flex h-auto overflow-x-auto p-1 bg-muted/50 md:grid md:w-full md:grid-cols-2">
            <TabsTrigger value="market" className="flex shrink-0 items-center gap-2 text-xs md:text-sm py-2 px-3 md:px-1">
              <TrendingUp className="h-4 w-4 hidden sm:inline" /> <span>Market</span>
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex shrink-0 items-center gap-2 text-xs md:text-sm py-2 px-3 md:px-1">
              <Users className="h-4 w-4 hidden sm:inline" /> <span>Agents</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB: Comps */}
          <TabsContent value="market" className="space-y-6 outline-none">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" /> Comparable Sales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!hasComparables ? (
                  <AlertMessage
                    title="No data available"
                    description="Comparable sales data is currently unavailable for this property."
                  />
                ) : (
                  comparables.map((comp, i) => <CompItem key={i} comp={comp} />)
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: Agent Interview Guide (Interactive Comparison Matrix) */}
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
        <Card className="sticky top-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
              <LayoutDashboard className="h-4 w-4" /> Readiness Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-xs text-gray-600">
              Governed readiness status lives on{' '}
              <Link href={`/dashboard/properties/${propertyId}/tools/sale-case`} className="font-medium text-blue-600 underline">
                Sale Readiness
              </Link>
              . This page covers comps, agent comparisons, and contractor help.
            </div>

            <div className="pt-4 border-t space-y-3">
              <h4 className="text-xs font-bold text-gray-500 tracking-normal">Contractor help</h4>
              <p className="text-xs text-gray-600">
                Browse licensed, verified providers on the platform and book one directly —
                this actually reaches a provider, unlike the note below.
              </p>
              <Link href={`/dashboard/providers?propertyId=${propertyId}&from=seller-prep`}>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 h-9 text-xs">
                  Browse verified providers
                </Button>
              </Link>
              <button
                type="button"
                onClick={() => setShowLeadModal(true)}
                className="w-full text-center text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
              >
                Or just leave a note for later (no provider is contacted)
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <LeadCaptureModal
        propertyId={propertyId}
        open={showLeadModal}
        onClose={() => setShowLeadModal(false)}
      />
    </div>
  );
}

function CompItem({ comp }: { comp: ComparableHome }) {
  return (
    <div className="flex justify-between items-start border-b pb-3 last:border-0 last:pb-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{comp.address}</p>
        <p className="text-xs text-gray-500">
          {comp.sqft != null ? `${comp.sqft.toLocaleString()} sqft` : 'sqft N/A'} • {comp.beds != null ? `${comp.beds} bed` : 'beds N/A'} • {comp.baths != null ? `${comp.baths} bath` : 'baths N/A'}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-gray-900">{comp.soldPrice ? `$${comp.soldPrice.toLocaleString()}` : 'Price N/A'}</p>
        <p className="text-xs text-gray-400">Sold: {comp.soldDate ? new Date(comp.soldDate).toLocaleDateString() : 'N/A'}</p>
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
