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
import { minimizeAskQuestion, selectRelevantAskFacts } from './ask/askPromptMinimization';
import { executeGovernedAIRequest, resolveGovernedAIModel } from './ai/aiRequestGovernance.service';
// Load environment variables
dotenv.config();

/**
 * A simple in-memory map to hold active chat sessions.
 */
type ChatSessionEntry = { chat: Chat; lastUsedAt: number };
const chatSessions = new Map<string, ChatSessionEntry>();
const CHAT_SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_CHAT_SESSIONS = 500;

const DEFAULT_AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 10_000);
const GEMINI_CHAT_TIMEOUT_MS = Number(process.env.GEMINI_CHAT_TIMEOUT_MS || DEFAULT_AI_TIMEOUT_MS);
const AI_CIRCUIT_FAILURE_THRESHOLD = Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD || 3);
const AI_CIRCUIT_OPEN_MS = Number(process.env.AI_CIRCUIT_OPEN_MS || 30_000);
const geminiChatCircuit = new AICircuitBreaker('gemini-chat', {
  failureThreshold: AI_CIRCUIT_FAILURE_THRESHOLD,
  openMs: AI_CIRCUIT_OPEN_MS,
});

class GeminiService {
  private ai: GoogleGenAI | null = null;
  private model: string = LLM_MODEL_CONFIG.DEFAULT_MODEL;

  private getAI(): GoogleGenAI {
    if (this.ai) return this.ai;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new APIError('AI generation is not configured.', 503, 'AI_PROVIDER_NOT_CONFIGURED');
    }
    this.ai = new GoogleGenAI({ apiKey });
    return this.ai;
  }

  /**
   * Retrieves or creates a new chat session, optionally injecting property context.
   */
  private getOrCreateChat(sessionKey: string, propertyContext?: string): Chat {
    const now = Date.now();
    for (const [key, entry] of chatSessions) {
      if (now - entry.lastUsedAt > CHAT_SESSION_TTL_MS) chatSessions.delete(key);
    }
    const existing = chatSessions.get(sessionKey);
    if (existing) {
      existing.lastUsedAt = now;
      return existing.chat;
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

    const chat = this.getAI().chats.create({
      model: this.model,
      config: {
        systemInstruction: instruction,
      }
    });

    if (chatSessions.size >= MAX_CHAT_SESSIONS) {
      const oldest = [...chatSessions.entries()].sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)[0]?.[0];
      if (oldest) chatSessions.delete(oldest);
    }
    chatSessions.set(sessionKey, { chat, lastUsedAt: now });
    logger.info({ personalized: Boolean(propertyContext) }, 'New bounded chat session created');
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
    
    const minimizedQuestion = minimizeAskQuestion(message);
    let propertyContext: string | undefined;
    let contextVersion = 'GENERAL';

    if (propertyId) {
        const context = await getAggregationPropertyContext(propertyId, userId, 'SEARCH_ASSISTANT');
        const relevantFacts = selectRelevantAskFacts(minimizedQuestion, Object.values(context.facts));
        const usedFacts: string[] = [];
        const missingFacts: string[] = [];
        const boundedFacts: Record<string, unknown> = {};
        for (const fact of relevantFacts) {
          const key = fact.key;
          if (fact.state === 'KNOWN') {
            usedFacts.push(key);
            boundedFacts[key] = fact.value;
          } else {
            missingFacts.push(key);
          }
        }
        contextVersion = context.contextVersion;
        propertyContext = JSON.stringify({
          contextVersion: context.contextVersion,
          boundedFacts,
          usedFacts,
          missingFacts,
          instruction: 'Use only these facts. Treat missing facts as unknown and do not infer optional household details. Cite every property-specific factual statement with [fact:FACT_KEY] using an exact key from usedFacts.',
        });
    }

    try {
      // Property and context version are part of the key so changing the selected
      // property, user, or Living Home Record snapshot can never reuse stale context.
      const sessionKey = `${userId}:${sessionId}:${propertyId ?? 'GENERAL'}:${contextVersion}`;
      const chat = this.getOrCreateChat(sessionKey, propertyContext);

      const response = await geminiChatCircuit.execute(async () =>
        withTimeout(
          async () =>
            executeGovernedAIRequest({ routeId: 'ai:ask', model: this.model, work: () => chat.sendMessage({
              message: minimizedQuestion,
            }) }),
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

  public async selectAskRemoteFallbackTypedClaims(input: {
    purpose: 'ASK_COZY_REMOTE_FALLBACK_SYNTHESIS';
    question: string;
    candidates: readonly unknown[];
  }): Promise<unknown> {
    const model = resolveGovernedAIModel('FAST');
    const response = await geminiChatCircuit.execute(async () =>
      withTimeout(
        async () => executeGovernedAIRequest({
          routeId: 'ai:ask',
          model,
          structuredOutputRequired: true,
          structuredOutputConfigured: true,
          maxAttempts: 1,
          work: () => this.getAI().models.generateContent({
            model,
            contents: JSON.stringify({
              purpose: input.purpose,
              question: minimizeAskQuestion(input.question),
              instruction: 'Select only relevant entries from candidates. Copy claimType, factRefs, and comparisonOperator exactly. Return no prose and invent nothing.',
              candidates: input.candidates,
            }),
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'object',
                properties: {
                  claims: {
                    type: 'array',
                    maxItems: 6,
                    items: {
                      type: 'object',
                      properties: {
                        claimType: { type: 'string', enum: ['SEVERITY_STATEMENT', 'DEADLINE_STATEMENT', 'COST_COMPARISON'] },
                        factRefs: {
                          type: 'array', minItems: 1, maxItems: 2,
                          items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
                        },
                        comparisonOperator: { type: 'string', enum: ['GREATER_THAN', 'LESS_THAN', 'APPROXIMATELY_EQUAL'] },
                      },
                      required: ['claimType', 'factRefs'],
                    },
                  },
                },
                required: ['claims'],
              },
              temperature: 0,
              maxOutputTokens: 500,
            },
          }),
        }),
        { timeoutMs: GEMINI_CHAT_TIMEOUT_MS, operation: 'ask_remote_fallback_typed_claim_selection' },
      ),
    );
    if (!response.text) throw new APIError('AI typed-claim selection returned an empty response.', 502, 'AI_EMPTY_RESPONSE');
    return JSON.parse(response.text);
  }

  public async synthesizeAskResult(resultOnlyPayload: string): Promise<unknown> {
    const response = await geminiChatCircuit.execute(async () =>
      withTimeout(
        async () => {
          const model = resolveGovernedAIModel('FAST');
          return executeGovernedAIRequest({ routeId: 'ai:ask', model, structuredOutputRequired: true, structuredOutputConfigured: true, work: () => this.getAI().models.generateContent({
          model,
          contents: resultOnlyPayload,
          config: {
            systemInstruction: 'You format validated Contract to Cozy result data. Return JSON only. Never add facts, advice, numbers, dates, links, actions, or conclusions.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: { summary: { type: 'string' } },
              required: ['summary'],
              additionalProperties: false,
            },
            temperature: 0.1,
            maxOutputTokens: 220,
          },
        }) });
        },
        { timeoutMs: GEMINI_CHAT_TIMEOUT_MS, operation: 'ask_result_synthesis' },
      ),
    );
    if (!response.text) throw new APIError('AI result synthesis returned an empty response.', 502, 'AI_EMPTY_RESPONSE');
    return JSON.parse(response.text);
  }
}

export const geminiService = new GeminiService();
