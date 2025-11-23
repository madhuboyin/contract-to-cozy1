// apps/frontend/src/app/(dashboard)/dashboard/components/UpcomingRenewalsCard.tsx
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query'; 
import { api } from '@/lib/api/client';
import { Warranty, InsurancePolicy } from '@/types'; 
// FIX: This line now resolves because separator.tsx is provided
import { Separator } from '@/components/ui/separator'; 
import { format, differenceInDays } from 'date-fns'; 
import Link from 'next/link';
import { Home, Shield, AlertTriangle } from 'lucide-react';

// 1. Define the combined Renewal Item Type
interface RenewalItem {
  id: string;
  name: string;
  type: 'Warranty' | 'Insurance';
  expiryDate: string; // ISO string
  providerName: string; 
  daysUntilExpiry: number;
  isExpiringSoon: boolean;
}

/**
 * Calculates the number of full days until expiry. Negative for expired items.
 */
const getDaysUntilExpiry = (expiryDateString: string): number => {
    const today = new Date();
    const expiryDate = new Date(expiryDateString);
    // Use date-fns for reliable day calculation
    return differenceInDays(expiryDate, today);
};


export default function UpcomingRenewalsCard() {
  // Fetch Warranties
  const { data: warrantyData, isLoading: isLoadingWarranties } = useQuery({
    queryKey: ['warranties-renewals'],
    queryFn: () => api.listWarranties(),
  });

  // Fetch Insurance Policies
  const { data: insuranceData, isLoading: isLoadingInsurance } = useQuery({
    queryKey: ['insurance-policies-renewals'],
    queryFn: () => api.listInsurancePolicies(),
  });

  const isLoading = isLoadingWarranties || isLoadingInsurance;

  let renewalItems: RenewalItem[] = [];

  if (warrantyData?.success && insuranceData?.success) {
    const rawWarranties = (warrantyData.data.warranties || []) as Warranty[];
    const rawPolicies = (insuranceData.data.policies || []) as InsurancePolicy[];

    // 2. Combine and Augment Data
    const combined = [
        ...rawWarranties.map(w => ({
            id: w.id,
            name: `${w.providerName} Warranty`,
            type: 'Warranty' as const,
            expiryDate: w.expiryDate,
            providerName: w.providerName,
        })),
        ...rawPolicies.map(p => ({
            id: p.id,
            name: `${p.carrierName} Policy`,
            type: 'Insurance' as const,
            expiryDate: p.expiryDate,
            providerName: p.carrierName,
        }))
    ];
    
    // 3. Filter, Calculate, and Sort
    renewalItems = combined
        .map(item => {
            const days = getDaysUntilExpiry(item.expiryDate);
            return {
                ...item,
                daysUntilExpiry: days,
                // Highlight red if days > 0 and <= 30, or if days <= 0 (expired)
                isExpiringSoon: days <= 30, 
            };
        })
        // Filter out items expired more than 30 days ago, or keep all future items
        .filter(item => item.daysUntilExpiry >= -30) 
        .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()); // Sort by expiryDate ascending
  }

  const upcomingItems = renewalItems.slice(0, 5); // Show top 5 expiring/upcoming items

  // Determine card style based on alert items
  const expiringCount = renewalItems.filter(item => item.isExpiringSoon && item.daysUntilExpiry >= 0).length;
  const expiredCount = renewalItems.filter(item => item.daysUntilExpiry < 0).length;
  const isAlert = expiringCount > 0 || expiredCount > 0;
  const alertClass = isAlert ? 'bg-red-50 border-red-200 text-red-800' : 'bg-background';

  return (
    <Card className={`h-full ${alertClass}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Upcoming Renewals
        </CardTitle>
        {isAlert ? (
          <AlertTriangle className="h-4 w-4 text-red-500" />
        ) : (
          <Shield className="h-4 w-4 text-green-500" />
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3 pt-2">
            <div className="h-4 w-1/2 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-1/3 rounded bg-gray-200 animate-pulse" />
          </div>
        ) : upcomingItems.length > 0 ? (
          <div className="space-y-3">
            {upcomingItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center space-x-2">
                    {item.type === 'Warranty' ? (
                      <Shield className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <Home className="h-4 w-4 text-purple-500 flex-shrink-0" />
                    )}
                    <Link
                      href={`/dashboard/${item.type === 'Warranty' ? 'warranties' : 'insurance'}`}
                      className={`font-medium ${item.isExpiringSoon || item.daysUntilExpiry <= 0 ? 'text-red-600 hover:text-red-700' : 'text-gray-900 hover:text-blue-600'}`}
                    >
                      {item.name}
                    </Link>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className={`font-semibold ${item.isExpiringSoon && item.daysUntilExpiry >= 0 ? 'text-red-600' : item.daysUntilExpiry < 0 ? 'text-red-500' : 'text-gray-700'}`}>
                      {format(new Date(item.expiryDate), 'MMM dd, yyyy')}
                    </p>
                    <p className={`text-xs ${item.daysUntilExpiry <= 0 ? 'text-red-500' : 'text-gray-500'}`}>
                      {item.daysUntilExpiry <= 0
                        ? `Expired ${Math.abs(item.daysUntilExpiry)} days ago`
                        : item.daysUntilExpiry <= 30
                          ? `${item.daysUntilExpiry} days left`
                          : ''}
                    </p>
                  </div>
                </div>
                {index < upcomingItems.length - 1 && <Separator />}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 pt-2">No upcoming renewals found.</p>
        )}
      </CardContent>
    </Card>
  );
}