'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Wrench } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Property, InventoryItem } from '@/types';
import { listInventoryItems } from '../inventory/inventoryApi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function ReplaceRepairContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyIdFromUrl || '');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadProperties = async () => {
      setLoadingProperties(true);
      try {
        const response = await api.getProperties();
        if (!response.success || !response.data || cancelled) return;
        const nextProperties = response.data.properties || response.data;
        setProperties(nextProperties);

        if (!selectedPropertyId && nextProperties.length > 0) {
          setSelectedPropertyId(nextProperties[0].id);
        }
      } catch (error) {
        console.error('Failed to load properties:', error);
      } finally {
        if (!cancelled) setLoadingProperties(false);
      }
    };

    loadProperties();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (propertyIdFromUrl && !selectedPropertyId) {
      setSelectedPropertyId(propertyIdFromUrl);
    }
  }, [propertyIdFromUrl, selectedPropertyId]);

  useEffect(() => {
    let cancelled = false;
    const loadItems = async () => {
      if (!selectedPropertyId) {
        setItems([]);
        setSelectedItemId('');
        return;
      }

      setLoadingItems(true);
      try {
        const nextItems = await listInventoryItems(selectedPropertyId, {});
        if (cancelled) return;
        setItems(nextItems);
        setSelectedItemId((prev) => (prev && nextItems.some((item) => item.id === prev) ? prev : (nextItems[0]?.id ?? '')));
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load inventory items:', error);
          setItems([]);
          setSelectedItemId('');
        }
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    };

    loadItems();
    return () => {
      cancelled = true;
    };
  }, [selectedPropertyId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  if (loadingProperties) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {propertyIdFromUrl && (
        <Button variant="link" className="p-0 h-auto mb-2 text-sm text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      )}

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 sm:p-3 bg-gradient-to-br from-emerald-100 to-cyan-100 rounded-lg">
          <Wrench className="w-6 h-6 sm:w-8 sm:h-8 text-teal-700" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Replace or Repair</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Educational estimate to help decide whether to repair now or replace soon.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
        Educational decision support only. This estimate does not guarantee outcomes or vendor recommendations.
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">Select Property</Label>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-full max-w-xl">
              <SelectValue placeholder="Choose a property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name || property.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">Select Inventory Item</Label>
          <Select value={selectedItemId} onValueChange={setSelectedItemId} disabled={loadingItems || items.length === 0}>
            <SelectTrigger className="w-full max-w-xl">
              <SelectValue placeholder={loadingItems ? 'Loading items…' : 'Choose an item'} />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                  {item.room?.name ? ` • ${item.room.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedItem && (
          <div className="text-xs text-gray-600">
            {selectedItem.category}
            {selectedItem.room?.name ? ` • ${selectedItem.room.name}` : ' • Unassigned room'}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={!selectedPropertyId || !selectedItemId}
            onClick={() =>
              router.push(
                `/dashboard/properties/${selectedPropertyId}/inventory/items/${selectedItemId}/replace-repair`
              )
            }
          >
            Open Replace or Repair
          </Button>

          {selectedPropertyId && (
            <Button type="button" variant="ghost" asChild>
              <Link href={`/dashboard/properties/${selectedPropertyId}/inventory`}>Go to Inventory</Link>
            </Button>
          )}
        </div>

        {!loadingItems && selectedPropertyId && items.length === 0 && (
          <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm text-gray-700">
            No inventory items found for this property. Add an item first to run Replace or Repair.
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReplaceRepairHubPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ReplaceRepairContent />
    </Suspense>
  );
}
