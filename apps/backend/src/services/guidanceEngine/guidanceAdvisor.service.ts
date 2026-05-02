import { geminiService } from '../gemini.service';
import { logger } from '../../lib/logger';
import { GuidanceIssueDomain } from './guidanceTypes';

export type GuidanceAdviceContext = {
  propertyId: string;
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
   * Generates personalized strategic advice for a guidance journey using Gemini AI.
   * This provides the "Top Class" AI insight that differentiates the platform.
   */
  async generateStrategicAdvice(context: GuidanceAdviceContext): Promise<string | null> {
    const { assetName, issueDomain, signalIntentFamily, symptom, currentStepLabel, priorityBucket, costOfDelay, coverageImpact } = context;

    const prompt = `
      You are a strategic home management advisor. Provide a concise, 1-2 sentence "Strategic Take" for a homeowner dealing with the following issue:
      - Asset: ${assetName || 'Home System'}
      - Issue Category: ${issueDomain}
      - Signal: ${signalIntentFamily || 'Detected Alert'}
      - Reported Symptom: ${symptom || 'Not specified'}
      - Current Step in Plan: ${currentStepLabel || 'Initial Review'}
      - Priority: ${priorityBucket || 'Standard'}
      ${costOfDelay ? `- Potential Cost of Delay: $${costOfDelay}` : ''}
      ${coverageImpact ? `- Coverage Status: ${coverageImpact}` : ''}

      Guidelines:
      1. Be professional, reassuring, and highly strategic.
      2. Focus on "Why this step matters" or "What to watch out for".
      3. Keep it under 200 characters.
      4. Do not use placeholders or technical jargon.
      5. Reference the specific asset and symptom if provided.

      Example: "Since your HVAC is nearing 15 years, verifying its service history now prevents a surprise $5,000 replacement during peak summer heat."
    `;

    try {
      // We use a dedicated session ID for guidance advice to keep it stateless or semi-persistent
      const sessionId = `guidance-advice-${context.journeyId}`;
      const advice = await geminiService.sendMessageToChat(
        'SYSTEM', // System actor
        sessionId,
        prompt,
        context.propertyId
      );

      return advice.trim();
    } catch (error) {
      logger.warn({ err: error, journeyId: context.journeyId }, '[GUIDANCE-ADVISOR] Failed to generate AI advice');
      return null;
    }
  }
}

export const guidanceAdvisorService = new GuidanceAdvisorService();
