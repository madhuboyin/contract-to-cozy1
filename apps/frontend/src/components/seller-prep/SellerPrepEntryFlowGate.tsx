// apps/frontend/src/components/seller-prep/SellerPrepEntryFlowGate.tsx
//
// Sale Readiness Value-Maximization Checklist plan §4.4b/§10 Phase 6: the
// Seller Prep entry-flow gate. Replaces the plain "Open Sale Readiness"
// link with a check against the mandatory baseline facts — if anything's
// missing, this renders inline capture for all of it right here instead of
// forwarding, then re-checks once everything's resolved.
//
// Reworked per direct product feedback (2026-08-06): appliance capture used
// to route the homeowner away to the Inventory page ("Add to Inventory")
// for a vague "at least one item" bar. Now every one of a fixed set of
// appliances every home has (refrigerator, dishwasher, kitchen range,
// washer & dryer) is captured inline, right here, alongside the scalar
// system-age fields — one combined form, one save, no page hop. Warranty
// coverage is reported but no longer blocks the checklist; it's optional
// context a homeowner can add later, not a mandatory fact.
//
// Deliberately keeps its own minimal local copy of the entry-flow request/
// response shape and PATCH call rather than importing sale-case's own
// saleCaseApi.ts/types.ts — saleCaseApi.ts itself documents this
// "tool directories stay self-contained rather than cross-importing"
// convention for the exact same reason.
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";

type MandatoryScalarField = "roofReplacementYear" | "hvacInstallYear" | "waterHeaterInstallYear" | "electricalPanelAge";
type MandatoryApplianceType = "REFRIGERATOR" | "DISHWASHER" | "OVEN_RANGE" | "WASHER_DRYER";

interface MandatoryFactCoverage {
  scalarMissing: MandatoryScalarField[];
  applianceMissing: MandatoryApplianceType[];
  warrantyMissing: boolean;
  readyForChecklist: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

const SCALAR_FIELD_CONFIG: Record<MandatoryScalarField, { factKey: string; label: string; unit: string; min: number; max: number }> = {
  roofReplacementYear: { factKey: "structure.roofReplacementYear", label: "Roof replacement", unit: "year", min: 1600, max: CURRENT_YEAR },
  hvacInstallYear: { factKey: "systems.hvacInstallYear", label: "HVAC install", unit: "year", min: 1600, max: CURRENT_YEAR },
  waterHeaterInstallYear: { factKey: "systems.waterHeaterInstallYear", label: "Water heater install", unit: "year", min: 1600, max: CURRENT_YEAR },
  electricalPanelAge: { factKey: "structure.electricalPanelAgeYears", label: "Electrical panel age", unit: "years", min: 0, max: 150 },
};

const APPLIANCE_CONFIG: Record<MandatoryApplianceType, { label: string; unit: string }> = {
  REFRIGERATOR: { label: "Refrigerator", unit: "year installed/purchased" },
  DISHWASHER: { label: "Dishwasher", unit: "year installed/purchased" },
  OVEN_RANGE: { label: "Kitchen range / oven", unit: "year installed/purchased" },
  WASHER_DRYER: { label: "Washer & dryer", unit: "year installed/purchased" },
};

async function getEntryFlowStatus(propertyId: string): Promise<MandatoryFactCoverage> {
  const res = await api.get<MandatoryFactCoverage>(`/api/properties/${propertyId}/sale-case/entry-flow`);
  return res.data;
}

async function patchPropertyContextFact(propertyId: string, factKey: string, value: unknown): Promise<void> {
  await api.patch(`/api/properties/${propertyId}/context/${factKey}`, { value });
}

// Appliance capture reuses the property's existing canonical "major
// appliances" projection (propertyApplianceInventory.service.ts) rather
// than a raw InventoryItem — same model the property edit form already
// uses, and the only one with a clean type+year write shape. The sync is a
// full replace, so any save has to carry the complete list forward, not
// just the newly-answered types.
async function saveMandatoryAppliances(propertyId: string, answers: Partial<Record<MandatoryApplianceType, string>>): Promise<void> {
  const current = await api.getProperty(propertyId);
  if (!current.success) throw new Error(current.message || "Could not load property details.");
  const existing: Array<{ id?: string; type: string; installYear: number | undefined }> = (current.data.majorAppliances ?? [])
    .map((appliance: { id: string; assetType: string; installationYear: number | null }) => ({
      id: appliance.id,
      type: appliance.assetType,
      installYear: appliance.installationYear ?? undefined,
    }));
  const merged = [...existing];
  for (const [type, value] of Object.entries(answers)) {
    if (!value) continue;
    const installYear = Number(value);
    const index = merged.findIndex((appliance) => appliance.type === type);
    if (index >= 0) merged[index] = { ...merged[index], installYear };
    else merged.push({ type, installYear });
  }
  await api.updateProperty(propertyId, {
    majorAppliances: merged
      .filter((appliance) => typeof appliance.installYear === "number")
      .map((appliance) => ({ id: appliance.id, type: appliance.type, installYear: appliance.installYear as number })),
  });
}

type GateState = "idle" | "checking" | "blocked" | "error";

export function SellerPrepEntryFlowGate({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>("idle");
  const [coverage, setCoverage] = useState<MandatoryFactCoverage | null>(null);
  const [scalarDraft, setScalarDraft] = useState<Partial<Record<MandatoryScalarField, string>>>({});
  const [applianceDraft, setApplianceDraft] = useState<Partial<Record<MandatoryApplianceType, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saleCasePath = `/dashboard/properties/${propertyId}/tools/sale-case`;

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
      setScalarDraft({});
      setApplianceDraft({});
      setState("blocked");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check your home's details.");
      setState("error");
    }
  }, [propertyId, router, saleCasePath]);

  const saveAndContinue = async () => {
    if (!coverage) return;
    const scalarEntries = coverage.scalarMissing
      .map((field) => [field, scalarDraft[field]] as const)
      .filter(([, value]) => value !== undefined && value !== "");
    const applianceEntries = Object.fromEntries(
      coverage.applianceMissing
        .map((type) => [type, applianceDraft[type]] as const)
        .filter(([, value]) => value !== undefined && value !== ""),
    );
    if (scalarEntries.length === 0 && Object.keys(applianceEntries).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
        ...scalarEntries.map(([field, value]) =>
          patchPropertyContextFact(propertyId, SCALAR_FIELD_CONFIG[field].factKey, Number(value))),
        Object.keys(applianceEntries).length > 0 ? saveMandatoryAppliances(propertyId, applianceEntries) : Promise.resolve(),
      ]);
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
  const hasQuickFacts = missing.scalarMissing.length > 0 || missing.applianceMissing.length > 0;
  const nothingFilledIn = missing.scalarMissing.every((field) => !scalarDraft[field])
    && missing.applianceMissing.every((type) => !applianceDraft[type]);

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-4">
      <p className="font-medium">
        A few quick details about your home will help us build an accurate, personalized checklist.
      </p>

      {hasQuickFacts ? (
        <div className="space-y-3 rounded-md border border-blue-200 bg-white p-3">
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
                    value={scalarDraft[field] ?? ""}
                    onChange={(event) => setScalarDraft((current) => ({ ...current, [field]: event.target.value }))}
                    className="bg-white"
                  />
                </div>
              );
            })}
            {missing.applianceMissing.map((type) => {
              const config = APPLIANCE_CONFIG[type];
              return (
                <div key={type} className="space-y-1">
                  <Label htmlFor={`entry-flow-appliance-${type}`} className="text-xs text-gray-700">
                    {config.label} ({config.unit})
                  </Label>
                  <Input
                    id={`entry-flow-appliance-${type}`}
                    type="number"
                    min={1900}
                    max={CURRENT_YEAR}
                    value={applianceDraft[type] ?? ""}
                    onChange={(event) => setApplianceDraft((current) => ({ ...current, [type]: event.target.value }))}
                    className="bg-white"
                  />
                </div>
              );
            })}
          </div>
          <Button
            size="sm"
            disabled={saving || nothingFilledIn}
            onClick={() => void saveAndContinue()}
          >
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        </div>
      ) : null}

      {missing.warrantyMissing ? (
        <div className="rounded-md border border-blue-100 bg-white/60 p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-800">No warranty on file yet.</p>
            <p className="text-xs text-gray-500">Optional — doesn&rsquo;t block your checklist, but worth adding if you have one.</p>
          </div>
          <a href={`/dashboard/warranties?action=new&propertyId=${propertyId}`} className="shrink-0">
            <Button size="sm" variant="ghost">Add a warranty</Button>
          </a>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

export default SellerPrepEntryFlowGate;
