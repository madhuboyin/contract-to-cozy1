// apps/frontend/src/app/(dashboard)/dashboard/components/UpcomingRenewalsCard.tsx
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query'; 
import { api } from '@/lib/api/client';
import { Warranty, InsurancePolicy } from '@/types'; 
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
    return differenceInDays(expiryDate, today);
};


// FIX: Exported as a named constant 
export const UpcomingRenewalsCard = () => {
  // Fetch Warranties
  const { data: warrantyData, isLoading: isLoadingWarranties, error: errorW } = useQuery({
    queryKey: ['warranties-renewals'],
    queryFn: () => api.listWarranties(),
  });

  // Fetch Insurance Policies
  const { data: insuranceData, isLoading: isLoadingInsurance, error: errorI } = useQuery({
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
                // isExpiringSoon is true if days is 30 or less (including negative/expired)
                isExpiringSoon: days <= 30, 
            };
        })
        // Filter out items expired more than 30 days ago, or keep all future items
        .filter(item => item.daysUntilExpiry >= -30) 
        // Sort by expiryDate ascending (soonest first)
        .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()); 
  }
  
  if (errorW || errorI) {
      console.error("Error fetching renewals data:", errorW || errorI);
  }

  const upcomingItems = renewalItems.slice(0, 5); // Show top 5 expiring/upcoming items

  // Determine alert status for the HEADER ICON ONLY
  const expiringCount = renewalItems.filter(item => item.isExpiringSoon && item.daysUntilExpiry >= 0).length;
  const expiredCount = renewalItems.filter(item => item.daysUntilExpiry < 0).length;
  const isAlert = expiringCount > 0 || expiredCount > 0;
  
  return (
    <Card className={`h-full`}>
      {/* FIX 1: Use standard CardHeader classes for alignment consistency */}
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
            {upcomingItems.map((item, index) => {
              // Determine styling classes for this specific item
              const isAlertItem = item.isExpiringSoon; 
              const isExpired = item.daysUntilExpiry < 0;

              // Link Text Color: Red only if EXPIRED, otherwise use a dark neutral color
              const linkTextColorClass = isExpired ? 'text-red-600' : 'text-gray-800';
              
              // Icon Color: Red if Alert, otherwise type-specific color
              const itemIconColor = isAlertItem ? 'text-red-500' : (item.type === 'Warranty' ? 'text-blue-500' : 'text-purple-500');

              // Date/Days Text Color: Red if Alert, otherwise neutral gray/black
              const dateTextColor = isAlertItem ? 'text-red-600' : 'text-gray-700'; 
              const daysTextColor = isAlertItem ? 'text-red-500' : 'text-gray-500';

              return (
                <React.Fragment key={item.id}> 
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center space-x-2">
                      {/* Icon */}
                      {item.type === 'Warranty' ? (
                        <Shield className={`h-4 w-4 flex-shrink-0 ${itemIconColor}`} />
                      ) : (
                        <Home className={`h-4 w-4 flex-shrink-0 ${itemIconColor}`} />
                      )}
                      
                      {/* Link Text (Name) */}
                      <Link
                        href={`/dashboard/${item.type === 'Warranty' ? 'warranties' : 'insurance'}`}
                        // FIX 2: Use stronger neutral link color by default, ensuring hover is only blue when not an alert
                        className={`font-medium ${linkTextColorClass} ${isAlertItem ? 'hover:text-red-700' : 'hover:text-blue-600'}`} 
                      >
                        {item.name}
                      </Link>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      
                      {/* DATE TEXT (Expiring Soon/Expired = RED) */}
                      <p className={`font-semibold ${dateTextColor}`}>
                        {format(new Date(item.expiryDate), 'MMM dd, yyyy')}
                      </p>
                      
                      {/* DAY COUNT TEXT (Expiring Soon/Expired = RED) */}
                      <p className={`text-xs ${daysTextColor}`}>
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
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 pt-2">No upcoming renewals found.</p>
        )}
      </CardContent>
    </Card>
  );
}