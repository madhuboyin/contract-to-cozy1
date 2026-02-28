// apps/frontend/src/components/seller-prep/SellerPrepDashboardCard.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, CheckCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface Property {
  id: string;
  name?: string;
  address: string;
}

interface SellerPrepDashboardCardProps {
  properties: Property[];
  userSegment?: 'HOME_BUYER' | 'EXISTING_OWNER';
}

/**
 * Dashboard card promoting seller prep feature
 * Shows list of properties user can assess for sale readiness
 * 
 * Usage in main dashboard:
 * <SellerPrepDashboardCard properties={userProperties} userSegment={segment} />
 */
export function SellerPrepDashboardCard({ 
  properties, 
  userSegment 
}: SellerPrepDashboardCardProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    properties.length === 1 ? properties[0].id : null
  );

  if (properties.length === 0) {
    return null; // Don't show if user has no properties
  }

  const isHomeBuyer = userSegment === 'HOME_BUYER';

  return (
    <Card className="border-green-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-green-600" />
          {isHomeBuyer ? 'Planning to Sell?' : 'Preparing to Sell?'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Get a personalized checklist of improvements that maximize your sale price
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-700">Select a property:</p>
          {properties.map((property) => (
            <button
              key={property.id}
              onClick={() => setSelectedPropertyId(property.id)}
              className={`
                w-full p-3 text-left rounded-lg border transition-all
                ${selectedPropertyId === property.id 
                  ? 'border-green-500 bg-green-50' 
                  : 'border-gray-200 hover:border-green-300'
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {property.name || 'Property'}
                  </p>
                  <p className="text-xs text-gray-500">{property.address}</p>
                </div>
                {selectedPropertyId === property.id && (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-xs text-gray-500">
            <p>✓ ROI-ranked improvements</p>
            <p>✓ Comparable sales data</p>
            <p>✓ Readiness assessment</p>
          </div>
          
          {selectedPropertyId ? (
            <Link href={`/dashboard/properties/${selectedPropertyId}/seller-prep`}>
              <Button size="sm" className="bg-green-600 hover:bg-green-700">
                Get Started
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          ) : (
            <Button size="sm" disabled className="bg-green-600 hover:bg-green-700">
              Get Started
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}