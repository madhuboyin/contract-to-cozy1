'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { ClaimDTO, ClaimSourceType, ClaimType } from '@/types/claims.types';
import { createClaim } from '@/app/(dashboard)/dashboard/properties/[id]/claims/claimsApi';
import {
  listPropertyInsurancePolicies,
  listPropertyWarranties,
} from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { toast } from '@/components/ui/use-toast';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';
import type { FeatureContextCaptureResult } from '@/components/property-context/featureContextTypes';

const TYPE_OPTIONS: ClaimType[] = [
  'WATER_DAMAGE',
  'FIRE_SMOKE',
  'STORM_WIND_HAIL',
  'THEFT_VANDALISM',
  'LIABILITY',
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'APPLIANCE',
  'OTHER',
];

export default function ClaimCreateModal({
  open,
  onClose,
  propertyId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  onCreated: (claim: ClaimDTO) => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ClaimType>('WATER_DAMAGE');
  const [desc, setDesc] = useState('');
  const [providerName, setProviderName] = useState('');
  const [claimNumber, setClaimNumber] = useState('');
  const [sourceType, setSourceType] = useState<ClaimSourceType>('UNKNOWN');
  const [insurancePolicyId, setInsurancePolicyId] = useState('');
  const [warrantyId, setWarrantyId] = useState('');
  const [policies, setPolicies] = useState<Array<{ id: string; carrierName: string; policyNumber: string }>>([]);
  const [warranties, setWarranties] = useState<Array<{ id: string; providerName: string; policyNumber?: string | null }>>([]);
  const [busy, setBusy] = useState(false);

  const refreshCoverage = useCallback(async () => {
    const [allPolicies, allWarranties] = await Promise.all([
      listPropertyInsurancePolicies(propertyId),
      listPropertyWarranties(propertyId),
    ]);
    setPolicies(allPolicies.filter((item: any) => item.applicability?.status === 'APPLICABLE'));
    setWarranties(allWarranties.filter((item: any) => item.applicability?.status === 'APPLICABLE'));
  }, [propertyId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void refreshCoverage().catch(() => {
      if (!cancelled) {
        setPolicies([]);
        setWarranties([]);
      }
    });
    return () => { cancelled = true; };
  }, [open, refreshCoverage]);

  const handleCoverageCaptured = useCallback(async (result: FeatureContextCaptureResult) => {
    if (result.selection?.entityType === 'INSURANCE_POLICY') setInsurancePolicyId(result.selection.entityId);
    if (result.selection?.entityType === 'WARRANTY') setWarrantyId(result.selection.entityId);
    await refreshCoverage();
  }, [refreshCoverage]);

  if (!open) return null;

  function resetForm() {
    setTitle('');
    setType('WATER_DAMAGE');
    setDesc('');
    setProviderName('');
    setClaimNumber('');
    setSourceType('UNKNOWN');
    setInsurancePolicyId('');
    setWarrantyId('');
  }

  async function submit() {
    const t = title.trim();
    if (!t) return;
  
    setBusy(true);
    try {
      const claim = await createClaim(propertyId, {
        title: t,
        description: desc.trim() || null,
        type,
        sourceType,
        insurancePolicyId: sourceType === 'INSURANCE' ? insurancePolicyId : null,
        warrantyId:
          sourceType === 'HOME_WARRANTY' || sourceType === 'MANUFACTURER_WARRANTY'
            ? warrantyId
            : null,
        providerName: providerName.trim() || null,
        claimNumber: claimNumber.trim() || null,
        generateChecklist: true,
      });
  
      // Reset form and close modal first
      resetForm();
      onClose();
      
      // Call parent callback AFTER modal closes
      // Let errors bubble up to see them in console
      try {
        onCreated(claim);
        toast({
          title: 'Success',
          description: 'Claim created successfully',
        });
      } catch (error) {
        console.error("Parent onCreated failed:", error);
        toast({
          title: 'Warning',
          description: 'Claim created but list may not have updated. Try refreshing.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error("Failed to create claim:", error);
      toast({
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to create claim',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return;
    resetForm(); // optional: keep if you want clean reopen
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900">Create claim</div>
            <div className="mt-1 text-sm text-gray-600">
              We’ll generate a guided checklist and start a timeline automatically.
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg border px-3 py-2 text-sm min-h-[44px] hover:bg-gray-50"
            disabled={busy}
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <div className="text-xs font-semibold text-gray-700">Title</div>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Kitchen water leak"
              disabled={busy}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-gray-700">Type</div>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as ClaimType)}
                disabled={busy}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-700">Provider (optional)</div>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="e.g., State Farm"
                disabled={busy}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-gray-700">Claim path</div>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={sourceType}
                onChange={(e) => {
                  setSourceType(e.target.value as ClaimSourceType);
                  setInsurancePolicyId('');
                  setWarrantyId('');
                }}
                disabled={busy}
              >
                <option value="UNKNOWN">Decide later</option>
                <option value="INSURANCE">Insurance</option>
                <option value="HOME_WARRANTY">Home warranty</option>
                <option value="MANUFACTURER_WARRANTY">Manufacturer warranty</option>
                <option value="OUT_OF_POCKET">Out of pocket</option>
              </select>
            </div>

            {sourceType === 'INSURANCE' && (
              <div>
                <div className="text-xs font-semibold text-gray-700">Active policy</div>
                <select
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={insurancePolicyId}
                  onChange={(e) => setInsurancePolicyId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Select a policy</option>
                  {policies.map((policy) => (
                    <option key={policy.id} value={policy.id}>{policy.carrierName} · {policy.policyNumber}</option>
                  ))}
                </select>
              </div>
            )}

            {(sourceType === 'HOME_WARRANTY' || sourceType === 'MANUFACTURER_WARRANTY') && (
              <div>
                <div className="text-xs font-semibold text-gray-700">Active warranty</div>
                <select
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={warrantyId}
                  onChange={(e) => setWarrantyId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Select a warranty</option>
                  {warranties.map((warranty) => (
                    <option key={warranty.id} value={warranty.id}>{warranty.providerName}{warranty.policyNumber ? ` · ${warranty.policyNumber}` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {sourceType === 'INSURANCE' ? <PropertyContextCapturePanel
            propertyId={propertyId}
            featureKey="CLAIMS"
            operationKey="FILE_INSURANCE_CLAIM"
            onCaptured={handleCoverageCaptured}
          /> : null}
          {sourceType === 'HOME_WARRANTY' || sourceType === 'MANUFACTURER_WARRANTY' ? <PropertyContextCapturePanel
            propertyId={propertyId}
            featureKey="CLAIMS"
            operationKey="FILE_WARRANTY_CLAIM"
            onCaptured={handleCoverageCaptured}
          /> : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-gray-700">Claim # (optional)</div>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={claimNumber}
                onChange={(e) => setClaimNumber(e.target.value)}
                placeholder="Optional"
                disabled={busy}
              />
            </div>

            <div className="flex items-end">
              <div className="text-xs text-gray-500">
                Status will start as <span className="font-semibold">DRAFT</span>.
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-700">Description (optional)</div>
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Short summary of what happened…"
              disabled={busy}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
            <button
              className="rounded-lg border px-3 py-2.5 sm:py-2 text-sm min-h-[44px] hover:bg-gray-50"
              onClick={handleClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-emerald-700 px-3 py-2.5 sm:py-2 text-sm min-h-[44px] text-white hover:bg-emerald-800"
              onClick={submit}
              disabled={
                busy ||
                !title.trim() ||
                (sourceType === 'INSURANCE' && !insurancePolicyId) ||
                ((sourceType === 'HOME_WARRANTY' || sourceType === 'MANUFACTURER_WARRANTY') && !warrantyId)
              }
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
