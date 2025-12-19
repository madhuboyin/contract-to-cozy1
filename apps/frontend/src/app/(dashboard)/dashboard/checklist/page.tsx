// Fixed apps/frontend/src/app/(dashboard)/dashboard/checklist/page.tsx
// Key fixes:
// 1. Parse API response correctly (unwrap {success, data} wrapper)
// 2. Add proper error handling
// 3. Add cache busting

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  Card,
  CardContent,
  CardDescription,
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
  MoreVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckedState } from '@radix-ui/react-checkbox';

// --- Types ---
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
function formatServiceCategory(category: string | null): string {
  if (!category) return '';
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// --- Main Page Component ---
export default function ChecklistPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [checklist, setChecklist] = useState<ChecklistType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect EXISTING_OWNER users to maintenance page
  useEffect(() => {
    if (user && user.segment === 'EXISTING_OWNER') {
      console.log('Redirecting EXISTING_OWNER to maintenance page');
      const searchParams = new URLSearchParams(window.location.search);
      const queryString = searchParams.toString();
      const redirectUrl = queryString 
        ? `/dashboard/maintenance?${queryString}`
        : '/dashboard/maintenance';
      router.replace(redirectUrl);
    }
  }, [user, router]);

  useEffect(() => {
    const fetchChecklist = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('accessToken');
        
        // FIX: Add cache busting to ensure fresh data
        const cacheBuster = `?_=${Date.now()}`;
        
        console.log('📋 Fetching checklist...');
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/checklist${cacheBuster}`,
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
        console.log('📋 Checklist API response:', data);
        
        // FIX: Handle both wrapped and unwrapped responses
        // API should return: {id, items: [...]} directly
        // But let's handle both cases for safety
        let checklistData;
        if (data.success && data.data) {
          // Wrapped response: {success: true, data: {id, items}}
          checklistData = data.data;
        } else if (data.id && data.items) {
          // Direct response: {id, items}
          checklistData = data;
        } else {
          throw new Error('Invalid checklist response format');
        }
        
        console.log('📋 Parsed checklist data:', checklistData);
        console.log('📋 Items count:', checklistData.items?.length || 0);
        
        setChecklist(checklistData);
      } catch (err: any) {
        console.error('📋 Checklist fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if user is loaded and is HOME_BUYER
    if (user && user.segment === 'HOME_BUYER') {
      fetchChecklist();
    }
  }, [user]);

  // Handler to update an item's status
  const handleUpdateStatus = async (
    itemId: string,
    status: ChecklistItemStatus
  ) => {
    if (!checklist) return;

    const originalItem = checklist.items.find((item) => item.id === itemId);
    if (!originalItem || originalItem.status === status) return;

    console.log('✏️ Updating item:', itemId, 'to status:', status);

    // Optimistic update
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

      const responseData = await response.json();
      console.log('✏️ Update response:', responseData);

      // FIX: Handle wrapped response from API
      // Backend returns: {success: true, data: updatedItem}
      let updatedItem;
      if (responseData.success && responseData.data) {
        updatedItem = responseData.data;
      } else if (responseData.id) {
        // Unwrapped item
        updatedItem = responseData;
      } else {
        throw new Error('Invalid update response format');
      }

      console.log('✏️ Updated item:', updatedItem);

      // Final update with server response
      setChecklist((prev) => ({
        ...prev!,
        items: prev!.items.map((item) =>
          item.id === itemId ? updatedItem : item
        ),
      }));

      console.log('✅ Item updated successfully');
    } catch (err: any) {
      console.error('❌ Update failed:', err);
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

  console.log('📊 Progress:', { completedItems, totalItems, progressPercent });

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
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-gray-200">
            {checklist.items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item as any}
                onUpdateStatus={handleUpdateStatus}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Checklist Item Row Component ---
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
          onCheckedChange={(checked: CheckedState) =>
            onUpdateStatus(item.id, checked ? 'COMPLETED' : 'PENDING')
          }
          className="mt-1"
        />
        <label
          htmlFor={item.id}
          className="flex-1 min-w-0 cursor-pointer"
        >
          <p
            className={cn(
              'font-medium text-sm',
              isCompleted && 'line-through text-gray-500'
            )}
          >
            {item.title}
          </p>
          {item.description && (
            <p className="text-xs text-gray-500 mt-1">{item.description}</p>
          )}
          {item.serviceCategory && (
            <Badge variant="outline" className="mt-2">
              {formatServiceCategory(item.serviceCategory)}
            </Badge>
          )}
        </label>
      </div>

      {/* Right side: Actions dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isPending && (
            <DropdownMenuItem onClick={() => onUpdateStatus(item.id, 'COMPLETED')}>
              <Check className="mr-2 h-4 w-4" />
              Mark Complete
            </DropdownMenuItem>
          )}
          {isCompleted && (
            <DropdownMenuItem onClick={() => onUpdateStatus(item.id, 'PENDING')}>
              <X className="mr-2 h-4 w-4" />
              Mark Pending
            </DropdownMenuItem>
          )}
          {item.serviceCategory && (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/providers?category=${item.serviceCategory}`}>
                <Search className="mr-2 h-4 w-4" />
                Find Provider
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}