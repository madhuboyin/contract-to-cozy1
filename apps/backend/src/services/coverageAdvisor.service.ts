import { geminiService } from './gemini.service';
import { logger } from '../lib/logger';

export type CoverageAdviceContext = {
  propertyId: string;
  overallVerdict: string;
  insuranceVerdict: string;
  warrantyVerdict: string;
  gapCount: number;
  totalExposedValue: number;
  openClaimsCount: number;
  nextRenewalDays?: number | null;
  topRiskItemName?: string | null;
};

export class CoverageAdvisorService {
  /**
   * Generates a strategic AI "Protection Take" for the Coverage Overview.
   */
  async generateStrategicAdvice(context: CoverageAdviceContext): Promise<string | null> {
    const { 
      overallVerdict, 
      insuranceVerdict, 
      warrantyVerdict, 
      gapCount, 
      totalExposedValue, 
      openClaimsCount, 
      nextRenewalDays,
      topRiskItemName
    } = context;

    const prompt = `
      You are a strategic home protection advisor for the platform "Contract to Cozy". 
      Provide a concise, 1-2 sentence "Strategic Take" on the homeowner's coverage status.

      Current Data:
      - Overall Coverage Health: ${overallVerdict}
      - Insurance Status: ${insuranceVerdict}
      - Warranty Status: ${warrantyVerdict}
      - Coverage Gaps: ${gapCount} items (Total exposed value: $${totalExposedValue})
      - Active Claims: ${openClaimsCount}
      ${nextRenewalDays ? `- Next Renewal: in ${nextRenewalDays} days` : ''}
      ${topRiskItemName ? `- Highest Risk Asset: ${topRiskItemName}` : ''}

      Guidelines:
      1. Be professional, direct, and slightly risk-aware.
      2. If there are gaps, prioritize closing them, especially for the "${topRiskItemName || 'high-value assets'}".
      3. If there are active claims, reassure the user about the next steps.
      4. If coverage is good, focus on optimization or renewal readiness.
      5. Keep it under 220 characters.
      6. No jargon or placeholders.

      Example: "Your protection is Fair, but the $2,500 gap on your HVAC is a major risk. Closing this now with a targeted warranty prevents a total loss during the summer peak."
    `;

    try {
      const sessionId = `coverage-advice-${context.propertyId}`;
      const advice = await geminiService.sendMessageToChat(
        'SYSTEM',
        sessionId,
        prompt,
        context.propertyId
      );

      return advice.trim();
    } catch (error) {
      logger.warn({ err: error, propertyId: context.propertyId }, '[COVERAGE-ADVISOR] Failed to generate AI advice');
      return null;
    }
  }
}

export const coverageAdvisorService = new CoverageAdvisorService();
