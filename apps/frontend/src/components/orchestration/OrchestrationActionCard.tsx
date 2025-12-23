// apps/frontend/src/components/orchestration/OrchestrationActionCard.tsx
'use client';

import React, { useState } from 'react';
import { OrchestratedActionDTO } from '@/types';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

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
  const [showDetails, setShowDetails] = useState(false);

  const showCta = action.cta?.show && onCtaClick;
  const buttonLabel = ctaLabel || action.cta?.label || 'Take Action';
  const confidencePercent = action.confidence ? Math.round(action.confidence.score * 100) : 0;

  // Color based on risk level
  const getRiskColor = () => {
    switch (action.riskLevel) {
      case 'CRITICAL':
        return 'bg-red-500';
      case 'HIGH':
        return 'bg-orange-500';
      case 'MODERATE':
        return 'bg-yellow-500';
      case 'LOW':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 leading-tight">
            {action.title}
          </h3>
          {action.description && (
            <p className="text-sm text-gray-600 mt-1">{action.description}</p>
          )}
        </div>

        {/* Risk Badge */}
        {action.riskLevel && (
          <span
            className={`
              px-2.5 py-1 text-xs font-bold rounded-md uppercase shrink-0
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

      {/* Metadata Row */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        {action.category && (
          <span className="font-semibold text-gray-700 uppercase">
            {action.category}
          </span>
        )}
        {action.exposure && (
          <span className="font-semibold text-gray-900">
            ${action.exposure.toLocaleString()}
          </span>
        )}
      </div>

      {/* Confidence Progress Bar */}
      {action.confidence && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
            <span>Confidence</span>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-blue-600 hover:text-blue-700 hover:underline"
            >
              {confidencePercent}%
            </button>
          </div>
          <Progress 
            value={confidencePercent} 
            className="h-2"
            indicatorClassName={getRiskColor()}
          />
          
          {/* Confidence Details Dropdown */}
          {showDetails && action.confidence.explanation && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
              <div className="font-medium mb-1">How is this calculated?</div>
              <ul className="list-disc list-inside space-y-0.5">
                {action.confidence.explanation.map((exp, idx) => (
                  <li key={idx}>{exp}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Action Row */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* CTA Button */}
        {showCta && (
          <Button
            size="sm"
            onClick={() => !ctaDisabled && onCtaClick(action)}
            disabled={ctaDisabled}
            className={ctaDisabled ? 'cursor-not-allowed opacity-60' : ''}
          >
            {buttonLabel}
          </Button>
        )}

        {/* Info Links */}
        {action.suppression?.reasons && action.suppression.reasons.length > 0 && (
          <button
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
            onClick={() => setShowDetails(!showDetails)}
          >
            Why you're seeing this
          </button>
        )}

        {action.decisionTrace?.steps && action.decisionTrace.steps.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-blue-600 hover:text-blue-700 hover:underline list-none">
              See how this was decided
            </summary>
            <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200">
              <ul className="space-y-2 text-xs">
                {action.decisionTrace.steps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span
                      className={`
                        font-medium
                        ${step.outcome === 'APPLIED' ? 'text-green-600' : 'text-gray-400'}
                      `}
                    >
                      {step.outcome === 'APPLIED' ? '✓' : '○'}
                    </span>
                    <span className="text-gray-700">{step.rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>

      {/* Suppression Reasons (when expanded) */}
      {showDetails && action.suppression?.reasons && action.suppression.reasons.length > 0 && (
        <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
          <div className="text-xs font-medium text-yellow-900 mb-2">
            Why you're seeing this:
          </div>
          <ul className="space-y-1 text-xs text-yellow-800">
            {action.suppression.reasons.map((reason, idx) => (
              <li key={idx}>• {reason.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};