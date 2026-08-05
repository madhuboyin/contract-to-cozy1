'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, Plus } from 'lucide-react';
import type { MaterialCategory, MaterialSpec } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { ErrorBanner, ProjectNav, Spinner } from '../../ProjectTrackerHelpers';
import {
  createSpec,
  listSpecs,
  substituteMaterial,
  transitionMaterialLifecycle,
} from '../../../materials/materialSpecApi';
import { api } from '@/lib/api/client';

const CATEGORIES: MaterialCategory[] = [
  'PAINT', 'TILE', 'FLOORING', 'GROUT', 'COUNTERTOP', 'CABINET', 'HARDWARE',
  'TRIM_MOLDING', 'WALLPAPER', 'ROOFING', 'SIDING', 'WINDOW', 'DOOR',
  'INSULATION', 'OTHER',
];

const NEXT_ACTION: Record<string, string> = {
  PROPOSED: 'Approve selection',
  APPROVED: 'Record installation',
  INSTALLED: 'Verify as-built',
};

export default function ProjectMaterialsPage() {
  const { id: propertyId, projectId } = useParams<{ id: string; projectId: string }>();
  const [materials, setMaterials] = useState<MaterialSpec[]>([]);
  const [scopeVersionId, setScopeVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [specs, project] = await Promise.all([
        listSpecs(propertyId, { projectId, isActive: true }),
        api.getProject(propertyId, projectId),
      ]);
      setMaterials(specs);
      setScopeVersionId(project.renovationScopeVersionId ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load project materials');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-4xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back to overview
        </Link>
      </Button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Project materials</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track selection, approval, installation, substitutions, and verified as-built identity.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(value => !value)}>
          <Plus className="mr-1 h-4 w-4" />{showAdd ? 'Cancel' : 'Add'}
        </Button>
      </div>
      <ProjectNav propertyId={propertyId} projectId={projectId} />
      {error && <ErrorBanner msg={error} />}
      {showAdd && (
        <AddMaterialForm
          propertyId={propertyId}
          projectId={projectId}
          scopeVersionId={scopeVersionId}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
      {loading && <Spinner />}
      {!loading && materials.length === 0 && (
        <EmptyStateCard
          title="No project materials"
          description="Add a proposed selection or record a material delivery in the Project log."
        />
      )}
      <section className="space-y-3">
        {materials.map(material => (
          <MaterialCard
            key={material.id}
            material={material}
            propertyId={propertyId}
            onSaved={load}
          />
        ))}
      </section>
    </MobilePageContainer>
  );
}

function MaterialCard({ material, propertyId, onSaved }: {
  material: MaterialSpec;
  propertyId: string;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<'transition' | 'substitute' | null>(null);
  const tone = material.lifecycleStatus === 'AS_BUILT'
    ? 'good'
    : material.lifecycleStatus === 'SUBSTITUTED'
      ? 'danger'
      : 'info';
  return (
    <MobileCard variant="compact" className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{material.label}</p>
          <p className="text-xs text-slate-500">
            {[material.manufacturer, material.productName, material.sku].filter(Boolean).join(' · ') || 'Identity incomplete'}
          </p>
        </div>
        <StatusChip tone={tone}>{material.lifecycleStatus.replace('_', ' ')}</StatusChip>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
        <span>Confidence: {material.verificationConfidence}</span>
        <span>Location: {material.room?.name ?? 'Property-wide'}</span>
        <span>Permit check: {material.permitAttributeCheck}</span>
        <span>HOA check: {material.hoaAttributeCheck}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {NEXT_ACTION[material.lifecycleStatus] && (
          <Button size="sm" className="h-8 text-xs" onClick={() => setAction('transition')}>
            {NEXT_ACTION[material.lifecycleStatus]}
          </Button>
        )}
        {['PROPOSED', 'APPROVED'].includes(material.lifecycleStatus) && (
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAction('substitute')}>
            Record substitution
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
          <Link href={`/dashboard/properties/${propertyId}/materials/${material.id}`}>
            Full record <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>
      {action === 'transition' && (
        <LifecycleForm
          material={material}
          propertyId={propertyId}
          onSaved={() => { setAction(null); onSaved(); }}
        />
      )}
      {action === 'substitute' && (
        <SubstitutionForm
          material={material}
          propertyId={propertyId}
          onSaved={() => { setAction(null); onSaved(); }}
        />
      )}
    </MobileCard>
  );
}

function AddMaterialForm({ propertyId, projectId, scopeVersionId, onSaved }: {
  propertyId: string;
  projectId: string;
  scopeVersionId: string | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    label: '', category: 'OTHER', manufacturer: '', productName: '', sku: '',
    quantity: '', submittalIds: '', permitRelevant: false, hoaRelevant: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createSpec(propertyId, {
        label: form.label.trim(),
        category: form.category as MaterialCategory,
        scopeLevel: 'PROPERTY',
        manufacturer: form.manufacturer.trim() || null,
        productName: form.productName.trim() || null,
        sku: form.sku.trim() || null,
        quantityPurchased: form.quantity.trim() || null,
        projectId,
        scopeVersionId,
        submittalDocumentIds: splitIds(form.submittalIds),
        complianceRelevance: {
          permitRelevant: form.permitRelevant,
          hoaRelevant: form.hoaRelevant,
          attributes: [],
        },
        permitAttributeCheck: form.permitRelevant ? 'REVIEW_REQUIRED' : 'NOT_CONFIGURED',
        hoaAttributeCheck: form.hoaRelevant ? 'REVIEW_REQUIRED' : 'NOT_CONFIGURED',
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add material');
      setSaving(false);
    }
  }

  return (
    <MobileCard>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-sm font-semibold">Propose material</h2>
        {error && <ErrorBanner msg={error} />}
        <Input required value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Selection label" />
        <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map(category => <option key={category}>{category}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} placeholder="Manufacturer" />
          <Input value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} placeholder="Product name" />
          <Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="SKU / product code" />
          <Input value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="Quantity" />
        </div>
        <Input value={form.submittalIds} onChange={e => setForm({ ...form, submittalIds: e.target.value })} placeholder="Submittal document IDs, comma-separated" />
        <div className="flex gap-4 text-xs">
          <label><input type="checkbox" checked={form.permitRelevant} onChange={e => setForm({ ...form, permitRelevant: e.target.checked })} /> Permit-relevant</label>
          <label><input type="checkbox" checked={form.hoaRelevant} onChange={e => setForm({ ...form, hoaRelevant: e.target.checked })} /> HOA-relevant</label>
        </div>
        <Button type="submit" disabled={saving || !form.label.trim()} className="w-full">
          {saving ? 'Saving…' : 'Save proposed material'}
        </Button>
      </form>
    </MobileCard>
  );
}

export function LifecycleForm({ material, propertyId, onSaved }: {
  material: MaterialSpec;
  propertyId: string;
  onSaved: () => void;
}) {
  const toStatus = material.lifecycleStatus === 'PROPOSED'
    ? 'APPROVED'
    : material.lifecycleStatus === 'APPROVED'
      ? 'INSTALLED'
      : 'AS_BUILT';
  const [evidence, setEvidence] = useState('');
  const [approval, setApproval] = useState('');
  const [submittal, setSubmittal] = useState('');
  const [receipt, setReceipt] = useState('');
  const [warranty, setWarranty] = useState('');
  const [manual, setManual] = useState('');
  const [quantityInstalled, setQuantityInstalled] = useState('');
  const [installedBy, setInstalledBy] = useState('');
  const [quantityRemaining, setQuantityRemaining] = useState('');
  const [storage, setStorage] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await transitionMaterialLifecycle(propertyId, material.id, {
        toStatus,
        evidenceDocumentIds: splitIds(evidence),
        approvalDocumentIds: toStatus === 'APPROVED' ? splitIds(approval) : undefined,
        submittalDocumentIds: toStatus === 'APPROVED' && material.submittalDocumentIds.length === 0
          ? splitIds(submittal)
          : undefined,
        receiptDocumentId: toStatus === 'AS_BUILT' ? receipt.trim() : undefined,
        warrantyDocumentId: toStatus === 'AS_BUILT' ? warranty.trim() || null : undefined,
        manualDocumentId: toStatus === 'AS_BUILT' ? manual.trim() || null : undefined,
        quantityInstalled: toStatus === 'INSTALLED' ? quantityInstalled.trim() : undefined,
        installedByName: toStatus === 'INSTALLED' ? installedBy.trim() || null : undefined,
        quantityRemaining: toStatus === 'AS_BUILT' ? quantityRemaining : undefined,
        remainingStorageLocation: toStatus === 'AS_BUILT' ? storage.trim() || null : undefined,
        permitAttributeCheck: material.complianceRelevance?.permitRelevant ? 'PASSED' : undefined,
        hoaAttributeCheck: material.complianceRelevance?.hoaRelevant ? 'PASSED' : undefined,
        notes: notes.trim(),
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to advance material');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold">Move to {toStatus.replace('_', ' ')}</p>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <Input value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Evidence document IDs, comma-separated" />
      {toStatus === 'APPROVED' && (
        <>
          {material.submittalDocumentIds.length === 0 && (
            <Input value={submittal} onChange={e => setSubmittal(e.target.value)} placeholder="Submittal document IDs" />
          )}
          <Input value={approval} onChange={e => setApproval(e.target.value)} placeholder="Approval document IDs" />
        </>
      )}
      {toStatus === 'INSTALLED' && (
        <>
          <Input value={quantityInstalled} onChange={e => setQuantityInstalled(e.target.value)} placeholder="Installed quantity" />
          <Input value={installedBy} onChange={e => setInstalledBy(e.target.value)} placeholder="Installed by" />
        </>
      )}
      {toStatus === 'AS_BUILT' && (
        <>
          <Input value={receipt} onChange={e => setReceipt(e.target.value)} placeholder="Receipt document ID" />
          <Input value={warranty} onChange={e => setWarranty(e.target.value)} placeholder="Warranty document ID (optional)" />
          <Input value={manual} onChange={e => setManual(e.target.value)} placeholder="Manual document ID (optional)" />
          <Input value={quantityRemaining} onChange={e => setQuantityRemaining(e.target.value)} placeholder="Remaining quantity (enter 0 if none)" />
          <Input value={storage} onChange={e => setStorage(e.target.value)} placeholder="Remaining material storage location" />
        </>
      )}
      <Textarea required value={notes} onChange={e => setNotes(e.target.value)} placeholder="Evidence and verification notes" rows={2} />
      <Button type="submit" size="sm" disabled={saving} className="w-full">{saving ? 'Saving…' : `Confirm ${toStatus.replace('_', ' ')}`}</Button>
    </form>
  );
}

export function SubstitutionForm({ material, propertyId, onSaved }: {
  material: MaterialSpec;
  propertyId: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    label: `${material.label} substitute`, manufacturer: '', productName: '', sku: '',
    reason: '', changes: '', evidence: '', changeOrderId: '',
    permitRelevant: false, hoaRelevant: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await substituteMaterial(propertyId, material.id, {
        replacement: {
          label: form.label.trim(),
          manufacturer: form.manufacturer.trim() || null,
          productName: form.productName.trim() || null,
          sku: form.sku.trim() || null,
        },
        comparison: {
          identityChanges: form.changes.split(',').map(value => value.trim()).filter(Boolean),
          reason: form.reason.trim(),
        },
        complianceImpact: {
          permitRelevant: form.permitRelevant,
          hoaRelevant: form.hoaRelevant,
          changedAttributes: form.changes.split(',').map(value => value.trim()).filter(Boolean),
          explanation: form.reason.trim(),
        },
        evidenceDocumentIds: splitIds(form.evidence),
        sourceChangeOrderId: form.changeOrderId.trim() || null,
        notes: form.reason.trim(),
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to record substitution');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold">Replacement product</p>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <Input required value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Replacement label" />
      <div className="grid grid-cols-2 gap-2">
        <Input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} placeholder="Manufacturer" />
        <Input value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} placeholder="Product" />
      </div>
      <Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="SKU" />
      <Input required value={form.changes} onChange={e => setForm({ ...form, changes: e.target.value })} placeholder="Changed attributes, comma-separated" />
      <Input required value={form.evidence} onChange={e => setForm({ ...form, evidence: e.target.value })} placeholder="Substitution evidence document IDs" />
      <Input value={form.changeOrderId} onChange={e => setForm({ ...form, changeOrderId: e.target.value })} placeholder="Compliance-reviewed change order ID, if relevant" />
      <div className="flex gap-4 text-xs">
        <label><input type="checkbox" checked={form.permitRelevant} onChange={e => setForm({ ...form, permitRelevant: e.target.checked })} /> Permit impact</label>
        <label><input type="checkbox" checked={form.hoaRelevant} onChange={e => setForm({ ...form, hoaRelevant: e.target.checked })} /> HOA impact</label>
      </div>
      <Textarea required value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Why this substitute is needed and its impact" rows={2} />
      <Button type="submit" size="sm" disabled={saving} className="w-full">{saving ? 'Saving…' : 'Record substitution'}</Button>
    </form>
  );
}

function splitIds(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}
