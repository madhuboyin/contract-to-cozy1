//apps/frontend/src/app/(dashboard)/dashboard/components/UpcomingRenewalsCard.tsx

import React from 'react';
import Link from 'next/link'; 
import { ShieldAlert, FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Reusing the simplified item interface
interface ChecklistItem {
  id: string;
  title: string;
  status: string;
  nextDueDate: string | null;
  // ADDED: Requires serviceCategory to determine link destination
  serviceCategory: string | null; 
}

interface UpcomingRenewalsCardProps {
  renewals: ChecklistItem[];
  className?: string;
}

export const UpcomingRenewalsCard = ({ renewals, className }: UpcomingRenewalsCardProps) => {
  const upcoming = renewals
    .slice(0, 3);

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-purple-600" />
          Renewals
        </CardTitle>
        <CardDescription>Insurance, Warranties, Taxes</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-4 text-gray-500">
            <FileText className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No upcoming renewals</p>
          </div>
        ) : (
          <div className="space-y-4">
            {upcoming.map(item => (
              <div key={item.id} className="flex items-center justify-between p-2 rounded-md bg-purple-50 border border-purple-100">
                <span className="text-sm font-medium text-purple-900">{item.title}</span>
                {/* FIX: Dynamic link based on serviceCategory */}
                <Button asChild size="sm" variant="ghost" className="h-6 text-xs text-purple-700 hover:text-purple-900 hover:bg-purple-100">
                    <Link 
                        href={
                            item.serviceCategory === 'WARRANTY' 
                                ? '/dashboard/warranties'
                                : item.serviceCategory === 'INSURANCE'
                                    ? '/dashboard/insurance'
                                    : '/dashboard/checklist' // Fallback for other renewal categories (Finance, Admin, Attorney)
                        }
                    >
                      Review
                    </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};