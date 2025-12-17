// apps/frontend/src/components/seller-prep/SellerPrepCTA.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";

interface SellerPrepCTAProps {
  propertyId: string;
  userSegment?: 'HOME_BUYER' | 'EXISTING_OWNER';
}

/**
 * Call-to-action component for seller prep feature
 * Shows on property detail pages for users preparing to sell
 * 
 * Usage:
 * <SellerPrepCTA propertyId={propertyId} userSegment={segment} />
 */
export function SellerPrepCTA({ propertyId, userSegment }: SellerPrepCTAProps) {
  // Feature should be available to all users, but message can vary
  const isHomeBuyer = userSegment === 'HOME_BUYER';

  return (
    <Card className="border-green-200 bg-green-50">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold text-green-900">
                {isHomeBuyer ? 'Planning to Sell Soon?' : 'Preparing to Sell?'}
              </h3>
            </div>
            <p className="text-sm text-green-800 mb-3">
              {isHomeBuyer 
                ? 'Get ROI-focused recommendations to maximize your resale value when the time comes.'
                : 'Discover which improvements will add the most value to your home sale.'
              }
            </p>
            <ul className="text-xs text-green-700 space-y-1 mb-4">
              <li>• ROI-ranked repair checklist</li>
              <li>• Comparable sales analysis</li>
              <li>• Seller readiness assessment</li>
            </ul>
          </div>
          
          <Link href={`/dashboard/properties/${propertyId}/seller-prep`}>
            <Button size="sm" className="bg-green-600 hover:bg-green-700">
              Estimate Sale Readiness
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}