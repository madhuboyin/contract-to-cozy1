'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Edit2, ExternalLink, Trash2, X } from 'lucide-react';

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
import { deletePhoto, deleteSpec, getSpec } from '../materialSpecApi';
import { SpecForm } from '../MaterialSpecsClient';

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

  useEffect(() => {
    if (!propertyId || !specId) return;
    setLoading(true);
    setError(null);
    getSpec(propertyId, specId)
      .then(s => setSpec(s))
      .catch(() => setError('Failed to load material spec.'))
      .finally(() => setLoading(false));
  }, [propertyId, specId]);

  async function handleDeletePhoto(photoId: string) {
    if (!propertyId || !specId) return;
    try {
      await deletePhoto(propertyId, specId, photoId);
      setSpec(prev => prev ? { ...prev, photos: prev.photos.filter(p => p.id !== photoId) } : prev);
    } catch {
      toast({ title: 'Error', description: 'Failed to delete photo.', variant: 'destructive' });
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
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)} className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

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

        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Sourcing</h2>
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Supplier" value={spec.supplier} />
            <DetailRow label="Supplier URL" value={spec.supplierUrl} href={spec.supplierUrl ?? undefined} />
            <DetailRow label="Purchase Date" value={spec.purchaseDate?.slice(0, 10)} />
            <DetailRow label="Quantity Purchased" value={spec.quantityPurchased} />
            <DetailRow label="Lot / Batch" value={spec.lotBatch} />
          </div>
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

        {spec.photos.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Photos</h2>
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
