//apps/frontend/src/app/(dashboard)/dashboard/components/FavoriteProvidersCard.tsx

import React from 'react';
import Link from 'next/link';
import { Star, Phone } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar'; // Assuming you have this shadcn component
import { cn } from '@/lib/utils';

export const FavoriteProvidersCard = ({ className }: { className?: string }) => {
  // Placeholder data for now - will be real data in later phases
  const favorites: any[] = []; 

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader>
        <CardTitle className="font-heading text-xl flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
          My Pros
        </CardTitle>
        <CardDescription className="font-body text-sm">
          Quick access to trusted providers
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {favorites.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm mb-3">Save providers you love here.</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/providers">Find Providers</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
             {/* List logic will go here */}
          </div>
        )}
      </CardContent>
    </Card>
  );
};