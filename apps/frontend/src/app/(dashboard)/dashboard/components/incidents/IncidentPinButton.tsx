'use client';

import React, { useState } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/events';

interface IncidentPinButtonProps {
  incidentId: string;
  propertyId: string;
  isPinned: boolean;
  onToggle: (pinned: boolean) => Promise<void>;
  disabled?: boolean;
}

export default function IncidentPinButton({
  incidentId,
  propertyId,
  isPinned,
  onToggle,
  disabled = false
}: IncidentPinButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      await onToggle(!isPinned);
      track('incident_pin_toggled', {
        incidentId,
        propertyId,
        isPinned: !isPinned
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={isPinned ? 'default' : 'outline'}
      size="sm"
      className={`min-h-[36px] ${isPinned ? 'bg-teal-600 hover:bg-teal-700' : ''}`}
      disabled={disabled || loading}
      onClick={handleToggle}
      title={isPinned ? 'Unpin incident' : 'Pin incident to keep it visible'}
    >
      {isPinned ? (
        <>
          <PinOff className="h-4 w-4 mr-1.5" />
          Pinned
        </>
      ) : (
        <>
          <Pin className="h-4 w-4 mr-1.5" />
          Pin
        </>
      )}
    </Button>
  );
}
