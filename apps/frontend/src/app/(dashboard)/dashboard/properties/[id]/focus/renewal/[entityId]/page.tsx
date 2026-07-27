"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Loader2,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { navigateBackWithDashboardFallback } from "@/lib/navigation/backNavigation";
import { differenceInDays, parseISO, isPast } from "date-fns";

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatCurrency(cents: number | null | undefined): string | null {
  if (!cents) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function expiryStatusLabel(expiryDate: string | null): { label: string; isExpired: boolean; daysLabel: string } {
  if (!expiryDate) {
    return { label: "Unknown", isExpired: false, daysLabel: "after dates are confirmed" };
  }
  const date = parseISO(expiryDate);
  const expired = isPast(date);
  const days = Math.abs(differenceInDays(new Date(), date));
  return {
    label: expired ? "Expired" : "Expiring soon",
    isExpired: expired,
    daysLabel: expired ? `${days} day${days === 1 ? "" : "s"} ago` : `in ${days} day${days === 1 ? "" : "s"}`,
  };
}

export default function RenewalFocusPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const entityId = (Array.isArray(params.entityId) ? params.entityId[0] : params.entityId) as string;

  // The entity type hint can be passed as a query param to skip ambiguity
  const entityTypeHint = searchParams.get("type") as "warranty" | "insurance" | null;

  const { data: warrantiesRes, isLoading: loadingWarranties } = useQuery({
    queryKey: ["warranties", propertyId],
    queryFn: () => api.listWarranties(propertyId),
    enabled: !!propertyId,
  });

  const { data: policiesRes, isLoading: loadingPolicies } = useQuery({
    queryKey: ["insurance-policies", propertyId],
    queryFn: () => api.listInsurancePolicies(propertyId),
    enabled: !!propertyId,
  });

  const isLoading = loadingWarranties || loadingPolicies;

  if (isLoading || !propertyId) {
    return (
      <DashboardShell>
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }

  const warranties = warrantiesRes?.success ? warrantiesRes.data.warranties : [];
  const policies = policiesRes?.success ? policiesRes.data.policies : [];

  const warranty = warranties.find(w => w.id === entityId);
  const policy = policies.find(p => p.id === entityId);

  const entity = entityTypeHint === "warranty" ? warranty : entityTypeHint === "insurance" ? policy : (warranty ?? policy);
  const entityKind = entity === warranty && warranty ? "warranty" : "insurance";

  const protectHref = `/dashboard/properties/${propertyId}/protect`;

  if (!entity) {
    return (
      <DashboardShell>
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground" onClick={() => navigateBackWithDashboardFallback(router)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
            <ShieldAlert className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-base font-semibold text-slate-700">Policy not found</p>
            <Link href={protectHref}>
              <Button variant="outline" size="sm" className="mt-2">View protection overview <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const expiryDate = entity.expiryDate;
  const { label: statusLabel, isExpired, daysLabel } = expiryStatusLabel(expiryDate);
  const providerName = entityKind === "warranty" ? (entity as typeof warranty)!.providerName : (entity as typeof policy)!.carrierName;
  const policyNumber = entityKind === "warranty" ? (entity as typeof warranty)!.policyNumber : (entity as typeof policy)!.policyNumber;

  return (
    <DashboardShell className="pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 lg:max-w-4xl">

        <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground" onClick={() => navigateBackWithDashboardFallback(router)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to dashboard
        </Button>

        {/* ── Hero ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className={`px-5 pt-5 pb-4 border-b ${isExpired ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
            <div className="flex items-start gap-3">
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isExpired ? "bg-red-50 border-red-200 text-red-600" : "bg-amber-50 border-amber-200 text-amber-600"}`}>
                <Shield className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {entityKind === "warranty" ? "Warranty" : "Insurance policy"}
                  </p>
                  <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${isExpired ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                    {statusLabel}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-slate-900 mt-1 leading-snug">{providerName}</h1>
                {policyNumber && (
                  <p className="text-xs text-slate-500 mt-0.5">Policy #{policyNumber}</p>
                )}
              </div>
            </div>
          </div>

          {/* Expiry timeline */}
          <div className={`px-5 py-3 border-b border-slate-100 flex items-center gap-3 ${isExpired ? "bg-red-50/50" : "bg-amber-50/50"}`}>
            <Clock className={`h-5 w-5 shrink-0 ${isExpired ? "text-red-500" : "text-amber-500"}`} />
            <div>
              <p className={`text-base font-bold tabular-nums ${isExpired ? "text-red-700" : "text-amber-700"}`}>
                {isExpired ? `Expired ${daysLabel}` : `Expires ${daysLabel}`}
              </p>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <Calendar className="h-3 w-3" /> Expiry date: {formatDate(expiryDate)}
              </p>
            </div>
          </div>

          {/* Policy details */}
          {(() => {
            const details: { label: string; value: string }[] = [];

            if (entityKind === "warranty") {
              const w = entity as typeof warranty;
              if (w?.cost) details.push({ label: "Cost", value: formatCurrency(w.cost * 100) ?? "" });
              if (w?.coverageDetails) details.push({ label: "Coverage", value: w.coverageDetails });
            } else {
              const p = entity as typeof policy;
              if (p?.premiumAmount) details.push({ label: "Annual premium", value: formatCurrency(p.premiumAmount * 100) ?? "" });
              if (p?.coverageType) details.push({ label: "Coverage type", value: p.coverageType });
              const limit = formatCurrency(p?.personalPropertyLimitCents);
              if (limit) details.push({ label: "Personal property limit", value: limit });
              const deductible = formatCurrency(p?.deductibleCents);
              if (deductible) details.push({ label: "Deductible", value: deductible });
            }

            if (!details.length) return null;
            return (
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Policy details</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {details.map(({ label, value }) => (
                    <div key={label} className={label === "Coverage" ? "col-span-2 sm:col-span-3" : ""}>
                      <dt className="text-xs text-slate-400">{label}</dt>
                      <dd className="text-sm font-medium text-slate-700 mt-0.5">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })()}

          {/* What's at risk */}
          <div className="px-5 py-4 space-y-3">
            <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${isExpired ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
              <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${isExpired ? "text-red-500" : "text-amber-500"}`} />
              <p className="text-sm text-slate-700">
                {isExpired
                  ? `This ${entityKind} has expired. Any items or property covered by ${providerName} are currently unprotected. Contact the provider or find a replacement policy.`
                  : `This ${entityKind} expires soon. Acting before it lapses avoids a coverage gap and potential renewal price increases.`}
              </p>
            </div>
          </div>
        </div>

        {/* ── Action panel ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-5 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">What to do next</p>

          <Link href={protectHref} className="block">
            <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99] transition-all ${isExpired ? "bg-red-700 hover:bg-red-600" : "bg-teal-800 hover:bg-teal-700"}`}>
              <div className="flex items-center gap-2.5">
                <Shield className="h-4 w-4 text-white/80 shrink-0" />
                <p className="text-sm font-semibold text-white">
                  {isExpired ? "Restore coverage now" : "Review renewal options"}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-white/80 shrink-0" />
            </div>
          </Link>

          <Link href={`/dashboard/properties/${propertyId}/protect`} className="block">
            <div className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-[0.99] transition-all px-4 py-3 flex items-center justify-between gap-2 cursor-pointer">
              <p className="text-sm font-medium text-slate-700">View all warranties & policies</p>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
            </div>
          </Link>
        </div>

        <p className="text-xs text-slate-400 text-center px-2">
          {providerName} · {entityKind === "warranty" ? "Warranty" : "Insurance"} renewal
        </p>
      </div>
    </DashboardShell>
  );
}
