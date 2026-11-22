import { geminiService } from '../gemini.service';
import { logger } from '../../lib/logger';
import { GuidanceIssueDomain } from './guidanceTypes';
import { readGuidanceAdvisorControls } from '../../config/guidanceAdvisorControls';
import { buildGuidanceAdvicePrompt, serializeGuidanceAdvicePayload } from './guidanceAdvisorPayload';

export type GuidanceAdviceContext = {
  propertyId: string;
  userId: string;
  journeyId: string;
  issueDomain: GuidanceIssueDomain;
  signalIntentFamily?: string | null;
  assetName?: string | null;
  symptom?: string | null;
  currentStepLabel?: string | null;
  priorityBucket?: string | null;
  costOfDelay?: number | null;
  coverageImpact?: string | null;
};

export class GuidanceAdvisorService {
  /**
   * Generates a one-to-two sentence "Strategic Take" for a guidance journey.
   *
   * Owner decision 2026-11-22: this is a feature-specific provider flow (GUIDANCE_ADVISOR_STRATEGIC_TAKE in the provider-boundary register),
   * off by default, with its own flag, kill switch, provider-terms and property-data approvals. It is never enabled by an Ask provider
   * approval. When it is off, or the provider fails, it returns null and the authored/deterministic Guidance Engine output is unchanged.
   */
  async generateStrategicAdvice(context: GuidanceAdviceContext): Promise<string | null> {
    const controls = readGuidanceAdvisorControls();
    if (!controls.enabled) return null;

    // Only the allowlisted, minimised fields are serialised: no user, property or journey identifier and no home-record facts.
    const prompt = buildGuidanceAdvicePrompt(serializeGuidanceAdvicePayload(context));
    try {
      const advice = await geminiService.generateGuidanceAdvice(prompt);
      return advice.trim() || null;
    } catch (error) {
      // Failure fallback: no advice. The journey overview does not depend on it.
      logger.warn({ err: error, journeyId: context.journeyId }, '[GUIDANCE-ADVISOR] Failed to generate AI advice');
      return null;
    }
  }
}

export const guidanceAdvisorService = new GuidanceAdvisorService();
