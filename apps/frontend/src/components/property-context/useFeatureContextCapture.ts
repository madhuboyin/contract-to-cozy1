'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { FeatureContextCaptureResult, FeatureContextEvaluation } from './featureContextTypes';

function containsUnknownAnswer(value: unknown): boolean {
  if (value === null || value === 'UNKNOWN' || value === 'NOT_SURE') return true;
  if (Array.isArray(value)) return value.some(containsUnknownAnswer);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(containsUnknownAnswer);
  return false;
}

export function useFeatureContextCapture({
  propertyId,
  featureKey,
  operationKey,
  operationInput,
  onReady,
  onCaptured,
}: {
  propertyId: string;
  featureKey: string;
  operationKey: string;
  operationInput?: Record<string, unknown>;
  onReady?: (evaluation: FeatureContextEvaluation) => void | Promise<void>;
  onCaptured?: (result: FeatureContextCaptureResult) => void | Promise<void>;
}) {
  const [evaluation, setEvaluation] = useState<FeatureContextEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppressedRequirementId, setSuppressedRequirementId] = useState<string | null>(null);
  const readyVersion = useRef<string | null>(null);
  const evaluationRequest = useRef(0);
  const activeIdentity = useRef('');
  const operationInputIdentity = JSON.stringify(operationInput ?? {});
  const contextIdentity = `${propertyId}:${featureKey}:${operationKey}:${operationInputIdentity}`;
  activeIdentity.current = contextIdentity;
  const operationInputRef = useRef(operationInput);
  operationInputRef.current = operationInput;

  const evaluate = useCallback(async () => {
    const requestId = ++evaluationRequest.current;
    setLoading(true);
    setEvaluation(null);
    setError(null);
    try {
      const response = await api.evaluateFeatureContext(propertyId, { featureKey, operationKey, operationInput: operationInputRef.current });
      if (!response.success) throw new Error(response.message || 'Could not check property details.');
      if (requestId !== evaluationRequest.current) return null;
      setEvaluation(response.data);
      return response.data;
    } catch (caught) {
      if (requestId === evaluationRequest.current) setError(caught instanceof Error ? caught.message : 'Could not check property details.');
      return null;
    } finally {
      if (requestId === evaluationRequest.current) setLoading(false);
    }
  }, [featureKey, operationInputIdentity, operationKey, propertyId]);

  useEffect(() => { void evaluate(); }, [evaluate]);

  useEffect(() => {
    setSaving(false);
    setSuppressedRequirementId(null);
    readyVersion.current = null;
  }, [contextIdentity]);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 750);
    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    const readyKey = evaluation
      ? `${evaluation.featureKey}:${evaluation.operationKey}:${evaluation.policyVersion}:${evaluation.contextVersion}:${operationInputIdentity}`
      : null;
    if (!evaluation?.canExecute || !readyKey || readyVersion.current === readyKey) return;
    readyVersion.current = readyKey;
    void Promise.resolve(onReady?.(evaluation)).catch(() => {
      setError('Property details are ready, but this feature could not resume. Try again.');
    });
  }, [evaluation, onReady, operationInputIdentity]);

  const capture = useCallback(async (value: unknown) => {
    const requirement = evaluation?.requirements[0];
    if (!evaluation || !requirement || requirement.capture.actionKey === 'PERMISSION_REQUIRED') return;
    setSaving(true);
    setError(null);
    const captureIdentity = activeIdentity.current;
    try {
      const response = await api.captureFeatureContext(propertyId, {
        requirementId: requirement.requirementId,
        captureKey: requirement.capture.captureKey,
        featureKey,
        operationKey,
        operationInput,
        expectedContextVersion: evaluation.contextVersion,
        idempotencyKey: crypto.randomUUID(),
        answer: requirement.capture.mode === 'STRUCTURED' || requirement.capture.mode === 'RELATIONAL'
          ? value as Record<string, unknown>
          : { value },
      });
      if (!response.success) throw new Error(response.message || 'Could not save this detail.');
      if (captureIdentity !== activeIdentity.current) return;
      setEvaluation(response.data.evaluation);
      const containsUnknown = containsUnknownAnswer(value);
      setSuppressedRequirementId(
        containsUnknown && response.data.evaluation.requirements[0]?.requirementId === requirement.requirementId
          ? requirement.requirementId
          : null,
      );
      window.dispatchEvent(new CustomEvent('property-context:updated', {
        detail: { propertyId, contextVersion: response.data.contextVersion, updatedFactKeys: response.data.updatedFactKeys },
      }));
      try {
        await onCaptured?.(response.data);
      } catch {
        setError('The detail was saved, but this result could not refresh. Retry the context check.');
      }
    } catch (caught) {
      if (captureIdentity === activeIdentity.current) setError(caught instanceof Error ? caught.message : 'Could not save this detail.');
    } finally {
      if (captureIdentity === activeIdentity.current) setSaving(false);
    }
  }, [evaluation, featureKey, onCaptured, operationInput, operationKey, propertyId]);

  return { evaluation, loading, slow, saving, error, capture, reevaluate: evaluate, suppressedRequirementId };
}
