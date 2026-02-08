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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { StarRating } from './StarRating';
import { PhotoUpload } from './PhotoUpload';
import { CompletionDataDTO } from '@/types';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompletionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CompletionDataDTO) => Promise<void>;
  actionTitle: string;
  propertyId: string;
  actionKey: string;
  onPhotoUpload: (file: File, orderIndex: number) => Promise<{ id: string; thumbnailUrl: string }>;
}

export const CompletionModal: React.FC<CompletionModalProps> = ({
  open,
  onClose,
  onSubmit,
  actionTitle,
  propertyId,
  actionKey,
  onPhotoUpload,
}) => {
  const [completedDate, setCompletedDate] = useState<Date>(new Date());
  const [cost, setCost] = useState<string>('');
  const [didItMyself, setDidItMyself] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const showProviderFields = !didItMyself;

  const handleSubmit = async () => {
    setSubmitting(true);

    try {
      const completionData: CompletionDataDTO = {
        completedAt: completedDate.toISOString(),
        cost: cost ? parseFloat(cost) : null,
        didItMyself,
        serviceProviderName: showProviderFields ? providerName || null : null,
        serviceProviderRating: showProviderFields ? rating : null,
        notes: notes || null,
        photoIds,
      };

      await onSubmit(completionData);
      
      // Reset form
      setCompletedDate(new Date());
      setCost('');
      setDidItMyself(false);
      setProviderName('');
      setRating(null);
      setNotes('');
      setPhotoIds([]);
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = completedDate !== null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirm Completion</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{actionTitle}</p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Completion Date */}
          <div className="space-y-2">
            <Label>
              When was this completed? <span className="text-red-500">*</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !completedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {completedDate ? format(completedDate, 'PPP') : 'Select date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={completedDate}
                  onSelect={(date) => date && setCompletedDate(date)}
                  disabled={(date) => date > new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <Label>Add photos (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Document the completed work for your records
            </p>
            <PhotoUpload
              propertyId={propertyId}
              actionKey={actionKey}
              maxPhotos={5}
              onPhotosChange={setPhotoIds}
              onUpload={onPhotoUpload}
            />
          </div>

          {/* Cost */}
          <div className="space-y-2">
            <Label htmlFor="cost">Total cost (optional)</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  id="cost"
                  type="number"
                  placeholder="$0.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  disabled={didItMyself}
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Include materials and labor
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="did-it-myself"
                checked={didItMyself}
                onCheckedChange={(checked) => {
                  setDidItMyself(checked === true);
                  if (checked) {
                    setCost('0');
                    setProviderName('');
                    setRating(null);
                  }
                }}
              />
              <label
                htmlFor="did-it-myself"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I did this myself
              </label>
            </div>
          </div>

          {/* Service Provider */}
          {showProviderFields && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="provider">Who did the work?</Label>
                <Input
                  id="provider"
                  placeholder="Service provider name or company"
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>How was your experience?</Label>
                <StarRating value={rating} onChange={setRating} />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes about this work (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any details worth remembering? Issues encountered? Warranty info?"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
              rows={4}
            />
            <p className="text-xs text-muted-foreground text-right">
              {notes.length} / 1000 characters
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? 'Saving...' : 'Save & Mark Complete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};