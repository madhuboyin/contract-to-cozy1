// apps/backend/src/services/gemini.service.ts

import { GoogleGenAI, Chat, Content } from "@google/genai";
import * as dotenv from 'dotenv';

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
  }

  /**
   * Retrieves or creates a new chat session for a given user ID.
   * @param sessionId A unique identifier for the user's chat session.
   * @returns The existing or new Chat object.
   */
  private getOrCreateChat(sessionId: string): Chat {
    if (chatSessions.has(sessionId)) {
      return chatSessions.get(sessionId)!;
    }

    // Set a system instruction to ground the AI in the domain of the application (home management/real estate)
    const chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: "You are a helpful AI assistant for a home management platform. Your purpose is to answer homeowner and property-related questions, and help plan maintenance. Be concise, friendly, and professional.",
      }
    });

    chatSessions.set(sessionId, chat);
    console.log(`New chat session created for: ${sessionId}`);
    return chat;
  }

  /**
   * Sends a message to the Gemini model and returns the response.
   * @param sessionId The unique ID for the chat session.
   * @param message The user's text message.
   * @returns The model's response text.
   */
  public async sendMessageToChat(sessionId: string, message: string): Promise<string> {
    try {
      const chat = this.getOrCreateChat(sessionId);
      
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