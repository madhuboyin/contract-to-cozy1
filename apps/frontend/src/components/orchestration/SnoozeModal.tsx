// apps/frontend/src/components/orchestration/SnoozeModal.tsx
'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  open: boolean;
  onClose: () => void;
  onSnooze: (snoozeUntil: Date, snoozeReason?: string) => void;
  currentSnoozeUntil?: string | null;
};

const SNOOZE_DURATIONS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: 'custom', label: 'Custom date' },
];

const SNOOZE_REASONS = [
  { value: 'self', label: "I'll do this myself later" },
  { value: 'quote', label: 'Waiting for contractor quote' },
  { value: 'seasonal', label: 'Seasonal timing' },
  { value: 'budget', label: 'Budget constraints' },
  { value: 'other', label: 'Other' },
];

export const SnoozeModal: React.FC<Props> = ({
  open,
  onClose,
  onSnooze,
  currentSnoozeUntil,
}) => {
  console.log('🔍 SNOOZE MODAL: Rendered', { open, hasOnSnooze: !!onSnooze });
  const [duration, setDuration] = useState<string>('30');
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState<string>('');

  const handleSnooze = () => {
    console.log('🔍 SNOOZE MODAL: handleSnooze called');
    console.log('🔍 SNOOZE MODAL: Selected duration:', duration);
    console.log('🔍 SNOOZE MODAL: Custom date:', customDate);
    console.log('🔍 SNOOZE MODAL: Reason:', reason);
    let snoozeDate: Date;

    if (duration === 'custom') {
      if (!customDate) {
        return; // Validation - custom date required
      }
      snoozeDate = customDate;
    } else {
      snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + parseInt(duration));
    }

    // Set to end of day
    snoozeDate.setHours(23, 59, 59, 999);
    console.log('🔍 SNOOZE MODAL: Calling onSnooze prop with:', snoozeDate);
    console.log('🔍 SNOOZE MODAL: Reason:', reason);
    onSnooze(snoozeDate, reason || undefined);
    console.log('🔍 SNOOZE MODAL: onSnooze prop called, closing modal')
    handleClose();
  };

  const handleClose = () => {
    setDuration('30');
    setCustomDate(undefined);
    setReason('');
    onClose();
  };

  const isExtending = !!currentSnoozeUntil;
  const currentDate = currentSnoozeUntil
    ? new Date(currentSnoozeUntil).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isExtending ? 'Extend snooze' : 'Snooze this recommendation'}
          </DialogTitle>
          {isExtending && currentDate && (
            <p className="text-sm text-muted-foreground mt-1">
              Currently snoozed until {currentDate}. Choose a new date:
            </p>
          )}
          {!isExtending && (
            <p className="text-sm text-muted-foreground mt-1">
              We'll remind you about this later
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Duration Selection */}
          <div className="space-y-3">
            <Label>How long do you want to snooze this?</Label>
            <RadioGroup value={duration} onValueChange={setDuration}>
              {SNOOZE_DURATIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2 min-h-[44px]">
                  <RadioGroupItem value={option.value} id={option.value} />
                  <Label htmlFor={option.value} className="font-normal cursor-pointer">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Custom Date Picker */}
          {duration === 'custom' && (
            <div className="space-y-2">
              <Label>Select date</Label>
              <div className="border rounded-md p-3">
                <Calendar
                  mode="single"
                  selected={customDate}
                  onSelect={setCustomDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </div>
            </div>
          )}

          {/* Reason (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {SNOOZE_REASONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSnooze}
            disabled={duration === 'custom' && !customDate}
          >
            {isExtending ? 'Extend snooze' : 'Snooze'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};