// apps/frontend/src/components/orchestration/OrchestrationActionCard.tsx
'use client';

import React from 'react';
import { OrchestratedActionDTO } from '@/types';
import { Button } from '@/components/ui/button';

type Props = {
  action: OrchestratedActionDTO;
  onCtaClick?: (action: OrchestratedActionDTO) => void;
  ctaDisabled?: boolean;
  ctaLabel?: string;
};

export const OrchestrationActionCard: React.FC<Props> = ({
  action,
  onCtaClick,
  ctaDisabled = false,
  ctaLabel,
}) => {
  const showCta = action.cta?.show && onCtaClick;
  const buttonLabel = ctaLabel || action.cta?.label || 'Take Action';

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">
            {action.title}
          </h3>
          {action.description && (
            <p className="text-sm text-gray-600 mt-1">{action.description}</p>
          )}
        </div>

        {/* Risk Level Badge */}
        {action.riskLevel && (
          <span
            className={`
              px-2 py-1 text-xs font-semibold rounded shrink-0
              ${action.riskLevel === 'CRITICAL' ? 'bg-red-100 text-red-800' : ''}
              ${action.riskLevel === 'HIGH' ? 'bg-orange-100 text-orange-800' : ''}
              ${action.riskLevel === 'MODERATE' ? 'bg-yellow-100 text-yellow-800' : ''}
              ${action.riskLevel === 'LOW' ? 'bg-blue-100 text-blue-800' : ''}
            `}
          >
            {action.riskLevel}
          </span>
        )}
      </div>

      {/* Metadata */}
      <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
        {action.category && (
          <span className="uppercase font-medium">{action.category}</span>
        )}
        {action.exposure && (
          <span className="font-semibold text-gray-900">
            ${action.exposure.toLocaleString()}
          </span>
        )}
        {action.confidence && (
          <span>
            Confidence <span className="font-semibold">{Math.round(action.confidence.score * 100)}%</span>
          </span>
        )}
      </div>

      {/* CTA Button */}
      {showCta && (
        <div className="mt-4">
          <Button
            size="sm"
            onClick={() => !ctaDisabled && onCtaClick(action)}
            disabled={ctaDisabled}
            className={ctaDisabled ? 'cursor-not-allowed opacity-60' : ''}
          >
            {buttonLabel}
          </Button>
        </div>
      )}
    </div>
  );
};