'use client';

import { ReactNode, useCallback, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDestructiveActionDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  confirming?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export interface ConfirmDestructiveActionOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}

type PendingConfirmation = ConfirmDestructiveActionOptions & {
  resolve: (value: boolean) => void;
};

export default function ConfirmDestructiveActionDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  confirming = false,
  onConfirm,
  onOpenChange,
}: ConfirmDestructiveActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={confirmDisabled || confirming}
          >
            {confirming ? 'Working...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useConfirmDestructiveAction() {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const closeWithResult = useCallback((result: boolean) => {
    setPending((current) => {
      if (current) current.resolve(result);
      return null;
    });
  }, []);

  const requestConfirmation = useCallback((options: ConfirmDestructiveActionOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({
        ...options,
        resolve,
      });
    });
  }, []);

  const confirmationDialog = useMemo(
    () => (
      <ConfirmDestructiveActionDialog
        open={Boolean(pending)}
        title={pending?.title || 'Confirm action'}
        description={pending?.description || 'This action cannot be undone.'}
        confirmLabel={pending?.confirmLabel}
        cancelLabel={pending?.cancelLabel}
        onConfirm={() => closeWithResult(true)}
        onOpenChange={(open) => {
          if (!open) closeWithResult(false);
        }}
      />
    ),
    [pending, closeWithResult]
  );

  return {
    requestConfirmation,
    confirmationDialog,
  };
}
