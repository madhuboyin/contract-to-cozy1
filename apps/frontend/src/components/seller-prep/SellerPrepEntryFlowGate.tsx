// apps/frontend/src/components/seller-prep/SellerPrepEntryFlowGate.tsx
//
// Sale Readiness Value-Maximization Checklist plan §4.4b/§10 Phase 6: the
// Seller Prep entry-flow gate. Replaces the plain "Open Sale Readiness"
// link with a check against the 6 mandatory baseline facts — if anything's
// missing, this renders the inline scalar quick-form and/or Inventory/
// Warranty routing cards right here instead of forwarding, then re-checks
// once everything's resolved.
//
// Deliberately keeps its own minimal local copy of the entry-flow request/
// response shape and PATCH call rather than importing sale-case's own
// saleCaseApi.ts/types.ts — saleCaseApi.ts itself documents this
// "tool directories stay self-contained rather than cross-importing"
// convention for the exact same reason.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";

type MandatoryScalarField = "roofReplacementYear" | "hvacInstallYear" | "waterHeaterInstallYear" | "electricalPanelAge";

interface MandatoryFactCoverage {
  scalarMissing: MandatoryScalarField[];
  inventoryMissing: boolean;
  warrantyMissing: boolean;
  readyForChecklist: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

const SCALAR_FIELD_CONFIG: Record<MandatoryScalarField, { factKey: string; label: string; unit: string; min: number; max: number }> = {
  roofReplacementYear: { factKey: "structure.roofReplacementYear", label: "Roof replacement year", unit: "year", min: 1600, max: CURRENT_YEAR },
  hvacInstallYear: { factKey: "systems.hvacInstallYear", label: "HVAC install year", unit: "year", min: 1600, max: CURRENT_YEAR },
  waterHeaterInstallYear: { factKey: "systems.waterHeaterInstallYear", label: "Water heater install year", unit: "year", min: 1600, max: CURRENT_YEAR },
  electricalPanelAge: { factKey: "structure.electricalPanelAgeYears", label: "Electrical panel age", unit: "years", min: 0, max: 150 },
};

function sanitizeReturnTo(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/dashboard/")) return null;
  return raw;
}

async function getEntryFlowStatus(propertyId: string): Promise<MandatoryFactCoverage> {
  const res = await api.get<MandatoryFactCoverage>(`/api/properties/${propertyId}/sale-case/entry-flow`);
  return res.data;
}

async function patchPropertyContextFact(propertyId: string, factKey: string, value: unknown): Promise<void> {
  await api.patch(`/api/properties/${propertyId}/context/${factKey}`, { value });
}

type GateState = "idle" | "checking" | "blocked" | "error";

export function SellerPrepEntryFlowGate({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<GateState>("idle");
  const [coverage, setCoverage] = useState<MandatoryFactCoverage | null>(null);
  const [draft, setDraft] = useState<Partial<Record<MandatoryScalarField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saleCasePath = `/dashboard/properties/${propertyId}/tools/sale-case`;
  const returnPath = `${pathname}?entryFlowRecheck=1`;

  const check = useCallback(async () => {
    setState("checking");
    setError(null);
    try {
      const result = await getEntryFlowStatus(propertyId);
      if (result.readyForChecklist) {
        router.push(saleCasePath);
        return;
      }
      setCoverage(result);
      setDraft({});
      setState("blocked");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check your home's details.");
      setState("error");
    }
  }, [propertyId, router, saleCasePath]);

  // A homeowner returning from the Warranty add-flow (which auto-returns on
  // save) lands back here with this marker — re-run the check immediately
  // rather than making them click "Open Sale Readiness" again.
  useEffect(() => {
    if (searchParams.get("entryFlowRecheck") !== "1") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("entryFlowRecheck");
    const stripped = params.toString();
    router.replace(stripped ? `${pathname}?${stripped}` : pathname);
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveScalarFields = async () => {
    if (!coverage) return;
    const entries = coverage.scalarMissing
      .map((field) => [field, draft[field]] as const)
      .filter(([, value]) => value !== undefined && value !== "");
    if (entries.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all(entries.map(([field, value]) =>
        patchPropertyContextFact(propertyId, SCALAR_FIELD_CONFIG[field].factKey, Number(value))));
      await check();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save those details.");
    } finally {
      setSaving(false);
    }
  };

  if (state === "idle") {
    return (
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
        <p className="font-medium">Sale readiness now lives in one governed case.</p>
        <p>
          Findings, unfinished projects, permits, Home Actions, and records are projected
          directly from this property — not a generic checklist.
        </p>
        <Button size="sm" className="mt-1" onClick={() => void check()}>
          Open Sale Readiness
        </Button>
      </div>
    );
  }

  if (state === "checking") {
    return (
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Collecting your home&rsquo;s details and preparing your checklist…</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900 space-y-2">
        <p>{error ?? "Something went wrong."}</p>
        <Button size="sm" variant="outline" onClick={() => void check()}>Try again</Button>
      </div>
    );
  }

  // blocked
  const missing = coverage!;
  const hasScalarGap = missing.scalarMissing.length > 0;
  const hasRoutedGap = missing.inventoryMissing || missing.warrantyMissing;

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-4">
      <p className="font-medium">
        A few more details about your home will help us build an accurate, personalized checklist.
      </p>

      {hasScalarGap ? (
        <div className="space-y-3 rounded-md border border-blue-200 bg-white p-3">
          <p className="text-sm font-medium text-gray-900">Just a couple more details before we build your checklist:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {missing.scalarMissing.map((field) => {
              const config = SCALAR_FIELD_CONFIG[field];
              return (
                <div key={field} className="space-y-1">
                  <Label htmlFor={`entry-flow-${field}`} className="text-xs text-gray-700">
                    {config.label} ({config.unit})
                  </Label>
                  <Input
                    id={`entry-flow-${field}`}
                    type="number"
                    min={config.min}
                    max={config.max}
                    value={draft[field] ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                    className="bg-white"
                  />
                </div>
              );
            })}
          </div>
          <Button
            size="sm"
            disabled={saving || missing.scalarMissing.every((field) => !draft[field])}
            onClick={() => void saveScalarFields()}
          >
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        </div>
      ) : null}

      {hasRoutedGap ? (
        <div className="space-y-2">
          {missing.inventoryMissing ? (
            <div className="rounded-md border border-blue-200 bg-white p-3 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-800">
                Log at least one home system or appliance with its condition and install or purchase date.
              </p>
              <a
                href={`/dashboard/properties/${propertyId}/inventory?filter=missing-age&returnTo=${encodeURIComponent(returnPath)}`}
                className="shrink-0"
              >
                <Button size="sm" variant="outline">Add to Inventory</Button>
              </a>
            </div>
          ) : null}
          {missing.warrantyMissing ? (
            <div className="rounded-md border border-blue-200 bg-white p-3 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-800">Add at least one warranty on file for this property.</p>
              <a
                href={`/dashboard/warranties?action=new&propertyId=${propertyId}&returnTo=${encodeURIComponent(returnPath)}`}
                className="shrink-0"
              >
                <Button size="sm" variant="outline">Add a warranty</Button>
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

export default SellerPrepEntryFlowGate;
