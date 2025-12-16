// apps/frontend/src/components/community/EmptyState.tsx
'use client';

import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
}

export function EmptyState({ 
  title, 
  description, 
  icon, 
  action,
  secondaryAction 
}: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      {icon && (
        <div className="flex justify-center mb-4 text-muted-foreground opacity-50">
          {icon}
        </div>
      )}
      
      <h3 className="text-lg font-semibold text-gray-800 mb-2">
        {title}
      </h3>
      
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        {description}
      </p>

      {(action || secondaryAction) && (
        <div className="flex gap-3 justify-center flex-wrap">
          {action && (
            action.href ? (
              <Button asChild>
                <a href={action.href} target="_blank" rel="noopener noreferrer">
                  {action.label}
                  {action.href.startsWith('http') && (
                    <ExternalLink className="ml-2 h-4 w-4" />
                  )}
                </a>
              </Button>
            ) : (
              <Button onClick={action.onClick}>
                {action.label}
              </Button>
            )
          )}
          
          {secondaryAction && (
            secondaryAction.href ? (
              <Button variant="outline" asChild>
                <a href={secondaryAction.href} target="_blank" rel="noopener noreferrer">
                  {secondaryAction.label}
                  {secondaryAction.href.startsWith('http') && (
                    <ExternalLink className="ml-2 h-4 w-4" />
                  )}
                </a>
              </Button>
            ) : (
              <Button variant="outline" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}