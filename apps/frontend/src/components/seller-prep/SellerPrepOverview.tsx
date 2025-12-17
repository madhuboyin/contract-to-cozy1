// apps/frontend/src/components/seller-prep/SellerPrepOverview.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';

type Status = 'PLANNED' | 'DONE' | 'SKIPPED';
type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

type SellerPrepItem = {
  id: string;
  code: string;
  title: string;
  priority: Priority;
  roiRange: string;
  costBucket: '$' | '$$' | '$$$';
  status: Status;
};

type SellerPrepOverviewResponse = {
  propertyId: string;
  completionPercent: number;
  items: SellerPrepItem[];
};

export default function SellerPrepOverview({
  propertyId,
}: {
  propertyId: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SellerPrepOverviewResponse | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await api.getSellerPrepOverview(propertyId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        const errorMessage = 'error' in res && res.error ? res.error.message : 'Unknown error';
        toast({
          title: 'Failed to load Seller Prep',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Failed to load Seller Prep',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [propertyId]);

  const sortedItems = useMemo(() => {
    if (!data) return [];
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return [...data.items].sort(
      (a, b) => order[a.priority] - order[b.priority]
    );
  }, [data]);

  const nextStatus = (status: Status): Status => {
    if (status === 'PLANNED') return 'DONE';
    if (status === 'DONE') return 'SKIPPED';
    return 'PLANNED';
  };

  const updateStatus = async (item: SellerPrepItem) => {
    const newStatus = nextStatus(item.status);
    setSavingId(item.id);

    try {
      await api.updateSellerPrepItem(item.id, newStatus);

      toast({
        title: 'Updated',
        description: `${item.title} → ${newStatus}`,
      });

      await fetchOverview();
    } catch (err: any) {
      toast({
        title: 'Update failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-muted-foreground">
            Loading Seller Prep…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Prepare Your Home for Sale</CardTitle>
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{data.completionPercent}%</span>
            </div>
            <Progress value={data.completionPercent} />
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {sortedItems.map((item, idx) => (
            <div key={item.id}>
              {idx > 0 && <Separator className="my-3" />}

              <div className="flex justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-medium">{item.title}</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge>{item.priority}</Badge>
                    <Badge variant="outline">ROI {item.roiRange}</Badge>
                    <Badge variant="outline">Cost {item.costBucket}</Badge>
                    <Badge variant="secondary">{item.status}</Badge>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingId === item.id}
                  onClick={() => updateStatus(item)}
                >
                  {savingId === item.id ? 'Saving…' : 'Update'}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
