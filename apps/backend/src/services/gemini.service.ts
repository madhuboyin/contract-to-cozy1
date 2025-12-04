// apps/backend/src/services/gemini.service.ts

import { GoogleGenAI, Chat, Content } from "@google/genai";
import * as dotenv from 'dotenv';
// [FIX] Import the necessary function and interface (PropertyAIGuidance) directly
import { getPropertyContextForAI, PropertyAIGuidance } from './property.service'; 

// Load environment variables
dotenv.config();

/**
 * A simple in-memory map to hold active chat sessions.
 * In a production environment, this should be a persistent store (e.g., Redis)
 * to prevent session loss on service restarts.
 */
const chatSessions = new Map<string, Chat>();

class GeminiService {
  private ai: GoogleGenAI;
  private model: string = "gemini-2.5-flash"; // A fast and capable model for chat

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }
    this.ai = new GoogleGenAI({ apiKey });
    // [FIX] Removed initialization of PropertyService as it's not a class export
  }

  /**
   * [NEW METHOD] Helper to serialize key property facts into a concise string.
   * @param property The PropertyAIGuidance object containing key facts.
   */
  private getPropertyContext(property: PropertyAIGuidance): string { // [MODIFICATION] Use imported interface
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
   * Retrieves or creates a new chat session for a given user ID.
   * @param sessionId A unique identifier for the user's chat session.
   * @param propertyContext Optional serialized property data for system instruction.
   * @returns The existing or new Chat object.
   */
  private getOrCreateChat(sessionId: string, propertyContext?: string): Chat {
    if (chatSessions.has(sessionId)) {
      return chatSessions.get(sessionId)!;
    }

    let instruction = "You are a helpful AI assistant for a home management platform. Your purpose is to answer homeowner and property-related questions, and help plan maintenance. Be concise, friendly, and professional.";

    // [MODIFICATION] Augment system instruction if context is provided
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
   * Sends a message to the Gemini model and returns the response.
   * @param userId The ID of the authenticated user (for security/lookup).
   * @param sessionId The unique ID for the chat session.
   * @param message The user's text message.
   * @param propertyId The optional ID of the property to fetch context for.
   * @returns The model's response text.
   */
  public async sendMessageToChat(
    userId: string, 
    sessionId: string, 
    message: string, 
    propertyId?: string 
  ): Promise<string> {
    
    let propertyContext: string | undefined;

    if (propertyId) {
        // [FIX] Call the imported function directly
        const property = await getPropertyContextForAI(propertyId, userId);

        if (!property) {
            // Critical security and data validation check
            console.warn(`User ${userId} attempted to access missing or unauthorized property ${propertyId} for chat context.`);
            throw new Error("Property data does not exist or access is unauthorized.");
        }

        // [MODIFICATION] Generate context string
        propertyContext = this.getPropertyContext(property);
    }

    try {
      // [MODIFICATION] Pass the generated property context to the session creator
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
      throw new Error("Failed to get response from AI service.");
    }
  }
}

export const geminiService = new GeminiService();