// apps/frontend/src/app/(dashboard)/dashboard/components/UpcomingRenewalsCard.tsx
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query'; 
import { api } from '@/lib/api/client';
import { Warranty, InsurancePolicy } from '@/types'; 
import { Separator } from '@/components/ui/separator'; 
import { format, differenceInDays } from 'date-fns'; 
import Link from 'next/link';
import { Home, Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button'; 

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

  const displayItems = renewalItems.slice(0, 3); 
  const overflowCount = renewalItems.length - displayItems.length;
  const showMore = overflowCount > 0;

  // Determine alert status for the HEADER ICON ONLY
  const expiringCount = renewalItems.filter(item => item.isExpiringSoon && item.daysUntilExpiry >= 0).length;
  const expiredCount = renewalItems.filter(item => item.daysUntilExpiry < 0).length;
  const isAlert = expiringCount > 0 || expiredCount > 0;
  
  return (
    <Card className={`h-full flex flex-col`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="font-heading text-xl flex items-center gap-2"> 
            <Shield className="h-5 w-5 text-green-600" />
            Upcoming Renewals
          </CardTitle>
          <CardDescription className="font-body text-sm">
            Insurance and warranty expirations
          </CardDescription>
        </div>
        {isAlert ? (
          <AlertTriangle className="h-4 w-4 text-red-500" />
        ) : (
          <Shield className="h-4 w-4 text-green-500" /> 
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="space-y-3 pt-2">
            <div className="h-4 w-1/2 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-1/3 rounded bg-gray-200 animate-pulse" />
          </div>
        ) : displayItems.length > 0 ? (
          <div className="space-y-3">
            {displayItems.map((item, index) => {
              const isAlertItem = item.isExpiringSoon; 
              const isExpired = item.daysUntilExpiry < 0;

              const linkTextColorClass = isExpired ? 'text-red-600' : 'text-foreground';
              
              const itemIconColor = isAlertItem ? 'text-red-500' : (item.type === 'Warranty' ? 'text-blue-500' : 'text-purple-500');

              const dateTextColor = isAlertItem ? 'text-red-600' : 'text-gray-700'; 
              const daysTextColor = isAlertItem ? 'text-red-500' : 'text-gray-500';

              return (
                <React.Fragment key={item.id}> 
                  <Link href={`/dashboard/${item.type === 'Warranty' ? 'warranties' : 'insurance'}`} className="block">
                    <div className="flex justify-between items-center p-2 -m-2 rounded hover:bg-gray-50 transition-colors">
                      <div className="flex items-center space-x-2">
                        {/* Icon */}
                        {item.type === 'Warranty' ? (
                          <Shield className={`h-4 w-4 flex-shrink-0 ${itemIconColor}`} />
                        ) : (
                          <Home className={`h-4 w-4 flex-shrink-0 ${itemIconColor}`} />
                        )}
                        
                        {/* Link Text (Name) */}
                        <span className={`font-body text-sm font-medium ${linkTextColorClass}`}>
                          {item.name}
                        </span>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        
                        {/* DATE TEXT (Expiring Soon/Expired = RED) */}
                        <p className={`font-body text-sm font-semibold ${dateTextColor}`}>
                          {format(new Date(item.expiryDate), 'MMM dd, yyyy')}
                        </p>
                        
                        {/* DAY COUNT TEXT (Expiring Soon/Expired = RED) */}
                        <p className={`font-body text-xs ${daysTextColor}`}>
                          {item.daysUntilExpiry <= 0
                            ? `Expired ${Math.abs(item.daysUntilExpiry)} days ago`
                            : item.daysUntilExpiry <= 30
                              ? `${item.daysUntilExpiry} days left`
                              : ''}
                        </p>
                      </div>
                    </div>
                  </Link>
                  {/* Separator only needed between items */}
                  {index < displayItems.length - 1 && <Separator />}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <p className="font-body text-sm text-gray-500 pt-2">No upcoming renewals found.</p>
        )}
      </CardContent>
      
      {/* Footer link logic */}
      {showMore && (
        <CardFooter className="border-t pt-4 -mt-2">
            <Link
                href="/dashboard/warranties" 
                className="font-body text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
                View {overflowCount} More Renewal{overflowCount > 1 ? 's' : ''} →
            </Link>
        </CardFooter>
      )}
    </Card>
  );
}