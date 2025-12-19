//apps/frontend/src/app/(dashboard)/dashboard/components/HomeBuyerChecklistCard.tsx

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ArrowRight, ListChecks } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DashboardChecklistItem } from '../types'; 

interface HomeBuyerChecklistCardProps {
  items: DashboardChecklistItem[]; 
  className?: string;
}

export const HomeBuyerChecklistCard = ({ items, className }: HomeBuyerChecklistCardProps) => {
  // DEBUG: Log what we received to understand the filtering issue
  console.log('🏠 HomeBuyerChecklistCard - Received items:', items?.length || 0);
  
  if (!items || items.length === 0) {
    console.warn('⚠️ HomeBuyerChecklistCard received NO ITEMS - This is the bug!');
    console.log('🏠 Items value:', items);
  } else {
    console.log('🏠 Items breakdown:', items.map(i => ({
      id: i.id,
      title: i.title,
      isRecurring: i.isRecurring,
      status: i.status,
      propertyId: i.propertyId
    })));
  }
  
  // Filter only items relevant to the home buyer (non-recurring maintenance/renewal items)
  const buyerItems = (items || []).filter(item => !item.isRecurring);
  
  console.log('🏠 After isRecurring filter - buyerItems:', buyerItems.length);
  console.log('🏠 Filtered items:', buyerItems.map(i => ({ title: i.title, status: i.status })));
  
  // Calculate counts
  const completedCount = buyerItems.filter(i => i.status === 'COMPLETED').length;
  const totalCount = buyerItems.length;
  const pendingCount = totalCount - completedCount;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  
  console.log('🏠 Stats:', { totalCount, completedCount, pendingCount, progress: Math.round(progress) + '%' });
  
  // Determine card state
  const allComplete = totalCount > 0 && completedCount === totalCount;
  const isEmpty = totalCount === 0;
  
  const cardTitle = allComplete
    ? "Checklist Completed 🎉" 
    : "Home Buying Checklist";

  const cardDescription = allComplete
    ? "Congratulations! You're ready to get cozy."
    : isEmpty
      ? "Loading your checklist..."
      : `You have ${pendingCount} critical step${pendingCount !== 1 ? 's' : ''} remaining.`;

  return (
    <Card className={cn("h-full flex flex-col shadow-lg", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="font-heading text-xl flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-blue-600" />
              {cardTitle}
            </CardTitle>
            <CardDescription className="font-body text-sm">
              {cardDescription}
            </CardDescription>
          </div>
          {totalCount > 0 && (
            <div className="text-right">
              <span className="font-heading text-2xl font-bold text-blue-600">{Math.round(progress)}%</span>
              <p className="font-body text-xs text-muted-foreground">Complete</p>
            </div>
          )}
        </div>
        {totalCount > 0 && <Progress value={progress} className="h-2 mt-2" />}
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <div className="space-y-1">
          {buyerItems.slice(0, 6).map((item) => (
            <div 
              key={item.id} 
              className={cn(
                "flex items-center p-3 rounded-lg transition-all",
                item.status === 'COMPLETED' ? "bg-green-50/50" : "hover:bg-gray-50"
              )}
            >
              <div className="mr-3 flex-shrink-0">
                {item.status === 'COMPLETED' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "font-body text-sm font-medium truncate",
                  item.status === 'COMPLETED' ? "text-gray-500 line-through" : "text-gray-900"
                )}>
                  {item.title}
                </p>
                {item.description && (
                  <p className="font-body text-xs text-gray-500 truncate">{item.description}</p>
                )}
              </div>
              {item.status !== 'COMPLETED' && (
                <Button variant="ghost" size="sm" className="ml-2 h-8 text-xs" asChild>
                   <Link href="/dashboard/checklist">Action</Link>
                </Button>
              )}
            </div>
          ))}
          {isEmpty && (
            <div className="text-center py-6 text-muted-foreground">
              <p className="font-body text-sm">Your checklist is empty. Get started in the full checklist view!</p>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="border-t pt-4 bg-gray-50/50 rounded-b-lg">
        <Button className="w-full" asChild>
          <Link href="/dashboard/checklist">
            View / Complete Full Checklist <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};