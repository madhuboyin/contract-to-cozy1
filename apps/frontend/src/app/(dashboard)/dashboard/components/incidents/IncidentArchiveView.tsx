'use client';

import React, { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { IncidentDTO } from '@/types/incidents.types';
import IncidentSeverityBadge from './IncidentSeverityBadge';
import IncidentStatusBadge from './IncidentStatusBadge';
import { MobileCard, EmptyStateCard } from '@/components/mobile/dashboard/MobilePrimitives';
import { track } from '@/lib/analytics/events';

interface IncidentArchiveViewProps {
  propertyId: string;
  onRestore: (incidentId: string) => Promise<void>;
  onPermanentDelete?: (incidentId: string) => Promise<void>;
}

export default function IncidentArchiveView({
  propertyId,
  onRestore,
  onPermanentDelete
}: IncidentArchiveViewProps) {
  const [archivedIncidents, setArchivedIncidents] = useState<IncidentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadArchivedIncidents();
    track('incident_archive_view_opened', { propertyId });
  }, [propertyId]);

  async function loadArchivedIncidents() {
    setLoading(true);
    setError(null);
    try {
      // TODO: Implement API call to fetch archived incidents
      // const response = await fetch(`/api/properties/${propertyId}/incidents?archived=true`);
      // const data = await response.json();
      // setArchivedIncidents(data.items);
      
      // Placeholder for now
      setArchivedIncidents([]);
    } catch (ex: any) {
      setError(ex?.message ?? 'Failed to load archived incidents');
    } finally {
      setLoading(false);
    }
  }

  const handleRestore = async (incidentId: string) => {
    try {
      await onRestore(incidentId);
      track('incident_restored', { incidentId, propertyId });
      await loadArchivedIncidents();
    } catch (ex: any) {
      setError(ex?.message ?? 'Failed to restore incident');
    }
  };

  const handleDelete = async (incidentId: string) => {
    if (!onPermanentDelete) return;
    
    if (confirm('Permanently delete this incident? This cannot be undone.')) {
      try {
        await onPermanentDelete(incidentId);
        await loadArchivedIncidents();
      } catch (ex: any) {
        setError(ex?.message ?? 'Failed to delete incident');
      }
    }
  };

  if (loading) {
    return (
      <MobileCard variant="compact" className="text-sm text-slate-600">
        Loading archived incidents...
      </MobileCard>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (archivedIncidents.length === 0) {
    return (
      <div className="rounded-xl border bg-slate-50 p-8 text-center">
        <Archive className="mx-auto h-12 w-12 text-slate-400" />
        <h3 className="mt-4 text-sm font-semibold text-slate-900">No archived incidents</h3>
        <p className="mt-2 text-sm text-slate-600">
          Archived incidents will appear here. You can restore them at any time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Archive className="h-4 w-4" />
        <span>{archivedIncidents.length} archived incident{archivedIncidents.length !== 1 ? 's' : ''}</span>
      </div>

      {archivedIncidents.map((incident) => (
        <MobileCard key={incident.id}>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 line-clamp-2">
                  {incident.title}
                </h3>
                {incident.summary && (
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                    {incident.summary}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <IncidentSeverityBadge severity={incident.severity} />
              <IncidentStatusBadge status={incident.status} />
            </div>

            <p className="text-xs text-slate-500">
              Created {formatDistanceToNow(parseISO(incident.createdAt), { addSuffix: true })}
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[36px] flex-1"
                onClick={() => handleRestore(incident.id)}
              >
                <ArchiveRestore className="h-4 w-4 mr-1.5" />
                Restore
              </Button>
              
              {onPermanentDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[36px] text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleDelete(incident.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </MobileCard>
      ))}
    </div>
  );
}
