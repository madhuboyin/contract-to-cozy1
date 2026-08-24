'use client';

// Home Intelligence Functional Completeness FRD Phase 4 review finding 2
// gap fix (HI-OUT-003): "completion date, cost, DIY/provider, provider
// identity, notes, photos/documents, observed result, and follow-up need."
// Previously Home's own CompleteMaterialWorkDialog collected only cost, and
// Fix collected nothing at all (WorkItemManageDrawer deferred to "the
// linked execution record"). One shared dialog now backs both surfaces so
// they can never drift back apart on which fields exist.
import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';

export interface RichCompletionValues {
  completedAt: string;
  costCents: number | null;
  fulfillmentMode: 'DIY' | 'PROVIDER' | null;
  providerName: string | null;
  notes: string | null;
  observedResult: 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' | null;
  followUpNeeded: boolean;
  photoDocumentIds: string[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const RESULT_OPTIONS = [
  { value: 'CONFIRMED_HEALTHY' as const, label: 'Looks good' },
  { value: 'NEEDS_ATTENTION' as const, label: 'Needs attention' },
  { value: 'FAILED' as const, label: 'Failed' },
];

export function RichCompletionDialog({
  open,
  onOpenChange,
  propertyId,
  submitting,
  costRequired,
  description,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  submitting: boolean;
  costRequired: boolean;
  description?: string;
  onSubmit: (values: RichCompletionValues) => void;
}) {
  const { toast } = useToast();
  const [completedAt, setCompletedAt] = React.useState(todayIso());
  const [costInput, setCostInput] = React.useState('');
  const [fulfillmentMode, setFulfillmentMode] = React.useState<'DIY' | 'PROVIDER' | null>(null);
  const [providerName, setProviderName] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [observedResult, setObservedResult] = React.useState<'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' | null>(null);
  const [followUpNeeded, setFollowUpNeeded] = React.useState(false);
  const [photoDocumentIds, setPhotoDocumentIds] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);

  const parsedCostCents = (() => {
    const dollars = Number(costInput);
    if (!costInput.trim() || !Number.isFinite(dollars) || dollars < 0) return null;
    return Math.round(dollars * 100);
  })();

  const reset = React.useCallback(() => {
    setCompletedAt(todayIso());
    setCostInput('');
    setFulfillmentMode(null);
    setProviderName('');
    setNotes('');
    setObservedResult(null);
    setFollowUpNeeded(false);
    setPhotoDocumentIds([]);
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, 5)) {
        const res = await api.uploadDocument(file, { type: 'PHOTO', name: file.name, propertyId });
        if (res.success && res.data) uploaded.push(res.data.id);
        else throw new Error(res.message || `Unable to upload ${file.name}.`);
      }
      setPhotoDocumentIds((prev) => [...prev, ...uploaded]);
    } catch (error) {
      toast({ title: 'Unable to upload photo', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = !costRequired || parsedCostCents !== null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete this work</DialogTitle>
          <DialogDescription>{description ?? 'Record how this was completed.'}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="completion-date">Completion date</Label>
              <Input id="completion-date" type="date" value={completedAt} max={todayIso()} onChange={(event) => setCompletedAt(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="completion-cost">Cost ($){costRequired ? ' *' : ''}</Label>
              <Input
                id="completion-cost"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={costInput}
                onChange={(event) => setCostInput(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Who did this?</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={fulfillmentMode === 'DIY' ? 'default' : 'outline'} onClick={() => setFulfillmentMode('DIY')}>
                I did it myself
              </Button>
              <Button type="button" size="sm" variant={fulfillmentMode === 'PROVIDER' ? 'default' : 'outline'} onClick={() => setFulfillmentMode('PROVIDER')}>
                A provider did it
              </Button>
            </div>
          </div>
          {fulfillmentMode === 'PROVIDER' && (
            <div className="space-y-2">
              <Label htmlFor="completion-provider">Provider name</Label>
              <Input id="completion-provider" value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="Who did the work?" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Result</Label>
            <div className="flex flex-wrap gap-2">
              {RESULT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={observedResult === option.value ? 'default' : 'outline'}
                  onClick={() => setObservedResult(observedResult === option.value ? null : option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="completion-notes">Notes</Label>
            <Textarea id="completion-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything worth remembering about this?" rows={3} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="completion-photos">Photos or documents</Label>
            <Input id="completion-photos" type="file" accept="image/*,application/pdf" multiple disabled={uploading} onChange={(event) => handleFiles(event.target.files)} />
            {uploading && <p className="text-xs text-slate-500">Uploading…</p>}
            {!uploading && photoDocumentIds.length > 0 && (
              <p className="text-xs text-slate-500">{photoDocumentIds.length} attached</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox checked={followUpNeeded} onCheckedChange={(checked) => setFollowUpNeeded(checked === true)} />
            This needs a follow-up later
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button
            disabled={!canSubmit || submitting || uploading}
            onClick={() => {
              onSubmit({
                completedAt: new Date(`${completedAt}T00:00:00.000Z`).toISOString(),
                costCents: parsedCostCents,
                fulfillmentMode,
                providerName: fulfillmentMode === 'PROVIDER' && providerName.trim() ? providerName.trim() : null,
                notes: notes.trim() || null,
                observedResult,
                followUpNeeded,
                photoDocumentIds,
              });
            }}
          >
            Mark done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
