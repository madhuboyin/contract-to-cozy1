// apps/frontend/src/components/orchestration/OrchestrationActionCard.tsx
'use client';

import React, { useState } from 'react';
import { OrchestratedActionDTO } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DecisionTraceItem } from './DecisionTraceItem';

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
  const [showDecisionTrace, setShowDecisionTrace] = useState(false);
  const [showConfidenceDetails, setShowConfidenceDetails] = useState(false);

  const showCta = action.cta?.show && onCtaClick;
  const buttonLabel = ctaLabel || action.cta?.label || 'Take Action';

  return (
    <>
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900">
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

        {/* Metadata Row */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {action.category && (
            <span className="text-gray-700 font-medium uppercase">
              {action.category}
            </span>
          )}
          {action.exposure && (
            <span className="font-semibold text-gray-900">
              ${action.exposure.toLocaleString()}
            </span>
          )}
          {action.confidence && (
            <button
              onClick={() => setShowConfidenceDetails(true)}
              className="text-blue-600 hover:text-blue-700 hover:underline"
            >
              Confidence {Math.round(action.confidence.score * 100)}%
            </button>
          )}
        </div>

        {/* Action Links Row - ALWAYS VISIBLE */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
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

          {/* Why you're seeing this */}
          {action.suppression?.reasons && action.suppression.reasons.length > 0 && (
            <button
              onClick={() => setShowDecisionTrace(true)}
              className="text-blue-600 hover:text-blue-700 hover:underline"
            >
              Why you're seeing this
            </button>
          )}

          {/* Decision Trace */}
          {action.decisionTrace?.steps && action.decisionTrace.steps.length > 0 && (
            <button
              onClick={() => setShowDecisionTrace(true)}
              className="text-blue-600 hover:text-blue-700 hover:underline"
            >
              See how this was decided
            </button>
          )}
        </div>
      </div>

      {/* Decision Trace Modal */}
      <Dialog open={showDecisionTrace} onOpenChange={setShowDecisionTrace}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Decision Trace: {action.title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Suppression Reasons */}
            {action.suppression?.reasons && action.suppression.reasons.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Suppression Reasons</h4>
                <div className="space-y-2">
                  {action.suppression.reasons.map((reason, idx) => (
                    <DecisionTraceItem key={idx} type="REASON" reason={reason} />
                  ))}
                </div>
              </div>
            )}

            {/* Decision Steps */}
            {action.decisionTrace?.steps && action.decisionTrace.steps.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Decision Steps</h4>
                <div className="space-y-2">
                  {action.decisionTrace.steps.map((step, idx) => (
                    <DecisionTraceItem key={idx} type="RULE" step={step} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confidence Details Modal */}
      <Dialog open={showConfidenceDetails} onOpenChange={setShowConfidenceDetails}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How is this calculated?</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">
                Confidence Score: {Math.round((action.confidence?.score || 0) * 100)}%
              </div>
              <div className="text-sm text-gray-600">
                Level: {action.confidence?.level || 'UNKNOWN'}
              </div>
            </div>

            {action.confidence?.explanation && action.confidence.explanation.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Factors:
                </div>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                  {action.confidence.explanation.map((exp, idx) => (
                    <li key={idx}>{exp}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};