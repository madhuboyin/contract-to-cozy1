// apps/frontend/src/app/(dashboard)/dashboard/components/UpcomingRenewalsCard.tsx
'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query'; 
import { api } from '@/lib/api/client';
import { Warranty, InsurancePolicy } from '@/types'; 
import { format, differenceInDays } from 'date-fns'; 
import Link from 'next/link';
import { RefreshCw, ArrowRight } from 'lucide-react';

interface RenewalItem {
  id: string;
  title: string;
  expiryDate: Date;
  type: 'warranty' | 'insurance';
  status: 'expired' | 'due_30d' | 'active';
  propertyId: string | null; // ✅ FIXED: Allow null to match API response
  daysUntilExpiry: number;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'expired':
      return { label: 'Expired', className: 'bg-red-100 text-red-700 hover:bg-red-100' };
    case 'due_30d':
      return { label: 'Due in 30d', className: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100' };
    case 'active':
      return { label: 'Active', className: 'bg-green-100 text-green-700 hover:bg-green-100' };
    default:
      return { label: 'Unknown', className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' };
  }
};

interface UpcomingRenewalsCardProps {
    propertyId?: string;
}

export const UpcomingRenewalsCard: React.FC<UpcomingRenewalsCardProps> = ({ propertyId }) => {
  const { data: warrantyData, isLoading: isLoadingWarranties } = useQuery({
    queryKey: ['warranties-renewals', propertyId],
    queryFn: () => api.listWarranties(propertyId),
    enabled: !!propertyId,
  });

  const { data: insuranceData, isLoading: isLoadingInsurance } = useQuery({
    queryKey: ['insurance-policies-renewals', propertyId],
    queryFn: () => api.listInsurancePolicies(propertyId),
    enabled: !!propertyId,
  });

  const isLoading = isLoadingWarranties || isLoadingInsurance;

  const renewalItems: RenewalItem[] = React.useMemo(() => {
    if (!propertyId || !warrantyData?.success || !insuranceData?.success) return [];

    const rawWarranties = (warrantyData.data.warranties || []) as Warranty[];
    const rawPolicies = (insuranceData.data.policies || []) as InsurancePolicy[];

    const combined = [
      ...rawWarranties
        .filter(w => w.propertyId === propertyId)
        .map(w => ({
          id: w.id,
          title: w.providerName ? `${w.providerName} Warranty` : 'Home Warranty',
          expiryDate: new Date(w.expiryDate),
          type: 'warranty' as const,
          propertyId: w.propertyId
        })),
      ...rawPolicies
        .filter(p => p.propertyId === propertyId)
        .map(p => ({
          id: p.id,
          title: p.carrierName ? `${p.carrierName} Insurance` : 'Property Insurance',
          expiryDate: new Date(p.expiryDate),
          type: 'insurance' as const,
          propertyId: p.propertyId
        }))
    ];

    return combined
      .map(item => {
        const days = differenceInDays(item.expiryDate, new Date());
        let status: 'expired' | 'due_30d' | 'active' = 'active';
        if (days < 0) status = 'expired';
        else if (days <= 30) status = 'due_30d';
        
        return { ...item, status, daysUntilExpiry: days };
      })
      .filter(item => item.daysUntilExpiry >= -30)
      .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
  }, [propertyId, warrantyData, insuranceData]);

  const displayItems = renewalItems.slice(0, 3);
  const totalRenewals = renewalItems.length;

  return (
    <Card className="h-[320px] flex flex-col border-2 border-gray-100 rounded-2xl shadow-sm hover:border-blue-300 hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <CardContent className="p-5 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Renewals</h3>
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
            {totalRenewals}
          </Badge>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-hidden">
          {isLoading && propertyId ? (
            <div className="space-y-3">
              <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
              <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
              <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
            </div>
          ) : !propertyId ? (
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-4xl mb-3">🏠</span>
              <p className="text-sm text-gray-600 mb-4">Select a property</p>
              <Link href="/dashboard/properties">
                <Button variant="outline" size="sm" className="gap-2">
                  View Properties <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-4xl mb-3">📋</span>
              <p className="text-sm text-gray-600 mb-4">No upcoming renewals</p>
              <Link href={propertyId ? `/dashboard/properties/${propertyId}` : '/dashboard/properties'}>
                <Button variant="outline" size="sm" className="gap-2">
                  Add Coverage <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {displayItems.map((renewal) => {
                const badge = getStatusBadge(renewal.status);
                const detailUrl = renewal.type === 'warranty' 
                  ? '/dashboard/warranties'
                  : '/dashboard/insurance';
                
                return (
                  <Link 
                    key={renewal.id} 
                    href={detailUrl}
                    className="block"
                  >
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm hover:bg-white transition-all cursor-pointer">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1.5 truncate">
                        {renewal.title}
                      </h4>
                      <p className="text-xs text-gray-600 mb-1.5">
                        Expires: {format(renewal.expiryDate, 'MMM dd, yyyy')}
                      </p>
                      <Badge variant="secondary" className={`text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* CTA Button */}
        {totalRenewals > 0 && (
          <div className="mt-auto pt-4">
            <Link href="/dashboard/warranties">
              <Button 
                variant="ghost" 
                className="w-full text-sm font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-md gap-2"
              >
                View All {totalRenewals} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}