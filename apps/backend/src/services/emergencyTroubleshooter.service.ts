// apps/backend/src/services/emergencyTroubleshooter.service.ts
import { GoogleGenAI } from "@google/genai";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

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
    propertyContext?: string
  ): Promise<EmergencyResponse> {
    console.log(`[EMERGENCY-CHAT] Processing ${messages.length} messages | Property Context: ${!!propertyContext}`);
    
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
        model: "gemini-2.0-flash-exp",
        contents: conversationHistory,
        config: {
          systemInstruction: EMERGENCY_SYSTEM_PROMPT,
          maxOutputTokens: 500,
          temperature: 0.3,
        }
      });

      const text = response.text;
      if (!text) {
        console.error(`[EMERGENCY-ERROR] Gemini returned empty response`);
        throw new Error('AI service returned an empty response');
      }
      
      const severity = this.extractSeverity(text);
      const resolution = this.extractResolution(text);
      const steps = resolution === 'DIY' ? this.extractSteps(text) : undefined;

      console.log(`[EMERGENCY-RESPONSE] Severity: ${severity} | Resolution: ${resolution || 'N/A'}`);

      return {
        severity,
        message: text,
        resolution,
        steps
      };
    } catch (error) {
      console.error(`[EMERGENCY-FATAL] Failed to call Gemini API`, error);
      throw new Error('Failed to get emergency response');
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
}

export const emergencyService = new EmergencyTroubleshooterService();