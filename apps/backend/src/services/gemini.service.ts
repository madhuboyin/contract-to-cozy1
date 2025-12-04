// apps/backend/src/services/gemini.service.ts

import { GoogleGenAI, Chat, Content } from "@google/genai";
import * as dotenv from 'dotenv';

// [RE-FIX] Import the necessary function and interface (PropertyAIGuidance) directly
import { getPropertyContextForAI, PropertyAIGuidance } from './property.service'; 

// Load environment variables
dotenv.config();

/**
 * A simple in-memory map to hold active chat sessions.
 */
const chatSessions = new Map<string, Chat>();

class GeminiService {
  private ai: GoogleGenAI;
  private model: string = "gemini-2.5-flash"; 

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Throwing this error is the correct way to fail fast if the key is missing.
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * [RE-IMPLEMENTATION] Helper to serialize key property facts into a concise string.
   */
  private getPropertyContext(property: PropertyAIGuidance): string {
    const contextLines: string[] = [];

    // Address details
    contextLines.push(`Address: ${property.address}, ${property.city}, ${property.state} ${property.zipCode}`);

    // Core facts
    if (property.propertyType) contextLines.push(`Type: ${property.propertyType}`);
    if (property.yearBuilt) contextLines.push(`Built: ${property.yearBuilt}`);

    // System details (HVAC, Roof)
    if (property.heatingType) contextLines.push(`Heating: ${property.heatingType}`);
    if (property.coolingType) contextLines.push(`Cooling: ${property.coolingType}`);
    if (property.hvacInstallYear) contextLines.push(`HVAC Installed: ${property.hvacInstallYear}`);
    if (property.roofType) contextLines.push(`Roof Type: ${property.roofType}`);

    return contextLines.join('; ');
  }


  /**
   * [RE-IMPLEMENTATION] Retrieves or creates a new chat session, optionally injecting property context.
   */
  private getOrCreateChat(sessionId: string, propertyContext?: string): Chat { 
    if (chatSessions.has(sessionId)) {
      return chatSessions.get(sessionId)!;
    }

    let instruction = "You are a helpful AI assistant for a home management platform. Your purpose is to answer homeowner and property-related questions, and help plan maintenance. Be concise, friendly, and professional.";

    // Augment system instruction if context is provided
    if (propertyContext) {
        instruction = `You are an expert AI assistant providing advice for the user's specific property. The following are key facts about the property: [${propertyContext}]. Use this context to personalize your advice. If a question is generic, try to connect it to the provided property facts. If a specific detail is missing from the facts, state that you do not have that specific detail for the property.`;
    }

    const chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: instruction,
      }
    });

    chatSessions.set(sessionId, chat);
    console.log(`New chat session created for: ${sessionId}. Personalized: ${!!propertyContext}`);
    return chat;
  }

  /**
   * [RE-IMPLEMENTATION] Sends a message to the Gemini model and returns the response.
   * Signature MUST match the one called by the controller (4 arguments).
   */
  public async sendMessageToChat(
    userId: string, // <-- CRITICAL: This argument was missing in the version you provided
    sessionId: string, 
    message: string, 
    propertyId?: string // <-- CRITICAL: This argument was missing in the version you provided
  ): Promise<string> {
    
    let propertyContext: string | undefined;

    if (propertyId) {
        // Fetch and authenticate the property
        const property = await getPropertyContextForAI(propertyId, userId);

        if (!property) {
            console.warn(`User ${userId} attempted to access missing or unauthorized property ${propertyId} for chat context.`);
            throw new Error("Property data does not exist or access is unauthorized.");
        }

        // Generate context string
        propertyContext = this.getPropertyContext(property);
    }

    try {
      // Pass the generated property context to the session creator
      const chat = this.getOrCreateChat(sessionId, propertyContext);
      
      const response = await chat.sendMessage({
        message: message,
      });

      if (!response.text) {
        throw new Error("AI service returned an empty response.");
      }

      return response.text;
    } catch (error) {
      console.error("Gemini API call error:", error);
      // If the error comes from the AI service (e.g., API key issue), 
      // the message below is correct. If it's the GEMINI_API_KEY check, 
      // the error will be thrown earlier.
      throw new Error("Failed to get response from AI service.");
    }
  }
}

export const geminiService = new GeminiService();