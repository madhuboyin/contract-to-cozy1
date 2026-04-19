// apps/backend/src/services/emergencyTroubleshooter.service.ts
import { GoogleGenAI } from "@google/genai";
import { IncidentSeverity, IncidentSourceType, IncidentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface EmergencyResponse {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  classification: string;
  message: string;
  resolution: 'DIY' | 'CALL_PRO' | 'IMMEDIATE_DANGER';
  steps: string[];
  confidence: number;
}

const EMERGENCY_SYSTEM_PROMPT = `You are an emergency home troubleshooting assistant. 

CRITICAL SAFETY RULES:
- Gas smell = "EVACUATE immediately and call gas company from outside"
- Electrical sparking = "Turn off main breaker and call electrician"
- Major water leak = "Shut off main water valve and call plumber"
- Sewage backup = "Do not use plumbing and call professional"
- Never suggest DIY for: gas lines, electrical panels, structural issues

Return ONLY valid JSON with this exact schema:
{
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "classification": "short category name",
  "message": "2-3 sentence guidance prioritizing safety",
  "resolution": "DIY|CALL_PRO|IMMEDIATE_DANGER",
  "steps": ["step 1", "step 2"],
  "confidence": 0.0
}

Rules:
- Use IMMEDIATE_DANGER for gas leak, electrical fire risk, structural collapse risk, or life-safety risk.
- If resolution is CALL_PRO or IMMEDIATE_DANGER, steps must still include safe immediate actions.
- confidence is 0.0-1.0.
- No markdown, no prose outside JSON.

Be concise, clear, and prioritize safety above all else.`;

type ChatContext = {
  userId?: string;
  propertyId?: string;
};

export class EmergencyTroubleshooterService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Stateless chat - accepts full conversation history
   */
  async chat(
    messages: Message[],
    propertyContext?: string,
    context?: ChatContext,
  ): Promise<EmergencyResponse> {
    logger.info(`[EMERGENCY-CHAT] Processing ${messages.length} messages | Property Context: ${!!propertyContext}`);
    
    if (!messages || messages.length === 0) {
      throw new Error('At least one message is required');
    }

    // Add property context to first user message if provided
    const conversationHistory = messages.map((msg, index) => {
      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
      
      if (index === 0 && msg.role === 'user' && propertyContext) {
        return {
          role: geminiRole,
          parts: [{ text: `Property: ${propertyContext}\n\nIssue: ${msg.content}` }]
        };
      }
      return {
        role: geminiRole,
        parts: [{ text: msg.content }]
      };
    });

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: conversationHistory,
        config: {
          systemInstruction: EMERGENCY_SYSTEM_PROMPT,
          maxOutputTokens: 500,
          temperature: 0.3,
        }
      });

      const text = response.text;
      if (!text) {
        logger.error(`[EMERGENCY-ERROR] Gemini returned empty response`);
        throw new Error('AI service returned an empty response');
      }

      const parsed = this.parseStructuredResponse(text);

      logger.info(`[EMERGENCY-RESPONSE] Severity: ${parsed.severity} | Resolution: ${parsed.resolution}`);

      await this.logIncidentIfPossible(messages, parsed, context);

      return {
        severity: parsed.severity,
        classification: parsed.classification,
        message: parsed.message,
        resolution: parsed.resolution,
        steps: parsed.steps,
        confidence: parsed.confidence,
      };
    } catch (error) {
      logger.error({ err: error }, `[EMERGENCY-FATAL] Failed to call Gemini API`);
      throw new Error('Failed to get emergency response');
    }
  }

  private parseStructuredResponse(text: string): EmergencyResponse {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const raw = this.extractFirstJsonObject(cleaned);

    if (!raw) {
      throw new Error('Emergency response schema parse failed');
    }

    const severity = String(raw.severity || '').toUpperCase();
    const resolution = String(raw.resolution || '').toUpperCase();
    const classification = String(raw.classification || '').trim();
    const message = String(raw.message || '').trim();
    const steps = Array.isArray(raw.steps)
      ? raw.steps.map((step: unknown) => String(step).trim()).filter(Boolean)
      : [];
    const confidence = Number(raw.confidence);

    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) {
      throw new Error('Emergency response missing valid severity');
    }
    if (!['DIY', 'CALL_PRO', 'IMMEDIATE_DANGER'].includes(resolution)) {
      throw new Error('Emergency response missing valid resolution');
    }
    if (!message) {
      throw new Error('Emergency response missing message');
    }
    if (!classification) {
      throw new Error('Emergency response missing classification');
    }

    return {
      severity: severity as EmergencyResponse['severity'],
      classification,
      message,
      resolution: resolution as EmergencyResponse['resolution'],
      steps,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    };
  }

  private extractFirstJsonObject(text: string): Record<string, unknown> | null {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end <= start) return null;
      const slice = text.slice(start, end + 1);
      try {
        return JSON.parse(slice) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }

  private mapIncidentSeverity(severity: EmergencyResponse['severity']): IncidentSeverity {
    if (severity === 'CRITICAL') return IncidentSeverity.CRITICAL;
    if (severity === 'HIGH' || severity === 'MEDIUM') return IncidentSeverity.WARNING;
    return IncidentSeverity.INFO;
  }

  private async logIncidentIfPossible(
    messages: Message[],
    response: EmergencyResponse,
    context?: ChatContext,
  ): Promise<void> {
    if (!context?.propertyId || !context?.userId) {
      return;
    }

    try {
      const latestUserMessage = [...messages].reverse().find((msg) => msg.role === 'user')?.content ?? 'Emergency request';
      const title = latestUserMessage.slice(0, 140);
      const fingerprint = `emergency:${context.propertyId}:${Buffer.from(title).toString('base64').slice(0, 24)}`;

      await prisma.incident.create({
        data: {
          propertyId: context.propertyId,
          userId: context.userId,
          sourceType: IncidentSourceType.MANUAL,
          typeKey: 'EMERGENCY_CHAT',
          category: 'EMERGENCY',
          title,
          summary: response.message.slice(0, 280),
          details: {
            classification: response.classification,
            resolution: response.resolution,
            steps: response.steps,
            confidence: response.confidence,
          } as any,
          status:
            response.severity === 'CRITICAL' || response.resolution === 'IMMEDIATE_DANGER'
              ? IncidentStatus.ACTIVE
              : IncidentStatus.EVALUATED,
          severity: this.mapIncidentSeverity(response.severity),
          confidence: Math.round(response.confidence * 100),
          fingerprint,
        },
      });
    } catch (error) {
      logger.error({ err: error }, '[EMERGENCY-INCIDENT-LOG] Failed to persist incident log');
    }
  }
}

export const emergencyService = new EmergencyTroubleshooterService();
