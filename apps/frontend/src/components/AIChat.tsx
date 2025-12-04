// apps/frontend/src/components/AIChat.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { User } from '@/types'; // Assuming User type is imported from '@/types'
import { cn } from '@/lib/utils'; // Utility for combining class names

// --- FEATURE FLAG CHECK (Determines if the component should be rendered at all) ---
// Note: This must be set in apps/frontend/.env.local (NEXT_PUBLIC_GEMINI_CHAT_ENABLED=true)
const isChatEnabled = process.env.NEXT_PUBLIC_GEMINI_CHAT_ENABLED === 'true';

// Helper to determine the personalized welcome message based on user segment
function getWelcomeMessage(user: User | null): string {
    if (!user) {
        return "Hi! I'm Cozy. I see you're exploring. How can I help you today?";
    }
    const segment = user.segment;
    if (segment === 'HOME_BUYER') {
        return "Hi! I'm Cozy. I see you're closing on a home. How can I help you with your checklist today?";
    }
    if (segment === 'EXISTING_OWNER') {
        return "Hi! I'm Cozy. I see you're managing your home. Ask me about maintenance, warranties, or expenses!";
    }
    return "Hi! I'm Cozy. How can I help you today?";
}

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export const AIChat: React.FC = () => {
  if (!isChatEnabled) {
      return null; // Don't render if feature flag is false
  }
    
  const { user } = useAuth();
  
  // Use a persistent unique ID for the session, generated once per component lifecycle
  // This replaces the need for the userType prop, as the backend manages history by this ID.
  const [sessionId] = useState(() => Date.now().toString());

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Initialize messages with personalized welcome message
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { role: 'model', text: getWelcomeMessage(user) }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message or when opening the chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);
    
  // Re-initialize welcome message if user loads later or changes
  useEffect(() => {
      // Logic to update the initial message if user data loads after initial render
      if (messages.length === 1 && user && messages[0].text !== getWelcomeMessage(user)) {
          setMessages([{ role: 'model', text: getWelcomeMessage(user) }]);
      }
  }, [user]);

    // apps/frontend/src/components/AIChat.tsx (Modification to handleSend)

    const handleSend = useCallback(async () => {
        if (!input.trim() || loading) return;

        const userMsg = input.trim();
        setInput('');
        
        // 1. Add user message
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        try {
            // 2. Call the secure backend proxy
            // The API client is typed to return the APIResponse object (which includes success and data properties)
            const response = await api.sendMessageToChat({
                sessionId: sessionId, 
                message: userMsg,
            });
            
            // *** FIX: Check for success before accessing data ***
            if (!response.success || !response.data) {
                // While client.ts should throw for failure, this handles edge cases 
                // where the structure is valid but success is false.
                throw new Error(response.message || "AI service returned an unexpected failure.");
            }

            // 3. Update state with the backend response
            const modelResponseText = response.data.text; 
            
            if (!modelResponseText) {
                throw new Error("Invalid response format from AI service.");
            }
            
            setMessages(prev => [...prev, { role: 'model', text: modelResponseText }]);

        } catch (error: any) {
            console.error("AI chat error:", error);
            
            // Error handling logic remains the same
            const errorMessage = error.status === 403 
                ? "The AI chat feature is currently disabled by configuration." 
                : `Sorry, I ran into an error: ${error.message || 'Please try again.'}`;
                
            setMessages(prev => [...prev, { 
                role: 'model', 
                text: errorMessage, 
            }]);
        } finally {
            setLoading(false);
        }
    }, [input, loading, sessionId, user]); // Note: input should be removed from dependency array if using useCallback with local state

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent line break in input
      handleSend();
    }
  };


  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="group flex items-center bg-stone-900 hover:bg-amber-600 text-white rounded-full px-6 py-4 shadow-2xl transition-all duration-300 hover:-translate-y-1"
        >
          <Sparkles className="w-5 h-5 mr-2 animate-pulse" />
          <span className="font-medium">Ask Cozy</span>
        </button>
      )}

      {isOpen && (
        <div className={cn(
            "bg-white rounded-2xl shadow-2xl w-[350px] md:w-[400px] flex flex-col overflow-hidden border border-stone-200 h-[500px]",
            "animate-in fade-in slide-in-from-bottom-10 duration-300" 
        )}>
          {/* Header */}
          <div className="bg-stone-900 p-4 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center mr-3">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-serif font-bold">Cozy</h3>
                <p className="text-xs text-stone-300">AI Home Concierge</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-stone-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 bg-stone-50 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={cn(
                  'max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user' 
                    ? 'bg-stone-800 text-white rounded-tr-none' 
                    : 'bg-white text-stone-800 shadow-sm border border-stone-100 rounded-tl-none'
                )}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                 <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm border border-stone-100 flex space-x-1">
                    <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce delay-200" />
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-stone-100 shrink-0">
            <div className="flex items-center bg-stone-50 rounded-full px-4 py-2 border border-stone-200 focus-within:border-amber-500 transition-colors">
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about maintenance, closing..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 placeholder-stone-400"
                disabled={loading}
              />
              <button 
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="ml-2 text-stone-400 hover:text-amber-600 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};