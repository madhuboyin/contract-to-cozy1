'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Edit2, ExternalLink, Loader2, Trash2, X } from 'lucide-react';

import type { MaterialSpec } from '@/types';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import {
  deletePhoto,
  deleteSpec,
  getSpec,
  reviewMaterialExtraction,
  updateSpec,
  uploadPhoto,
} from '../materialSpecApi';
import { SpecForm } from '../MaterialSpecsClient';
import { LifecycleForm, SubstitutionForm } from '../../projects/[projectId]/materials/page';

const NEXT_ACTION: Record<string, string> = {
  PROPOSED: 'Approve selection',
  APPROVED: 'Record installation',
  INSTALLED: 'Verify as-built',
};

const CATEGORY_LABELS: Record<string, string> = {
  PAINT: 'Paint', TILE: 'Tile', FLOORING: 'Flooring', GROUT: 'Grout',
  COUNTERTOP: 'Countertop', CABINET: 'Cabinet', HARDWARE: 'Hardware',
  TRIM_MOLDING: 'Trim & Molding', WALLPAPER: 'Wallpaper', ROOFING: 'Roofing',
  SIDING: 'Siding', WINDOW: 'Window', DOOR: 'Door', INSULATION: 'Insulation',
  OTHER: 'Other',
};

function categoryBadgeClass(cat: string): string {
  switch (cat) {
    case 'PAINT': return 'bg-blue-100 text-blue-800';
    case 'TILE': return 'bg-purple-100 text-purple-800';
    case 'FLOORING': return 'bg-orange-100 text-orange-800';
    case 'COUNTERTOP': return 'bg-amber-100 text-amber-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

interface DetailRowProps {
  label: string;
  value?: string | null;
  href?: string;
}

function DetailRow({ label, value, href }: DetailRowProps) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          {value}
          <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <p className="text-sm text-gray-900">{value}</p>
      )}
    </div>
  );
}

export default function SpecDetailClient() {
  const params = useParams<{ id: string; specId: string }>();
  const propertyId = params.id;
  const specId = params.specId;
  const router = useRouter();

  const [spec, setSpec] = useState<MaterialSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<'transition' | 'substitute' | null>(null);

  useEffect(() => {
    if (!propertyId || !specId) return;
    setLoading(true);
    setError(null);
    getSpec(propertyId, specId)
      .then(s => setSpec(s))
      .catch(() => setError('Failed to load material spec.'))
      .finally(() => setLoading(false));
  }, [propertyId, specId]);

  const [markingChecked, setMarkingChecked] = useState(false);

  async function handleMarkSupplierChecked() {
    if (!propertyId || !specId) return;
    setMarkingChecked(true);
    try {
      const updated = await updateSpec(propertyId, specId, { supplierCheckedAt: new Date().toISOString() });
      setSpec(updated);
    } catch {
      toast({ title: 'Error', description: 'Failed to update supplier check date.', variant: 'destructive' });
    } finally {
      setMarkingChecked(false);
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!propertyId || !specId) return;
    try {
      await deletePhoto(propertyId, specId, photoId);
      setSpec(prev => prev ? { ...prev, photos: prev.photos.filter(p => p.id !== photoId) } : prev);
    } catch {
      toast({ title: 'Error', description: 'Failed to delete photo.', variant: 'destructive' });
    }
  }

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  async function handleUploadPhoto(file: File) {
    if (!propertyId || !specId) return;
    setUploadingPhoto(true);
    try {
      await uploadPhoto(propertyId, specId, file);
      // Re-fetches rather than appending the returned photo locally — a
      // photo upload may also have just staged a NEEDS_REVIEW extraction
      // row in the background, and getSpec() is the one place that reads
      // both together.
      setSpec(await getSpec(propertyId, specId));
      toast({ title: 'Photo added', description: 'AI is checking it for readable product details.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to upload photo.', variant: 'destructive' });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleDelete() {
    if (!propertyId || !specId) return;
    setDeleting(true);
    try {
      await deleteSpec(propertyId, specId);
      router.push(`/dashboard/properties/${propertyId}/materials`);
    } catch {
      toast({ title: 'Error', description: 'Failed to delete material spec.', variant: 'destructive' });
      setDeleting(false);
    }
  }

  function handleSpecUpdated(updated: MaterialSpec) {
    setSpec(updated);
    setEditOpen(false);
    toast({ title: 'Saved', description: 'Material spec updated.' });
  }

  async function handleExtractionReview(
    reviewId: string,
    status: 'CONFIRMED' | 'REJECTED',
    candidateFields: Record<string, unknown>,
  ) {
    try {
      await reviewMaterialExtraction(propertyId, specId, reviewId, {
        status,
        reviewedFields: status === 'CONFIRMED' ? candidateFields : undefined,
        reviewNotes: status === 'CONFIRMED'
          ? 'Homeowner confirmed extracted material identity.'
          : 'Homeowner rejected extracted material identity.',
      });
      setSpec(await getSpec(propertyId, specId));
      toast({ title: status === 'CONFIRMED' ? 'Extraction applied' : 'Extraction rejected' });
    } catch {
      toast({ title: 'Error', description: 'Failed to review extracted fields.', variant: 'destructive' });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !spec) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-600">{error ?? 'Spec not found.'}</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push(`/dashboard/properties/${propertyId}/materials`)}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${categoryBadgeClass(spec.category)}`}>
                {CATEGORY_LABELS[spec.category] ?? spec.category}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${spec.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                {spec.isActive ? 'Active' : 'Archived'}
              </span>
              <span className="inline-flex items-center rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                {spec.lifecycleStatus.replace('_', ' ')} · {spec.verificationConfidence}
              </span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mt-1">{spec.label}</h1>
            {spec.room && (
              <p className="text-xs text-muted-foreground mt-0.5">{spec.room.name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Edit2 className="w-4 h-4 mr-1" />
              Edit
            </Button>
            {spec.lifecycleStatus === 'PROPOSED' && (
              <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)} className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {(NEXT_ACTION[spec.lifecycleStatus] || ['PROPOSED', 'APPROVED'].includes(spec.lifecycleStatus)) && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Lifecycle</h2>
            <div className="flex flex-wrap gap-2">
              {NEXT_ACTION[spec.lifecycleStatus] && (
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setLifecycleAction(lifecycleAction === 'transition' ? null : 'transition')}
                >
                  {NEXT_ACTION[spec.lifecycleStatus]}
                </Button>
              )}
              {['PROPOSED', 'APPROVED'].includes(spec.lifecycleStatus) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setLifecycleAction(lifecycleAction === 'substitute' ? null : 'substitute')}
                >
                  Record substitution
                </Button>
              )}
            </div>
            {lifecycleAction === 'transition' && (
              <div className="mt-3">
                <LifecycleForm
                  material={spec}
                  propertyId={propertyId}
                  onSaved={async () => { setLifecycleAction(null); setSpec(await getSpec(propertyId, specId)); toast({ title: 'Material updated' }); }}
                />
              </div>
            )}
            {lifecycleAction === 'substitute' && (
              <div className="mt-3">
                <SubstitutionForm
                  material={spec}
                  propertyId={propertyId}
                  onSaved={async () => { setLifecycleAction(null); setSpec(await getSpec(propertyId, specId)); toast({ title: 'Substitution recorded' }); }}
                />
              </div>
            )}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Identity</h2>
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Manufacturer" value={spec.manufacturer} />
            <DetailRow label="Product Line" value={spec.productLine} />
            <DetailRow label="Product Name" value={spec.productName} />
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">Color Code</p>
              {spec.colorCode || spec.colorHex ? (
                <div className="flex items-center gap-2">
                  {spec.colorHex && (
                    <span
                      className="inline-block rounded-full border border-gray-200 flex-shrink-0"
                      style={{ width: 16, height: 16, backgroundColor: spec.colorHex }}
                    />
                  )}
                  <p className="text-sm text-gray-900">{spec.colorCode ?? spec.colorHex}</p>
                </div>
              ) : null}
            </div>
            <DetailRow label="SKU" value={spec.sku} />
            <DetailRow label="Finish" value={spec.finish} />
            <DetailRow label="Dimensions" value={spec.dimensions} />
            <DetailRow label="Material" value={spec.material} />
          </div>
        </div>

        {spec.lifecycleStatus === 'AS_BUILT' && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="text-sm font-semibold text-emerald-900">Repair and reorder record</h2>
            <p className="mt-1 text-xs text-emerald-800">
              Verified identity: {[spec.manufacturer, spec.productName, spec.sku ?? spec.colorCode ?? spec.lotBatch].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-1 text-xs text-emerald-800">
              Remaining: {spec.quantityRemaining ?? 'Unknown'}
              {spec.remainingStorageLocation ? ` · Stored at ${spec.remainingStorageLocation}` : ''}
            </p>
            {spec.supplierUrl && (
              <Button size="sm" variant="outline" className="mt-3 h-8 border-emerald-300 bg-white text-xs" asChild>
                <a href={spec.supplierUrl} target="_blank" rel="noreferrer">
                  Open supplier <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Sourcing</h2>
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Supplier" value={spec.supplier} />
            <DetailRow label="Supplier URL" value={spec.supplierUrl} href={spec.supplierUrl ?? undefined} />
            <DetailRow label="Purchase Date" value={spec.purchaseDate?.slice(0, 10)} />
            <DetailRow label="Quantity Purchased" value={spec.quantityPurchased} />
            <DetailRow label="Lot / Batch" value={spec.lotBatch} />
            <DetailRow label="Installed Quantity" value={spec.quantityInstalled} />
            <DetailRow label="Remaining Quantity" value={spec.quantityRemaining} />
            <DetailRow label="Remaining Material Location" value={spec.remainingStorageLocation} />
            <DetailRow label="Installed By" value={spec.installedByName} />
          </div>
          {spec.supplierUrl && (
            <>
              <Separator className="my-4" />
              <div className="flex flex-wrap items-center gap-2">
                {spec.supplierDiscontinued && (
                  <span className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                    Discontinued
                  </span>
                )}
                <p className="text-xs text-muted-foreground">
                  Supplier link {spec.supplierCheckedAt ? `last checked ${spec.supplierCheckedAt.slice(0, 10)}` : 'not yet checked'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleMarkSupplierChecked}
                  disabled={markingChecked}
                >
                  {markingChecked ? 'Saving…' : 'Mark checked today'}
                </Button>
              </div>
              {spec.successorProductUrl && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Successor product: <a href={spec.successorProductUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{spec.successorProductUrl}</a>
                </p>
              )}
            </>
          )}
          {spec.lifecycleStatus === 'AS_BUILT' && (
            <>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-4">
                <DetailRow label="Receipt Document" value={spec.receiptDocumentId} />
                <DetailRow label="Warranty Document" value={spec.warrantyDocumentId} />
                <DetailRow label="Manual Document" value={spec.manualDocumentId} />
                <DetailRow label="Verified At" value={spec.verifiedAt?.slice(0, 10)} />
              </div>
            </>
          )}
          {spec.careInstructions && (
            <>
              <Separator className="my-4" />
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-muted-foreground">Care instructions</p>
                <p className="whitespace-pre-wrap text-sm text-gray-900">{spec.careInstructions}</p>
              </div>
            </>
          )}
          {spec.notes && (
            <>
              <Separator className="my-4" />
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{spec.notes}</p>
              </div>
            </>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Photos</h2>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-800">
              {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              Add photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploadingPhoto || spec.photos.length >= 10}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) handleUploadPhoto(file);
                }}
              />
            </label>
          </div>
          {spec.photos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No photos yet. Add one and we'll check it for readable manufacturer, color, and finish details.
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {spec.photos
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(photo => (
                  <div key={photo.id} className="relative flex-shrink-0">
                    <img
                      src={photo.photoUrl}
                      alt={photo.caption ?? 'Material photo'}
                      className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-red-50 hover:border-red-300 transition-colors"
                      aria-label="Remove photo"
                    >
                      <X className="w-3 h-3 text-gray-500" />
                    </button>
                    {photo.caption && (
                      <p className="text-xs text-muted-foreground mt-1 text-center max-w-24 truncate">{photo.caption}</p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {spec.extractionReviews?.some(review => review.status === 'NEEDS_REVIEW') && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="mb-1 text-sm font-semibold text-amber-900">Extracted details need review</h2>
            <p className="mb-3 text-xs text-amber-800">
              Photo and document extraction is never applied until you confirm it.
            </p>
            <div className="space-y-3">
              {spec.extractionReviews
                .filter(review => review.status === 'NEEDS_REVIEW')
                .map(review => (
                  <div key={review.id} className="rounded-md border border-amber-200 bg-white p-3">
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(review.candidateFields).map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-gray-500">{key}</dt>
                          <dd className="font-medium text-gray-900">{String(value ?? '—')}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" className="h-8 text-xs" onClick={() => handleExtractionReview(review.id, 'CONFIRMED', review.candidateFields)}>
                        Confirm and apply
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleExtractionReview(review.id, 'REJECTED', review.candidateFields)}>
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {spec.homeRecordLinks && spec.homeRecordLinks.length > 0 && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-gray-700">Home Records evidence</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Records linked to this spec from Home Records — separate from the submittal/receipt/warranty documents above.
            </p>
            <ul className="space-y-1.5">
              {spec.homeRecordLinks.map((link) => (
                <li key={link.linkId}>
                  <a
                    href={`/dashboard/properties/${propertyId}/tools/home-records?recordId=${link.recordId}`}
                    className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 hover:border-gray-300 hover:bg-gray-50"
                  >
                    <span className="truncate">{link.title}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{link.recordType.replaceAll('_', ' ')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {spec.lifecycleEvents && spec.lifecycleEvents.length > 0 && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Lifecycle history</h2>
            <ol className="space-y-3">
              {spec.lifecycleEvents.map(event => (
                <li key={event.id} className="border-l-2 border-indigo-200 pl-3">
                  <p className="text-sm font-medium text-gray-900">{event.eventType.replaceAll('_', ' ')}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(event.occurredAt).toLocaleString()} · {event.toStatus.replace('_', ' ')}
                  </p>
                  {event.notes && <p className="mt-1 text-xs text-gray-600">{event.notes}</p>}
                  {event.evidenceDocumentIds.length > 0 && (
                    <p className="mt-1 text-xs text-indigo-700">{event.evidenceDocumentIds.length} evidence document(s)</p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Material Spec</SheetTitle>
          </SheetHeader>
          {editOpen && (
            <SpecForm
              propertyId={propertyId}
              initialValues={spec}
              isEdit
              onSuccess={handleSpecUpdated}
              onCancel={() => setEditOpen(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Material Spec</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{spec.label}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-2 mt-4">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
