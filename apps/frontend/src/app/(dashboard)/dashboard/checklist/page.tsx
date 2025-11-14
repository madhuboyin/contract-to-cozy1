// apps/frontend/src/app/(dashboard)/dashboard/checklist/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Check,
  Loader2,
  AlertCircle,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Types ---
// These types should match your Prisma schema
type ChecklistItemStatus = 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';

interface ChecklistItemType {
  id: string;
  title: string;
  description: string | null;
  status: ChecklistItemStatus;
  serviceCategory: string | null;
  createdAt: string;
}

interface ChecklistType {
  id: string;
  items: ChecklistItemType[];
}

// --- Helper Function ---
/**
 * Formats a service category string (e.g., "HOME_INSPECTION")
 * into a user-friendly title (e.g., "Home Inspection").
 */
function formatServiceCategory(category: string | null): string {
  if (!category) return '';
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// --- Main Page Component ---
export default function ChecklistPage() {
  const [checklist, setChecklist] = useState<ChecklistType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChecklist = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('accessToken');
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/checklist`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch your checklist.');
        }
        const data = await response.json();
        setChecklist(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchChecklist();
  }, []);

  // Handler to update an item's status
  const handleUpdateStatus = async (
    itemId: string,
    status: ChecklistItemStatus
  ) => {
    if (!checklist) return;

    // Find the item we're about to update
    const originalItem = checklist.items.find((item) => item.id === itemId);
    if (!originalItem || originalItem.status === status) return;

    // Optimistic update: Update the UI immediately
    const optimisticItems = checklist.items.map((item) =>
      item.id === itemId ? { ...item, status: status, isUpdating: true } : item
    );
    setChecklist({ ...checklist, items: optimisticItems as any });

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/checklist/items/${itemId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update item.');
      }

      const updatedItem = await response.json();

      // Final update: Replace the item with the confirmed one from the server
      setChecklist((prev) => ({
        ...prev!,
        items: prev!.items.map((item) =>
          item.id === itemId ? updatedItem : item
        ),
      }));
    } catch (err: any) {
      setError('Failed to update. Please try again.');
      // Rollback on error
      setChecklist((prev) => ({
        ...prev!,
        items: prev!.items.map((item) =>
          item.id === itemId ? originalItem : item
        ),
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-8 w-8 text-red-600" />
        <h2 className="mt-4 text-xl font-semibold text-red-700">
          Oops, something went wrong.
        </h2>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
        <h2 className="mt-4 text-xl font-semibold">No checklist found.</h2>
        <Button asChild className="mt-6" variant="outline">
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  // Calculate progress
  const completedItems = checklist.items.filter(
    (item) => item.status === 'COMPLETED'
  ).length;
  const totalItems = checklist.items.length;
  const progressPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <Button asChild variant="link" className="pl-0 text-blue-600">
        <Link href="/dashboard">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Link>
      </Button>

      <h2 className="text-3xl font-bold tracking-tight">
        Your Home Closure Journey
      </h2>
      <p className="text-lg text-muted-foreground">
        Track your progress and connect with trusted providers for each step.
      </p>

      {/* Progress Card */}
      <Card className="my-6">
        <CardHeader>
          <CardTitle>Your Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium text-gray-700">
            {completedItems} / {totalItems} items completed
          </p>
          <Progress value={progressPercent} className="w-full" />
        </CardContent>
      </Card>

      {/* Checklist Items */}
      <div className="space-y-4">
        {checklist.items.map((item) => (
          <ChecklistItemCard
            key={item.id}
            item={item}
            onUpdateStatus={handleUpdateStatus}
          />
        ))}
      </div>
    </div>
  );
}

// --- Sub-Component for each Item ---

interface ChecklistItemCardProps {
  item: ChecklistItemType & { isUpdating?: boolean };
  onUpdateStatus: (itemId: string, status: ChecklistItemStatus) => void;
}

function ChecklistItemCard({ item, onUpdateStatus }: ChecklistItemCardProps) {
  const isPending = item.status === 'PENDING';
  const isCompleted = item.status === 'COMPLETED';

  return (
    <Card
      className={cn(
        'transition-all',
        isCompleted && 'bg-gray-50/70',
        item.isUpdating && 'opacity-60'
      )}
    >
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <CardTitle
            className={cn(
              'text-lg md:text-xl',
              isCompleted && 'text-gray-500 line-through'
            )}
          >
            {item.title}
          </CardTitle>
          <Badge
            variant={
              isCompleted
                ? 'success'
                : item.status === 'NOT_NEEDED'
                ? 'outline'
                : 'default'
            }
            className="w-fit"
          >
            {item.status === 'COMPLETED'
              ? 'Completed'
              : item.status === 'NOT_NEEDED'
              ? 'Not Needed'
              : 'Pending'}
          </Badge>
        </div>
        {item.description && (
          <CardDescription
            className={cn(isCompleted && 'text-gray-400 line-through')}
          >
            {item.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50/50 p-4">
        {item.serviceCategory && isPending && (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            {/* This is the correct link structure to kick off the flow */}
            <Link
              href={`/dashboard/providers?service=${item.serviceCategory}`}
            >
              <Search className="mr-2 h-4 w-4" />
              Find {formatServiceCategory(item.serviceCategory)} Provider
            </Link>
          </Button>
        )}
        {!item.serviceCategory && isPending && (
          <div /> /* Spacer */
        )}

        {isPending ? (
          <div className="flex w-full sm:w-auto gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full sm:w-auto text-gray-600"
              onClick={() => onUpdateStatus(item.id, 'NOT_NEEDED')}
              disabled={item.isUpdating}
            >
              <X className="mr-2 h-4 w-4" />
              I don't need this
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => onUpdateStatus(item.id, 'COMPLETED')}
              disabled={item.isUpdating}
            >
              <Check className="mr-2 h-4 w-4" />
              Mark as Complete
            </Button>
          </div>
        ) : (
          <div className="text-sm font-medium text-green-700">
            {isCompleted ? 'All set!' : 'Marked as not needed.'}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}