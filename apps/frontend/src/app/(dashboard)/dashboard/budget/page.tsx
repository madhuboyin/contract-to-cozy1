// apps/frontend/src/app/(dashboard)/dashboard/budget/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import BudgetForecaster from '../components/BudgetForecaster';
import { ArrowLeft, DollarSign, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';
import { Property } from '@/types';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

function BudgetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');
  
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyIdFromUrl || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    if (propertyIdFromUrl && !selectedPropertyId) {
      setSelectedPropertyId(propertyIdFromUrl);
    }
  }, [propertyIdFromUrl]);

  const loadProperties = async () => {
    try {
      const response = await api.getProperties();
      if (response.success && response.data) {
        const props = response.data.properties || response.data;
        setProperties(props);
        
        if (!selectedPropertyId && props.length > 0) {
          setSelectedPropertyId(props[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Back Navigation */}
      {propertyIdFromUrl && (
        <Button 
          variant="link" 
          className="p-0 h-auto mb-2 text-sm text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 sm:p-3 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg">
          <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Maintenance Budget Forecaster</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            AI-powered 12-month budget predictions based on your property
          </p>
        </div>
      </div>
      {/* Property Selector */}
      {properties.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Select Property
          </Label>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Choose a property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map(property => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name || property.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Forecaster Component */}
      {selectedPropertyId ? (
        <BudgetForecaster propertyId={selectedPropertyId} />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Select a property to view budget forecast</p>
        </div>
      )}
    </div>
  );
}

export default function BudgetPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BudgetContent />
    </Suspense>
  );
}