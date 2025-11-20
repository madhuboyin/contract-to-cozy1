// src/components/AIChat.tsx (Prop-based final version)

import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { UserType, ChatMessage } from '../types'; // Adjust import path
import { getAIResponse } from '../services/geminiService'; // Adjust import path
// Note: cn utility would be imported here if used. Assuming cn is available globally or via explicit import

interface AIChatProps {
  userType: UserType;
}

export const AIChat: React.FC<AIChatProps> = ({ userType }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  const initialMessage = `Hi! I'm Cozy. I see you're ${userType === UserType.BUYER ? 'closing on a home' : userType === UserType.OWNER ? 'managing your home' : 'exploring'}. How can I help you today?`;
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: initialMessage }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset initial message when user type changes, if chat hasn't been used heavily
  useEffect(() => {
    // Only reset if the chat is not currently in a long conversation
    if (messages.length <= 2) { 
       setMessages([{ role: 'model', text: initialMessage }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userType]); 

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = { role: 'user', text: input.trim() };
    const newMessages = [...messages, userMessage];
    
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const responseText = await getAIResponse(userMessage.text, userType, newMessages);
      setMessages(current => [...current, { role: 'model', text: responseText }]);
    } catch (error) {
      setMessages(current => [...current, { role: 'model', text: "Sorry, I lost my connection. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };
  
  const primaryAccent = userType === UserType.BUYER ? 'bg-stone-900' : 'bg-amber-700';

  return (
    <>
      {/* Chat Bubble Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-[60] p-4 rounded-full shadow-2xl transition-all duration-300 ${primaryAccent} ${userType === UserType.BUYER ? 'hover:bg-stone-800' : 'hover:bg-amber-600'} ${isOpen ? "opacity-0 invisible" : "opacity-100 visible"}`}
      >
        <Sparkles className="w-7 h-7 text-white" />
      </button>

      {/* Chat Window */}
      <div
        className={`fixed bottom-6 right-6 z-[70] w-full max-w-sm h-[400px] bg-white rounded-2xl shadow-2xl border border-stone-200 flex flex-col transition-all duration-300 transform ${isOpen ? "scale-100 opacity-100 visible" : "scale-95 opacity-0 invisible pointer-events-none"}`}
      >
        {/* Header */}
        <div className={`p-4 flex justify-between items-center rounded-t-2xl ${primaryAccent}`}>
          <h3 className="text-white font-serif font-semibold text-lg flex items-center">
            <Sparkles className="w-5 h-5 mr-2" />
            Cozy AI Concierge
          </h3>
          <button onClick={() => setIsOpen(false)} className="text-white opacity-80 hover:opacity-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50 no-scrollbar">
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm 
                  ${msg.role === 'user' 
                    ? 'bg-amber-100 text-stone-900 rounded-br-none' 
                    : `${primaryAccent} text-white rounded-tl-none`
                  }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
             <div className="flex justify-start">
                 <div className="bg-stone-200 p-3 rounded-2xl rounded-tl-none shadow-sm border border-stone-100 flex space-x-1">
                    <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce delay-200" />
                 </div>
              </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-white border-t border-stone-100">
          <div className="flex items-center bg-stone-50 rounded-full px-4 py-2 border border-stone-200 focus-within:border-amber-500 transition-colors">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about maintenance, closing..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 placeholder-stone-400"
              disabled={loading}
            />
            <button 
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="ml-2 text-stone-400 hover:text-amber-600 disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};