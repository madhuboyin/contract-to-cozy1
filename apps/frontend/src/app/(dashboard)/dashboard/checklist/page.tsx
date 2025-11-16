// apps/frontend/src/app/(dashboard)/dashboard/checklist/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  // CardFooter, // No longer used by new row component
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Check, // Kept for 'Mark as Complete' in mobile menu (fallback)
  Loader2,
  AlertCircle,
  Search,
  X,
  MoreVertical, // <-- NEW: For dropdown menu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox'; // <-- This will now be found
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'; // <-- This will now be found
import { CheckedState } from '@radix-ui/react-checkbox'; // <-- NEW: Import type for 'checked'

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

      {/* --- START: Checklist Items Redesign --- */}
      {/* Replaced <div className="space-y-4"> with a Card-backed list */}
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-gray-200">
            {checklist.items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                onUpdateStatus={handleUpdateStatus}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
      {/* --- END: Checklist Items Redesign --- */}
    </div>
  );
}

// --- START: Replaced ChecklistItemCard with ChecklistItemRow ---

interface ChecklistItemRowProps {
  item: ChecklistItemType & { isUpdating?: boolean };
  onUpdateStatus: (itemId: string, status: ChecklistItemStatus) => void;
}

function ChecklistItemRow({ item, onUpdateStatus }: ChecklistItemRowProps) {
  const isPending = item.status === 'PENDING';
  const isCompleted = item.status === 'COMPLETED';

  return (
    <li
      className={cn(
        'flex items-center justify-between p-4',
        item.isUpdating && 'opacity-60 pointer-events-none'
      )}
    >
      {/* Left side: Checkbox and Text */}
      <div className="flex items-start space-x-4 flex-1 min-w-0">
        <Checkbox
          id={item.id}
          checked={isCompleted}
          // --- FIX: Explicitly type 'checked' parameter ---
          onCheckedChange={(checked: CheckedState) =>
            onUpdateStatus(item.id, checked ? 'COMPLETED' : 'PENDING')
          }
          disabled={item.isUpdating}
          className="mt-1" // Aligns checkbox with the first line of text
        />
        <div
          className={cn(
            'grid gap-0.5 flex-1 min-w-0', // min-w-0 ensures truncation works
            isCompleted && 'text-muted-foreground'
          )}
        >
          <label
            htmlFor={item.id}
            className={cn(
              'font-medium cursor-pointer truncate',
              isCompleted && 'line-through'
            )}
          >
            {item.title}
          </label>
          {item.description && (
            <p
              className={cn(
                'text-sm text-muted-foreground',
                isCompleted && 'line-through'
              )}
            >
              {item.description}
            </p>
          )}
        </div>
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
        {isPending ? (
          <>
            {/* Show "Find Provider" button if a category exists */}
            {item.serviceCategory && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="hidden sm:flex" // Hide on mobile, show on sm screens up
              >
                <Link
                  href={`/dashboard/providers?service=${item.serviceCategory}`}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Find Provider
                </Link>
              </Button>
            )}
            {/* "..." menu for secondary actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={item.isUpdating}
                  className="h-8 w-8"
                >
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {/* Show "Find Provider" in menu on mobile screens */}
                {item.serviceCategory && (
                  <DropdownMenuItem asChild className="sm:hidden">
                    <Link
                      href={`/dashboard/providers?service=${item.serviceCategory}`}
                    >
                      <Search className="mr-2 h-4 w-4" />
                      Find Provider
                    </Link>
                  </DropdownMenuItem>
                )}
                {/* "I don't need this" action */}
                <DropdownMenuItem
                  onSelect={() => onUpdateStatus(item.id, 'NOT_NEEDED')}
                >
                  <X className="mr-2 h-4 w-4" />
                  I don't need this
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          // Show status badge if not pending
          <Badge
            variant={isCompleted ? 'success' : 'outline'}
            className="w-fit"
          >
            {isCompleted ? 'Completed' : 'Not Needed'}
          </Badge>
        )}
      </div>
    </li>
  );
}
// --- END: Replaced ChecklistItemCard with ChecklistItemRow ---