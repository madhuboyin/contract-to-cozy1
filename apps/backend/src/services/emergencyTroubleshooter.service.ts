// apps/backend/src/services/emergencyTroubleshooter.service.ts
import { GoogleGenAI } from "@google/genai";

interface EmergencyResponse {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  resolution?: 'DIY' | 'CALL_PRO' | 'IMMEDIATE_DANGER';
  steps?: string[];
}

const EMERGENCY_SYSTEM_PROMPT = `You are an emergency home troubleshooting assistant. 

CRITICAL SAFETY RULES:
- Gas smell = "EVACUATE immediately and call gas company from outside"
- Electrical sparking = "Turn off main breaker and call electrician"
- Major water leak = "Shut off main water valve and call plumber"
- Sewage backup = "Do not use plumbing and call professional"
- Never suggest DIY for: gas lines, electrical panels, structural issues

Your response format:
1. Assess severity: LOW, MEDIUM, HIGH, or CRITICAL
2. Provide clear guidance (2-3 sentences max)
3. Give resolution: DIY (with steps) OR CALL_PRO OR IMMEDIATE_DANGER

Be concise, clear, and prioritize safety above all else.`;

export class EmergencyTroubleshooterService {
  private ai: GoogleGenAI;
  private sessions = new Map<string, any>();

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async startEmergency(
    sessionId: string, 
    issue: string, 
    propertyContext?: string
  ): Promise<EmergencyResponse> {
    const contextPrompt = propertyContext 
      ? `Property: ${propertyContext}\n\nIssue: ${issue}`
      : `Issue: ${issue}`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{
          role: "user",
          parts: [{ text: contextPrompt }]
        }],
        config: {
          systemInstruction: EMERGENCY_SYSTEM_PROMPT,
          maxOutputTokens: 500, // Keep responses concise
          temperature: 0.3, // More deterministic for safety
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('AI service returned an empty response');
      }
      
      // Parse severity
      const severity = this.extractSeverity(text);
      const resolution = this.extractResolution(text);
      const steps = resolution === 'DIY' ? this.extractSteps(text) : undefined;

      // Store session for multi-turn if needed
      this.sessions.set(sessionId, {
        issue,
        severity,
        history: [{ role: 'user', content: issue }, { role: 'assistant', content: text }]
      });

      return {
        severity,
        message: text,
        resolution,
        steps
      };
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw new Error('Failed to get emergency response');
    }
  }

  async continueSession(
    sessionId: string, 
    userMessage: string
  ): Promise<EmergencyResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Add user message to history
    session.history.push({ role: 'user', content: userMessage });

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: session.history.map((msg: any) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })),
        config: {
          systemInstruction: EMERGENCY_SYSTEM_PROMPT,
          maxOutputTokens: 500,
          temperature: 0.3,
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('AI service returned an empty response');
      }
      session.history.push({ role: 'assistant', content: text });

      const resolution = this.extractResolution(text);
      const steps = resolution === 'DIY' ? this.extractSteps(text) : undefined;

      return {
        severity: session.severity,
        message: text,
        resolution,
        steps
      };
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw new Error('Failed to continue emergency session');
    }
  }

  private extractSeverity(text: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const lower = text.toLowerCase();
    if (lower.includes('critical') || lower.includes('evacuate') || lower.includes('danger')) {
      return 'CRITICAL';
    }
    if (lower.includes('high') || lower.includes('immediate') || lower.includes('urgent')) {
      return 'HIGH';
    }
    if (lower.includes('medium') || lower.includes('moderate')) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  private extractResolution(text: string): 'DIY' | 'CALL_PRO' | 'IMMEDIATE_DANGER' | undefined {
    const lower = text.toLowerCase();
    if (lower.includes('evacuate') || lower.includes('call 911') || lower.includes('emergency services')) {
      return 'IMMEDIATE_DANGER';
    }
    if (lower.includes('call professional') || lower.includes('call plumber') || 
        lower.includes('call electrician') || lower.includes('call hvac') ||
        lower.includes('hire a pro')) {
      return 'CALL_PRO';
    }
    if (lower.includes('you can fix') || lower.includes('diy') || 
        lower.includes('step 1') || lower.includes('here\'s how')) {
      return 'DIY';
    }
    return undefined;
  }

  private extractSteps(text: string): string[] {
    const steps: string[] = [];
    
    // Match numbered steps like "1.", "Step 1:", etc.
    const stepMatches = text.match(/(?:Step )?\d+[.:]\s*(.+?)(?=(?:Step )?\d+[.:]|$)/gs);
    
    if (stepMatches) {
      stepMatches.forEach(match => {
        const cleanStep = match.replace(/(?:Step )?\d+[.:]\s*/, '').trim();
        if (cleanStep) steps.push(cleanStep);
      });
    }
    
    return steps.length > 0 ? steps : [];
  }

  // Clear old sessions (call periodically)
  clearOldSessions(maxAgeMs: number = 3600000) { // 1 hour default
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.createdAt > maxAgeMs) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

export const emergencyService = new EmergencyTroubleshooterService();