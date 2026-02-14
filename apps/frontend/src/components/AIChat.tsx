// apps/frontend/src/components/AIChat.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { User } from '@/types';
import { cn } from '@/lib/utils'; 
// [NEW IMPORT]
import { usePropertyContext } from '@/lib/property/PropertyContext'; 

// --- FEATURE FLAG CHECK ---
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
      return null;
  }
    
  const { user } = useAuth();
  // [MODIFICATION] Get selectedPropertyId from context
  const { selectedPropertyId } = usePropertyContext();
  
  const [sessionId] = useState(() => Date.now().toString());

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Memoize welcome message so it only changes when user.segment changes
  const welcomeMessage = useMemo(() => getWelcomeMessage(user), [user]);
  const welcomeInitRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { role: 'model', text: getWelcomeMessage(user) }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Update welcome message when user changes, but only if conversation hasn't started
  useEffect(() => {
    if (!welcomeInitRef.current) {
      welcomeInitRef.current = true;
      return; // Skip first run — initial state already set
    }
    setMessages(prev => {
      if (prev.length === 1 && prev[0].role === 'model') {
        return [{ role: 'model', text: welcomeMessage }];
      }
      return prev;
    });
  }, [welcomeMessage]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    
    // 1. Add user message
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
        const response = await api.sendMessageToChat({
            sessionId: sessionId, 
            message: userMsg,
            // [MODIFICATION] Pass the selectedPropertyId from context
            propertyId: selectedPropertyId,
        });
        
        // --- FIX for 'Property data does not exist' error: Check for success ---
        if (!response.success || !response.data) {
             throw new Error(response.message || "AI service returned an unexpected failure.");
        }
        
        // 2. Update state with the backend response
        const modelResponseText = response.data.text; 
        
        if (!modelResponseText) {
             throw new Error("Invalid response format from AI service.");
        }
        
        setMessages(prev => [...prev, { role: 'model', text: modelResponseText }]);

    } catch (error: any) {
        console.error("AI chat error:", error);
        
        // [MODIFICATION] Robustly extract and format error message
        const displayMessage = error.message 
          ? error.message 
          : 'An unexpected API or network error occurred. Please check the console.';
        
        const errorMessage = error.status === 403 
            ? "The AI chat feature is currently disabled by configuration." 
            : `Sorry, I ran into an error: ${displayMessage}`;
            
        setMessages(prev => [...prev, { 
            role: 'model', 
            text: errorMessage, 
        }]);
    } finally {
        setLoading(false);
    }
    // [MODIFICATION] Added selectedPropertyId to dependencies
  }, [input, loading, sessionId, selectedPropertyId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };


  return (
    <div className="fixed right-3 z-50 font-sans bottom-[calc(6.5rem+env(safe-area-inset-bottom))] sm:right-4 sm:bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:right-6">
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="group flex items-center bg-stone-900 hover:bg-amber-600 text-white rounded-full px-3.5 py-2.5 sm:px-6 sm:py-4 shadow-2xl transition-all duration-300 hover:-translate-y-1"
        >
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-pulse" />
          <span className="font-medium text-sm sm:text-base">Ask Cozy</span>
        </button>
      )}

      {isOpen && (
        <div className={cn(
            "bg-white rounded-2xl shadow-2xl w-[min(350px,calc(100vw-1.5rem))] md:w-[400px] flex flex-col overflow-hidden border border-stone-200 h-[min(500px,70vh)] sm:h-[500px]",
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
