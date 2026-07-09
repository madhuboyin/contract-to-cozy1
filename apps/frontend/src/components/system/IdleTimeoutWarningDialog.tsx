'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface IdleTimeoutWarningDialogProps {
  open: boolean;
  secondsRemaining: number;
  onStayActive: () => void;
}

/**
 * Warning shown ~60s before an idle admin session is logged out. Esc,
 * overlay-click, and the default close button are all disabled — only the
 * explicit "Stay signed in" button may reset the idle clock, otherwise the
 * timeout is defeated by a mouse resting near the dialog.
 */
export function IdleTimeoutWarningDialog({ open, secondsRemaining, onStayActive }: IdleTimeoutWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        hideCloseButton
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Session about to expire</DialogTitle>
          <DialogDescription>
            You&apos;ll be signed out in {secondsRemaining}s due to inactivity.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onStayActive}>Stay signed in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
