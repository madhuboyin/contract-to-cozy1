'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { FeatureContextEvaluation } from './featureContextTypes';

export function useFeatureContextCapture({
  propertyId,
  featureKey,
  operationKey,
  operationInput,
  onReady,
}: {
  propertyId: string;
  featureKey: string;
  operationKey: string;
  operationInput?: Record<string, unknown>;
  onReady?: (evaluation: FeatureContextEvaluation) => void | Promise<void>;
}) {
  const [evaluation, setEvaluation] = useState<FeatureContextEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppressedRequirementId, setSuppressedRequirementId] = useState<string | null>(null);
  const readyVersion = useRef<string | null>(null);

  const evaluate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.evaluateFeatureContext(propertyId, { featureKey, operationKey, operationInput });
      if (!response.success) throw new Error(response.message || 'Could not check property details.');
      setEvaluation(response.data);
      return response.data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not check property details.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [featureKey, operationInput, operationKey, propertyId]);

  useEffect(() => { void evaluate(); }, [evaluate]);

  useEffect(() => {
    if (!evaluation?.canExecute || readyVersion.current === evaluation.contextVersion) return;
    readyVersion.current = evaluation.contextVersion;
    void onReady?.(evaluation);
  }, [evaluation, onReady]);

  const capture = useCallback(async (value: unknown) => {
    const requirement = evaluation?.requirements[0];
    if (!evaluation || !requirement || requirement.capture.actionKey === 'PERMISSION_REQUIRED') return;
    setSaving(true);
    setError(null);
    try {
      const response = await api.captureFeatureContext(propertyId, {
        requirementId: requirement.requirementId,
        captureKey: requirement.capture.captureKey,
        featureKey,
        operationKey,
        expectedContextVersion: evaluation.contextVersion,
        idempotencyKey: crypto.randomUUID(),
        answer: requirement.capture.mode === 'STRUCTURED'
          ? value as Record<string, unknown>
          : { value },
      });
      if (!response.success) throw new Error(response.message || 'Could not save this detail.');
      setEvaluation(response.data.evaluation);
      const containsUnknown = value === null || value === 'UNKNOWN' || (
        value !== null && typeof value === 'object' && Object.values(value as Record<string, unknown>)
          .some((entry) => entry === null || entry === 'UNKNOWN')
      );
      setSuppressedRequirementId(
        containsUnknown && response.data.evaluation.requirements[0]?.requirementId === requirement.requirementId
          ? requirement.requirementId
          : null,
      );
      window.dispatchEvent(new CustomEvent('property-context:updated', {
        detail: { propertyId, contextVersion: response.data.contextVersion, updatedFactKeys: response.data.updatedFactKeys },
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this detail.');
    } finally {
      setSaving(false);
    }
  }, [evaluation, featureKey, operationKey, propertyId]);

  return { evaluation, loading, saving, error, capture, reevaluate: evaluate, suppressedRequirementId };
}
