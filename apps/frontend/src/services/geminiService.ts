// apps/frontend/src/services/geminiService.ts

import { GoogleGenAI } from "@google/genai";
import { UserType, ChatMessage } from '@/types'; 

// FIX: This structure prevents the Type 'string | undefined' error by isolating the creation.
const ai = (() => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (apiKey) {
    // TypeScript confirms apiKey is a string here, resolving the assignment error.
    return new GoogleGenAI({ apiKey }); 
  }
  return null;
})();


// Transform ChatMessage[] into the format required by the SDK
const transformHistory = (messages: ChatMessage[]) => {
  return messages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));
};

// Use ChatMessage from imported types, and ensure history format is correct
export const getAIResponse = async (
  userMessage: string,
  userType: UserType,
  history: ChatMessage[] 
): Promise<string> => {
  // Runtime safety check (essential for when the API key is missing)
  if (!ai) return "AI service is not configured. Please set NEXT_PUBLIC_GEMINI_API_KEY.";

  try {
    const systemInstruction = `
      You are "Cozy," an intelligent home concierge for the application "Contract to Cozy."
      
      Current User Context: ${userType === UserType.BUYER ? "Home Buyer (In Closing Phase)" : userType === UserType.OWNER ? "Home Owner (Maintenance Phase)" : "Guest / Exploring"}
      
      Tone: Professional, reassuring, warm, and knowledgeable.
      
      Goals:
      1. If User is a BUYER: Assist with closing logistics (inspections, insurance, movers, legal). Reduce stress.
      2. If User is an OWNER: Assist with maintenance schedules, finding pros, and home value preservation.
      
      Keep responses concise (under 150 words unless asked for a list) and helpful.
      If you don't know the answer, suggest connecting them with a human specialist from the platform.
    `;
    
    // The history needs to be mapped to the format required by the SDK
    const sdkHistory = transformHistory(history);

    // The userMessage is the last part of the conversation
    const contents = [...sdkHistory, { role: 'user' as const, parts: [{ text: userMessage }] }];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: systemInstruction,
      },
      contents: contents as any
    });

    return response.text || "I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm having a little trouble connecting to the home server right now. Please try again in a moment.";
  }
};

export const generateMaintenanceTip = async (): Promise<string> => {
  if (!ai) return "Check your HVAC filters this month to keep the air fresh and clean!";
  
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: "Give me a one-sentence seasonal home maintenance tip for a homeowner. Make it sound cozy and helpful.",
        });
        return response.text || "Check your HVAC filters this month to keep the air fresh and clean!";
    } catch (e) {
        return "Check your HVAC filters this month to keep the air fresh and clean!";
    }
};