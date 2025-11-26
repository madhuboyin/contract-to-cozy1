//apps/frontend/src/app/(dashboard)/dashboard/components/MyPropertiesCard.tsx

import React from 'react';
import Link from 'next/link';
import { Home, MapPin, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Property } from '@/types';
import { cn } from '@/lib/utils';

interface MyPropertiesCardProps {
  properties: Property[];
  className?: string;
}

export const MyPropertiesCard = ({ properties, className }: MyPropertiesCardProps) => {
  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle className="font-heading text-xl flex items-center gap-2">
            <Home className="h-5 w-5 text-indigo-600" />
            My Properties
          </CardTitle>
          <CardDescription className="font-body text-sm">
            Manage your real estate assets
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/properties/new">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {properties.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p>No properties added yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {properties.map((property) => (
              <div 
                key={property.id} 
                className="group relative flex items-start space-x-3 rounded-lg border p-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex-shrink-0">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                    <Home className="h-5 w-5" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    <Link href={`/dashboard/properties/${property.id}/edit`} className="focus:outline-none">
                      <span className="absolute inset-0" aria-hidden="true" />
                      {property.name || 'Unnamed Property'}
                    </Link>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{property.address}</p>
                  <div className="flex items-center mt-1 text-xs text-gray-400">
                    <MapPin className="mr-1 h-3 w-3" />
                    {property.city}, {property.state}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};