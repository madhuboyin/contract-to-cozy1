"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldOff,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { navigateBackWithDashboardFallback } from "@/lib/navigation/backNavigation";
import { getInventoryItem } from "@/app/(dashboard)/dashboard/inventory/inventoryApi";

function formatCents(cents: number | null | undefined): string {
  if (!cents) return "Unknown value";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatCategory(category: string): string {
  const map: Record<string, string> = {
    APPLIANCE: "Appliance",
    HVAC: "HVAC",
    PLUMBING: "Plumbing",
    ELECTRICAL: "Electrical",
    ROOF_EXTERIOR: "Roof / Exterior",
    SAFETY: "Safety",
    SMART_HOME: "Smart Home",
    FURNITURE: "Furniture",
    ELECTRONICS: "Electronics",
    OTHER: "Other",
  };
  return map[category] ?? category;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const conditionConfig: Record<string, { label: string; dot: string }> = {
  NEW:     { label: "New",     dot: "bg-emerald-500" },
  GOOD:    { label: "Good",    dot: "bg-emerald-400" },
  FAIR:    { label: "Fair",    dot: "bg-amber-400"   },
  POOR:    { label: "Poor",    dot: "bg-red-500"     },
  UNKNOWN: { label: "Unknown", dot: "bg-slate-400"   },
};

export default function CoverageFocusPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const itemId = (Array.isArray(params.itemId) ? params.itemId[0] : params.itemId) as string;

  const { data: item, isLoading: itemLoading } = useQuery({
    queryKey: ["inventory-item", propertyId, itemId],
    queryFn: () => getInventoryItem(propertyId, itemId),
    enabled: !!propertyId && !!itemId,
  });

  const { data: warrantiesRes } = useQuery({
    queryKey: ["warranties", propertyId],
    queryFn: () => api.listWarranties(propertyId),
    enabled: !!propertyId,
  });

  const { data: policiesRes } = useQuery({
    queryKey: ["insurance-policies", propertyId],
    queryFn: () => api.listInsurancePolicies(propertyId),
    enabled: !!propertyId,
  });

  if (itemLoading || !propertyId) {
    return (
      <DashboardShell>
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }

  if (!item) {
    return (
      <DashboardShell>
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground" onClick={() => navigateBackWithDashboardFallback(router)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
            <ShieldOff className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-base font-semibold text-slate-700">Item not found</p>
            <Link href={`/dashboard/properties/${propertyId}/inventory?tab=items&smart=gaps`}>
              <Button variant="outline" size="sm" className="mt-2">View all coverage gaps <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const warranties = warrantiesRes?.success ? warrantiesRes.data.warranties : [];
  const policies = policiesRes?.success ? policiesRes.data.policies : [];

  const linkedWarranty = item.warrantyId ? warranties.find(w => w.id === item.warrantyId) : null;
  const linkedPolicy = item.insurancePolicyId ? policies.find(p => p.id === item.insurancePolicyId) : null;

  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);
  const isFullGap = !hasWarranty && !hasInsurance;
  const isPartialGap = (hasWarranty && !hasInsurance) || (!hasWarranty && hasInsurance);
  const missingType = !hasWarranty ? "warranty" : "insurance";

  const replacementValue = formatCents(item.replacementCostCents);

  const inventoryHref = `/dashboard/properties/${propertyId}/inventory?tab=items&smart=gaps`;
  const warrantyHref = `/dashboard/properties/${propertyId}/inventory?tab=items&focus=${itemId}&addWarranty=true`;
  const insuranceHref = `/dashboard/properties/${propertyId}/inventory?tab=items&focus=${itemId}&addInsurance=true`;

  return (
    <DashboardShell className="pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 lg:max-w-4xl">

        <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground" onClick={() => navigateBackWithDashboardFallback(router)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to dashboard
        </Button>

        {/* ── Hero ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className={`px-5 pt-5 pb-4 border-b ${isFullGap ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
            <div className="flex items-start gap-3">
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isFullGap ? "bg-red-50 border-red-200 text-red-600" : "bg-amber-50 border-amber-200 text-amber-600"}`}>
                {isFullGap ? <ShieldOff className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Coverage gap</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${isFullGap ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                    {isFullGap ? "No coverage" : "Partial coverage"}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-slate-900 mt-1 leading-snug">{item.name}</h1>
                <p className="text-sm text-slate-600 mt-1">
                  {isFullGap
                    ? `Fully unprotected — no warranty or insurance linked. Replacement value: ${replacementValue}.`
                    : `Missing ${missingType} — only partially protected. Replacement value: ${replacementValue}.`}
                </p>
              </div>
            </div>
          </div>

          {/* Exposure */}
          {item.replacementCostCents && (
            <div className="px-5 py-3 bg-slate-50/60 border-b border-slate-100 flex items-center gap-3">
              <div className={`text-2xl font-black tabular-nums ${isFullGap ? "text-red-700" : "text-amber-700"}`}>
                {replacementValue}
              </div>
              <p className="text-xs font-semibold text-slate-500">
                {isFullGap ? "fully unprotected" : "partially unprotected replacement value"}
              </p>
            </div>
          )}

          {/* Item details */}
          {(() => {
            const details: { label: string; value: React.ReactNode }[] = [];
            if (item.room?.name)   details.push({ label: "Room",      value: item.room.name });
            const cond = conditionConfig[item.condition];
            if (item.condition && item.condition !== "UNKNOWN") details.push({
              label: "Condition",
              value: (
                <span className="flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${cond?.dot ?? "bg-slate-400"}`} />
                  {cond?.label ?? item.condition}
                </span>
              ),
            });
            details.push({ label: "Category", value: formatCategory(item.category) });
            if (item.brand)        details.push({ label: "Brand",     value: item.brand });
            if (item.model)        details.push({ label: "Model",     value: item.model });
            if (item.installedOn)  details.push({ label: "Installed", value: formatDate(item.installedOn) });
            if (item.purchasedOn)  details.push({ label: "Purchased", value: formatDate(item.purchasedOn) });
            if (!details.length) return null;
            return (
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Item details</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {details.map(({ label, value }) => (
                    <div key={label}>
                      <dt className="text-xs text-slate-400">{label}</dt>
                      <dd className="text-sm font-medium text-slate-700 mt-0.5">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })()}

          {/* Coverage status breakdown */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Coverage status</p>
            <div className="space-y-2">
              <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${hasWarranty ? "border-emerald-100 bg-emerald-50/50" : "border-red-100 bg-red-50/50"}`}>
                {hasWarranty
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  : <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">Warranty</p>
                  {linkedWarranty
                    ? <p className="text-xs text-slate-500">{linkedWarranty.providerName} — expires {new Date(linkedWarranty.expiryDate).toLocaleDateString()}</p>
                    : <p className="text-xs text-red-600">Not linked — item is not covered</p>}
                </div>
              </div>
              <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${hasInsurance ? "border-emerald-100 bg-emerald-50/50" : "border-red-100 bg-red-50/50"}`}>
                {hasInsurance
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  : <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">Insurance</p>
                  {linkedPolicy
                    ? <p className="text-xs text-slate-500">{linkedPolicy.carrierName} — {linkedPolicy.coverageType || "policy linked"}</p>
                    : <p className="text-xs text-red-600">Not linked — item not covered under a policy</p>}
                </div>
              </div>
            </div>

            <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 ${isFullGap ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
              <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${isFullGap ? "text-red-500" : "text-amber-500"}`} />
              <p className="text-sm text-slate-700">
                {isFullGap
                  ? `If this item breaks or is damaged, you would need to replace it out of pocket at ${replacementValue}.`
                  : `Without ${missingType}, part of your risk is still unprotected. Adding ${missingType} closes the gap.`}
              </p>
            </div>
          </div>
        </div>

        {/* ── Action panel ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-5 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">What to do next</p>

          {!hasWarranty && (
            <Link href={warrantyHref} className="block">
              <div className="rounded-xl bg-teal-800 hover:bg-teal-700 active:scale-[0.99] transition-all px-4 py-3 flex items-center justify-between gap-2 cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Shield className="h-4 w-4 text-white/80 shrink-0" />
                  <p className="text-sm font-semibold text-white">Add a warranty</p>
                </div>
                <ArrowRight className="h-4 w-4 text-white/80 shrink-0" />
              </div>
            </Link>
          )}

          {!hasInsurance && (
            <Link href={insuranceHref} className="block">
              <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99] transition-all ${!hasWarranty ? "border-slate-200 bg-slate-50 hover:bg-slate-100" : "bg-teal-800 hover:bg-teal-700"}`}>
                <div className="flex items-center gap-2.5">
                  <Shield className={`h-4 w-4 shrink-0 ${!hasWarranty ? "text-slate-500" : "text-white/80"}`} />
                  <p className={`text-sm font-semibold ${!hasWarranty ? "text-slate-700" : "text-white"}`}>Link to an insurance policy</p>
                </div>
                <ArrowRight className={`h-4 w-4 shrink-0 ${!hasWarranty ? "text-slate-400" : "text-white/80"}`} />
              </div>
            </Link>
          )}

          <Link href={inventoryHref} className="block">
            <div className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.99] transition-all px-4 py-3 flex items-center justify-between gap-2 cursor-pointer">
              <p className="text-sm font-medium text-slate-700">View all coverage gaps</p>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
            </div>
          </Link>

          <Link href={`/dashboard/properties/${propertyId}/inventory?tab=items&focus=${itemId}`} className="block">
            <div className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.99] transition-all px-4 py-3 flex items-center justify-between gap-2 cursor-pointer">
              <p className="text-sm font-medium text-slate-700">View item details</p>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
            </div>
          </Link>
        </div>

        <p className="text-xs text-slate-400 text-center px-2">{item.name} · Coverage gap</p>
      </div>
    </DashboardShell>
  );
}
