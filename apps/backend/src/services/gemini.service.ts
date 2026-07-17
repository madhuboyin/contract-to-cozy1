// apps/backend/src/services/gemini.service.ts

import { GoogleGenAI, Chat } from "@google/genai";
import * as dotenv from 'dotenv';

import { getAggregationPropertyContext } from './aggregationContext/context';
// [NEW IMPORT] Import AI constants
import { 
  LLM_MODEL_CONFIG, 
  GEMINI_BASE_INSTRUCTION, 
  GEMINI_CONTEXT_INSTRUCTION_TEMPLATE 
} from '../config/ai-constants';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { AICircuitBreaker, AICircuitOpenError, AITimeoutError, withTimeout } from '../lib/aiResilience';
// Load environment variables
dotenv.config();

/**
 * A simple in-memory map to hold active chat sessions.
 */
const chatSessions = new Map<string, Chat>();

const DEFAULT_AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 10_000);
const GEMINI_CHAT_TIMEOUT_MS = Number(process.env.GEMINI_CHAT_TIMEOUT_MS || DEFAULT_AI_TIMEOUT_MS);
const AI_CIRCUIT_FAILURE_THRESHOLD = Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD || 3);
const AI_CIRCUIT_OPEN_MS = Number(process.env.AI_CIRCUIT_OPEN_MS || 30_000);
const geminiChatCircuit = new AICircuitBreaker('gemini-chat', {
  failureThreshold: AI_CIRCUIT_FAILURE_THRESHOLD,
  openMs: AI_CIRCUIT_OPEN_MS,
});

class GeminiService {
  private ai: GoogleGenAI;
  private model: string = LLM_MODEL_CONFIG.DEFAULT_MODEL;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // This is a known point of failure if the key is not configured in the deployed environment.
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Retrieves or creates a new chat session, optionally injecting property context.
   */
  private getOrCreateChat(sessionId: string, propertyContext?: string): Chat { 
    if (chatSessions.has(sessionId)) {
      return chatSessions.get(sessionId)!;
    }

    // CRITICAL FIX: Explicitly define the inverse scoring mechanism.
    //let instruction = "You are a helpful AI assistant for a home management platform. Your purpose is to answer homeowner and property-related questions, and help plan maintenance. Be concise, friendly, and professional. **IMPORTANT: The Risk Score in this system is INVERSE: 100 means BEST (minimum risk), and 0 means WORST (maximum risk).**";
    let instruction = GEMINI_BASE_INSTRUCTION;
    // Augment system instruction if context is provided
    if (propertyContext) {
        // Updated instruction to guide AI on using the now-present risk data
        instruction = GEMINI_CONTEXT_INSTRUCTION_TEMPLATE(propertyContext);
        //instruction = `You are an expert AI assistant providing advice for the user's specific property. The following are key facts about the property: [${propertyContext}]. Use this context to personalize your advice, especially on property risk and maintenance. **REMINDER: The Risk Score is inverse (100=BEST, 0=WORST).** If a specific detail is missing from the facts, state that you do not have that specific detail for the property.`;
    }

    const chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: instruction,
      }
    });

    chatSessions.set(sessionId, chat);
    logger.info(`New chat session created for: ${sessionId}. Personalized: ${!!propertyContext}`);
    return chat;
  }

  /**
   * Sends a message to the Gemini model and returns the response.
   */
  public async sendMessageToChat(
    userId: string, 
    sessionId: string, 
    message: string, 
    propertyId?: string 
  ): Promise<string> {
    
    let propertyContext: string | undefined;

    if (propertyId) {
        const context = await getAggregationPropertyContext(propertyId, userId, 'SEARCH_ASSISTANT');
        const usedFacts: string[] = [];
        const missingFacts: string[] = [];
        const boundedFacts: Record<string, unknown> = {};
        for (const [key, fact] of Object.entries(context.facts)) {
          if (fact.state === 'KNOWN') {
            usedFacts.push(key);
            boundedFacts[key] = fact.value;
          } else {
            missingFacts.push(key);
          }
        }
        propertyContext = JSON.stringify({
          contextVersion: context.contextVersion,
          boundedFacts,
          usedFacts,
          missingFacts,
          instruction: 'Use only these facts. Treat missing facts as unknown and do not infer optional household details.',
        });
    }

    try {
      // Pass the generated property context to the session creator
      const chat = this.getOrCreateChat(sessionId, propertyContext);

      const response = await geminiChatCircuit.execute(async () =>
        withTimeout(
          async () =>
            chat.sendMessage({
              message,
            }),
          {
            timeoutMs: GEMINI_CHAT_TIMEOUT_MS,
            operation: 'gemini_chat_send_message',
          }
        )
      );

      if (!response.text) {
        throw new APIError('AI service returned an empty response.', 502, 'AI_EMPTY_RESPONSE');
      }

      return response.text;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      if (error instanceof AITimeoutError) {
        throw new APIError('AI request timed out. Please try again.', 504, 'AI_TIMEOUT');
      }
      if (error instanceof AICircuitOpenError) {
        throw new APIError(
          'AI assistant is temporarily unavailable due to upstream failures. Please retry shortly.',
          503,
          'AI_CIRCUIT_OPEN',
          { retryAfterMs: error.retryAfterMs }
        );
      }

      logger.error({ err: error }, "Gemini API call error");
      throw new APIError('Failed to get response from AI service.', 502, 'AI_UPSTREAM_ERROR');
    }
  }
}

export const geminiService = new GeminiService();
