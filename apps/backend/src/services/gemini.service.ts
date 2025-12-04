// apps/backend/src/services/gemini.service.ts

import { GoogleGenAI, Chat, Content } from "@google/genai";
import * as dotenv from 'dotenv';

// [FIXED IMPORT] Import the necessary function and interface (PropertyAIGuidance) directly
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
      // This is a known point of failure if the key is not configured in the deployed environment.
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Helper to serialize key property facts into a concise string, now including Risk Score, Maintenance, and Renewals.
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

    // === START FIX: ADDED RISK ASSESSMENT CONTEXT ===
    if (property.riskReport) {
        contextLines.push('--- Risk Assessment Summary ---');
        // NOTE: financialExposureTotal is a Prisma.Decimal, convert to string/number
        const exposure = (property.riskReport.financialExposureTotal as any)?.toString() || '0';
        
        contextLines.push(`Risk Score: ${property.riskReport.riskScore} (0-100)`);
        contextLines.push(`Total Financial Exposure: $${exposure}`);
        contextLines.push(`Last Calculated: ${new Date(property.riskReport.lastCalculatedAt).toLocaleDateString()}`);
        
        // Deserialize and summarize top risky assets
        const assetDetails = property.riskReport.details as any[] | undefined;
        if (assetDetails && Array.isArray(assetDetails) && assetDetails.length > 0) {
            
            // Sort to focus on the highest risk assets first (Risk Dollar)
            const sortedAssets = assetDetails
                .filter(asset => asset.riskLevel !== 'LOW')
                .sort((a, b) => (b.riskDollar || 0) - (a.riskDollar || 0))
                .slice(0, 5); // Take top 5 non-low risk items

            if (sortedAssets.length > 0) {
                contextLines.push('High Risk Assets:');
                sortedAssets.forEach(asset => {
                    contextLines.push(
                        `- ${asset.assetName}: Level ${asset.riskLevel}, Exposure $${Math.round(asset.riskDollar)}, Age ${asset.age} yrs (Life ${asset.expectedLife} yrs). Action: ${asset.actionCta || 'None'}`
                    );
                });
            } else {
                contextLines.push('All assessed assets are currently LOW risk.');
            }
        } else {
            contextLines.push('Risk detail data is unavailable or empty.');
        }
    } else {
        contextLines.push('Risk Report is unavailable for this property.');
    }
    // === END FIX: ADDED RISK ASSESSMENT CONTEXT ===

    // === START FIX: RESTORED MAINTENANCE AND RENEWAL CONTEXT ===
    // This resolves the compilation errors and ensures the AI has this context.

    // Maintenance Context
    contextLines.push('--- Maintenance Summary ---');
    if (property.maintenanceTasks && property.maintenanceTasks.length > 0) {
      const now = new Date();
      const pendingCount = property.maintenanceTasks.filter(t => t.status === 'PENDING').length;
      const overdueCount = property.maintenanceTasks.filter(t => 
        t.status === 'PENDING' && t.nextDueDate && new Date(t.nextDueDate) < now
      ).length;

      if (overdueCount > 0) {
        contextLines.push(`CRITICAL: You have ${overdueCount} overdue maintenance tasks.`);
      }
      contextLines.push(`Total pending maintenance tasks: ${pendingCount}.`);
    } else {
      contextLines.push('No maintenance tasks configured.');
    }

    // Renewal Context
    contextLines.push('--- Renewal Summary ---');
    if (property.renewals && property.renewals.length > 0) {
      const nextRenewal = property.renewals.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())[0];
      contextLines.push(`Next renewal is on ${new Date(nextRenewal.expiryDate).toLocaleDateString()}. Type: ${nextRenewal.type}.`);
      contextLines.push(`Total upcoming renewals: ${property.renewals.length}.`);
    } else {
      contextLines.push('No upcoming insurance or warranty renewals recorded.');
    }
    // === END FIX: RESTORED MAINTENANCE AND RENEWAL CONTEXT ===

    // Rejoin the context lines with semicolons for a clean string
    return contextLines.join('; ');
  }

  /**
   * Retrieves or creates a new chat session, optionally injecting property context.
   */
  private getOrCreateChat(sessionId: string, propertyContext?: string): Chat { 
    if (chatSessions.has(sessionId)) {
      return chatSessions.get(sessionId)!;
    }

    // CRITICAL FIX: Explicitly define the inverse scoring mechanism.
    let instruction = "You are a helpful AI assistant for a home management platform. Your purpose is to answer homeowner and property-related questions, and help plan maintenance. Be concise, friendly, and professional. **IMPORTANT: The Risk Score in this system is INVERSE: 100 means BEST (minimum risk), and 0 means WORST (maximum risk).**";

    // Augment system instruction if context is provided
    if (propertyContext) {
        // Updated instruction to guide AI on using the now-present risk data
        instruction = `You are an expert AI assistant providing advice for the user's specific property. The following are key facts about the property: [${propertyContext}]. Use this context to personalize your advice, especially on property risk and maintenance. **REMINDER: The Risk Score is inverse (100=BEST, 0=WORST).** If a specific detail is missing from the facts, state that you do not have that specific detail for the property.`;
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
   */
  public async sendMessageToChat(
    userId: string, 
    sessionId: string, 
    message: string, 
    propertyId?: string 
  ): Promise<string> {
    
    let propertyContext: string | undefined;

    if (propertyId) {
        // Fetch and authenticate the property (Database operation)
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
      throw new Error("Failed to get response from AI service.");
    }
  }
}

export const geminiService = new GeminiService();