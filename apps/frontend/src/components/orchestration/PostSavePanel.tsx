'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

type Props = {
  title: string;
  nextDueDate?: string;
  variant: 'SERVICE' | 'COVERAGE' | 'REMINDER';
  onPrimary?: () => void;
  onDismiss: () => void;
};

export function PostSavePanel({
  title,
  nextDueDate,
  variant,
  onPrimary,
  onDismiss,
}: Props) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-start gap-2">
        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
        <div>
          <p className="font-semibold">Task scheduled</p>
          <p className="text-sm text-muted-foreground">
            {title} has been added to your maintenance plan.
          </p>
          {nextDueDate && (
            <p className="text-xs text-muted-foreground mt-1">
              Next due: {nextDueDate}
            </p>
          )}
        </div>
      </div>

      {variant !== 'REMINDER' && (
        <div className="pt-2 border-t">
          <p className="text-sm font-medium">
            {variant === 'SERVICE'
              ? 'Want help getting this done?'
              : 'Protect this item'}
          </p>
          <p className="text-sm text-muted-foreground">
            {variant === 'SERVICE'
              ? 'We can help you find trusted local providers when you’re ready.'
              : 'Adding coverage can reduce unexpected repair costs.'}
          </p>

          <div className="flex gap-2 mt-3">
            {onPrimary && (
              <Button size="sm" onClick={onPrimary}>
                {variant === 'SERVICE'
                  ? 'Find providers'
                  : 'Review coverage options'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {variant === 'SERVICE' ? 'I’ll do this later' : 'Not now'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
