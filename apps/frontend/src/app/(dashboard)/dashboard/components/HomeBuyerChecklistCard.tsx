//apps/frontend/src/app/(dashboard)/dashboard/components/HomeBuyerChecklistCard.tsx

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ArrowRight, ListChecks } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
// FIX: Import the unified type from the centralized file
import { DashboardChecklistItem } from '../types'; 

interface HomeBuyerChecklistCardProps {
  // FIX: Use the unified type
  items: DashboardChecklistItem[]; 
  className?: string;
}

export const HomeBuyerChecklistCard = ({ items, className }: HomeBuyerChecklistCardProps) => {
  // Filter only items relevant to the home buyer (non-recurring maintenance/renewal items)
  const buyerItems = items.filter(item => !item.isRecurring);
    
  const completedCount = buyerItems.filter(i => i.status === 'COMPLETED').length;
  const totalCount = buyerItems.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  
  const cardTitle = totalCount > 0 && completedCount === totalCount 
    ? "Checklist Completed 🎉" 
    : "Home Buying Checklist";

  const cardDescription = totalCount > 0 && completedCount === totalCount
    ? "Congratulations! You're ready to get cozy."
    : `You have ${totalCount - completedCount} critical steps remaining.`;

  return (
    <Card className={cn("h-full flex flex-col shadow-lg", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              <ListChecks className="h-6 w-6 text-blue-600" />
              {cardTitle}
            </CardTitle>
            <CardDescription>{cardDescription}</CardDescription>
          </div>
          {totalCount > 0 && (
            <div className="text-right">
              <span className="text-2xl font-bold text-blue-600">{Math.round(progress)}%</span>
              <p className="text-xs text-muted-foreground">Complete</p>
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
                  "text-sm font-medium truncate",
                  item.status === 'COMPLETED' ? "text-gray-500 line-through" : "text-gray-900"
                )}>
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-xs text-gray-500 truncate">{item.description}</p>
                )}
              </div>
              {item.status !== 'COMPLETED' && (
                <Button variant="ghost" size="sm" className="ml-2 h-8 text-xs" asChild>
                   <Link href="/dashboard/checklist">Action</Link>
                </Button>
              )}
            </div>
          ))}
          {buyerItems.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <p>Your checklist is empty. Get started in the full checklist view!</p>
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