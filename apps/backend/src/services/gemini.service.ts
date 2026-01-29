// apps/backend/src/services/gemini.service.ts

import { GoogleGenAI, Chat, Content } from "@google/genai";
import * as dotenv from 'dotenv';

// [FIXED IMPORT] Import the necessary function and interface (PropertyAIGuidance) directly
import { getPropertyContextForAI, PropertyAIGuidance } from './property.service'; 
// [NEW IMPORT] Import AI constants
import { 
  LLM_MODEL_CONFIG, 
  GEMINI_BASE_INSTRUCTION, 
  GEMINI_CONTEXT_INSTRUCTION_TEMPLATE 
} from '../config/ai-constants';
// Load environment variables
dotenv.config();

/**
 * A simple in-memory map to hold active chat sessions.
 */
const chatSessions = new Map<string, Chat>();

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

  private getPropertyContext(property: PropertyAIGuidance): string {
    const contextLines: string[] = [];
  
    // PROPERTY BASICS
    contextLines.push('=== PROPERTY OVERVIEW ===');
    contextLines.push(`Address: ${property.address}, ${property.city}, ${property.state} ${property.zipCode}`);
    if (property.propertyType) contextLines.push(`Type: ${property.propertyType}`);
    if (property.yearBuilt) contextLines.push(`Built: ${property.yearBuilt}`);
    if (property.heatingType) contextLines.push(`Heating: ${property.heatingType}`);
    if (property.coolingType) contextLines.push(`Cooling: ${property.coolingType}`);
    if (property.hvacInstallYear) contextLines.push(`HVAC Installed: ${property.hvacInstallYear}`);
    if (property.roofType) contextLines.push(`Roof Type: ${property.roofType}`);
  
    // RISK ASSESSMENT
    if (property.riskReport) {
      contextLines.push('=== RISK ASSESSMENT ===');
      const exposure = (property.riskReport.financialExposureTotal as any)?.toString() || '0';
      contextLines.push(`Risk Score: ${property.riskReport.riskScore}/100 (100=lowest risk)`);
      contextLines.push(`Financial Exposure: $${exposure}`);
      
      const assetDetails = property.riskReport.details as any[] | undefined;
      if (assetDetails && Array.isArray(assetDetails) && assetDetails.length > 0) {
        const highRisk = assetDetails.filter(a => a.riskLevel !== 'LOW').slice(0, 5);
        if (highRisk.length > 0) {
          contextLines.push('High Risk Items:');
          highRisk.forEach(asset => {
            contextLines.push(`- ${asset.assetName}: ${asset.riskLevel}, $${Math.round(asset.riskDollar)} exposure`);
          });
        }
      }
    }
  
    // INVENTORY ROOMS
    if (property.inventoryRooms && property.inventoryRooms.length > 0) {
      contextLines.push('=== ROOMS ===');
      property.inventoryRooms.forEach(room => {
        contextLines.push(`- ${room.name} (${room.type}): ${room.itemCount} items`);
      });
    }
  
    // INVENTORY ITEMS - grouped by room
    if (property.inventoryItems && property.inventoryItems.length > 0) {
      contextLines.push('=== INVENTORY ITEMS ===');
      
      const byRoom = new Map<string, typeof property.inventoryItems>();
      property.inventoryItems.forEach(item => {
        const roomKey = item.roomName || 'Unassigned';
        if (!byRoom.has(roomKey)) byRoom.set(roomKey, []);
        byRoom.get(roomKey)!.push(item);
      });
  
      byRoom.forEach((items, roomName) => {
        contextLines.push(`[${roomName}]`);
        items.forEach(item => {
          let itemDesc = `- ${item.name}`;
          if (item.brand) itemDesc += ` (${item.brand}`;
          if (item.model) itemDesc += ` ${item.model}`;
          if (item.brand) itemDesc += ')';
          if (item.category) itemDesc += ` [${item.category}]`;
          // FIXED: Convert cents to dollars for display
          if (item.replacementCostCents) {
            itemDesc += ` Value: $${(item.replacementCostCents / 100).toFixed(2)}`;
          }
          contextLines.push(itemDesc);
        });
      });
    }
  
    // HOME ASSETS / APPLIANCES
    if (property.homeAssets && property.homeAssets.length > 0) {
      contextLines.push('=== MAJOR APPLIANCES ===');
      property.homeAssets.forEach(asset => {
        let assetDesc = `- ${asset.assetType.replace(/_/g, ' ')}`;
        if (asset.installationYear) assetDesc += ` (installed ${asset.installationYear})`;
        contextLines.push(assetDesc);
      });
    }
  
    // DOCUMENTS
    if (property.documents && property.documents.length > 0) {
      contextLines.push('=== DOCUMENTS ===');
      contextLines.push(`Total documents: ${property.documents.length}`);
      
      const byType = new Map<string, number>();
      property.documents.forEach(doc => {
        byType.set(doc.type, (byType.get(doc.type) || 0) + 1);
      });
      byType.forEach((count, type) => {
        contextLines.push(`- ${type}: ${count} documents`);
      });
    }
  
    // EXPENSES
    if (property.expenseSummary && property.expenseSummary.totalAmount > 0) {
      contextLines.push('=== EXPENSES (Last 12 months) ===');
      contextLines.push(`Total Spent: $${property.expenseSummary.totalAmount.toFixed(2)}`);
      
      Object.entries(property.expenseSummary.categoryBreakdown).forEach(([cat, amount]) => {
        contextLines.push(`- ${cat}: $${(amount as number).toFixed(2)}`);
      });
      
      if (property.expenses && property.expenses.length > 0) {
        contextLines.push('Recent expenses:');
        property.expenses.slice(0, 10).forEach(exp => {
          contextLines.push(`- ${exp.description}: $${exp.amount} (${exp.category})`);
        });
      }
    }
  
    // MAINTENANCE TASKS
    if (property.maintenanceTasks && property.maintenanceTasks.length > 0) {
      contextLines.push('=== MAINTENANCE TASKS ===');
      const now = new Date();
      const pending = property.maintenanceTasks.filter(t => t.status === 'PENDING');
      const overdue = pending.filter(t => t.nextDueDate && new Date(t.nextDueDate) < now);
      
      if (overdue.length > 0) {
        contextLines.push(`OVERDUE: ${overdue.length} tasks`);
        overdue.slice(0, 5).forEach(t => contextLines.push(`- ${t.title}`));
      }
      contextLines.push(`Pending: ${pending.length}, Completed: ${property.maintenanceTasks.filter(t => t.status === 'COMPLETED').length}`);
    }
  
    // SEASONAL TASKS
    if (property.seasonalTasks && property.seasonalTasks.length > 0) {
      contextLines.push('=== SEASONAL MAINTENANCE ===');
      const bySeason = new Map<string, typeof property.seasonalTasks>();
      property.seasonalTasks.forEach(task => {
        if (!bySeason.has(task.season)) bySeason.set(task.season, []);
        bySeason.get(task.season)!.push(task);
      });
  
      bySeason.forEach((tasks, season) => {
        const completed = tasks.filter(t => t.status === 'COMPLETED').length;
        contextLines.push(`${season}: ${completed}/${tasks.length} completed`);
        tasks.filter(t => t.status !== 'COMPLETED' && t.priority === 'CRITICAL').forEach(t => {
          contextLines.push(`- CRITICAL: ${t.title}`);
        });
      });
    }
  
    // WARRANTIES & INSURANCE
    if (property.renewals && property.renewals.length > 0) {
      contextLines.push('=== WARRANTIES & INSURANCE ===');
      const sorted = property.renewals.sort((a, b) => 
        new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
      );
      sorted.slice(0, 10).forEach(r => {
        const expiry = new Date(r.expiryDate).toLocaleDateString();
        contextLines.push(`- ${r.type}: expires ${expiry}`);
      });
    }
  
    // SERVICE BOOKINGS
    if (property.bookings && property.bookings.length > 0) {
      contextLines.push('=== SERVICE HISTORY ===');
      const pending = property.bookings.filter(b => ['PENDING', 'CONFIRMED'].includes(b.status));
      const completed = property.bookings.filter(b => b.status === 'COMPLETED');
      
      if (pending.length > 0) {
        contextLines.push(`Upcoming: ${pending.length}`);
        pending.slice(0, 3).forEach(b => {
          contextLines.push(`- ${b.serviceName || b.category} (${b.status})`);
        });
      }
      contextLines.push(`Completed services: ${completed.length}`);
    }
  
    // CLAIMS
    if (property.claims && property.claims.length > 0) {
      contextLines.push('=== INSURANCE/WARRANTY CLAIMS ===');
      
      const activeClaims = property.claims.filter(c => !['CLOSED', 'DENIED'].includes(c.status));
      const closedClaims = property.claims.filter(c => ['CLOSED', 'DENIED'].includes(c.status));
      
      if (activeClaims.length > 0) {
        contextLines.push(`Active Claims: ${activeClaims.length}`);
        activeClaims.forEach(c => {
          let claimDesc = `- ${c.title} (${c.type}) - Status: ${c.status}`;
          if (c.providerName) claimDesc += ` with ${c.providerName}`;
          if (c.estimatedLossAmount) claimDesc += ` - Est. Loss: $${c.estimatedLossAmount}`;
          if (c.checklistCompletionPct) claimDesc += ` - ${c.checklistCompletionPct}% complete`;
          contextLines.push(claimDesc);
        });
      }
      
      if (closedClaims.length > 0) {
        contextLines.push(`Closed Claims: ${closedClaims.length}`);
        closedClaims.slice(0, 5).forEach(c => {
          let claimDesc = `- ${c.title} (${c.type}) - ${c.status}`;
          if (c.settlementAmount) claimDesc += ` - Settlement: $${c.settlementAmount}`;
          contextLines.push(claimDesc);
        });
      }
    }
  
    // INCIDENTS
    if (property.incidents && property.incidents.length > 0) {
      contextLines.push('=== INCIDENTS & ALERTS ===');
      
      const activeIncidents = property.incidents.filter(i => 
        ['DETECTED', 'EVALUATED', 'ACTIVE', 'ACTIONED'].includes(i.status)
      );
      const resolvedIncidents = property.incidents.filter(i => 
        ['RESOLVED', 'MITIGATED'].includes(i.status)
      );
      
      if (activeIncidents.length > 0) {
        contextLines.push(`Active Incidents: ${activeIncidents.length}`);
        activeIncidents.forEach(i => {
          let incDesc = `- ${i.title}`;
          if (i.severity) incDesc += ` [${i.severity}]`;
          incDesc += ` - ${i.status}`;
          if (i.category) incDesc += ` (${i.category})`;
          if (i.summary) incDesc += `: ${i.summary}`;
          contextLines.push(incDesc);
        });
      }
      
      contextLines.push(`Resolved Incidents: ${resolvedIncidents.length}`);
    }
  
    // RECALL ALERTS
    if (property.recallMatches && property.recallMatches.length > 0) {
      contextLines.push('=== SAFETY RECALLS ===');
      
      const openRecalls = property.recallMatches.filter(r => r.status === 'OPEN');
      const needsConfirmation = property.recallMatches.filter(r => r.status === 'NEEDS_CONFIRMATION');
      const resolved = property.recallMatches.filter(r => r.status === 'RESOLVED');
      
      if (openRecalls.length > 0) {
        contextLines.push(`ACTIVE RECALLS: ${openRecalls.length}`);
        openRecalls.forEach(r => {
          let recallDesc = `- ${r.itemName || 'Unknown Item'}`;
          // FIXED: Use recallSeverity from the recall relation
          if (r.recallSeverity) recallDesc += ` [${r.recallSeverity}]`;
          if (r.recallTitle) recallDesc += `: ${r.recallTitle}`;
          if (r.hazard) recallDesc += ` - Hazard: ${r.hazard}`;
          if (r.remedy) recallDesc += ` - Remedy: ${r.remedy}`;
          contextLines.push(recallDesc);
        });
      }
      
      if (needsConfirmation.length > 0) {
        contextLines.push(`Potential Recalls (needs confirmation): ${needsConfirmation.length}`);
      }
      
      contextLines.push(`Resolved Recalls: ${resolved.length}`);
    }
  
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