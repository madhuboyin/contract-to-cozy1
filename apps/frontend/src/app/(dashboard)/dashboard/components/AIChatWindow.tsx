// apps/frontend/src/app/(dashboard)/dashboard/components/AIChatWindow.tsx

'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Bot, User } from 'lucide-react';
import { ChatMessage } from '@/types'; // Import the new ChatMessage type
import { api } from '@/lib/api/client';

/**
 * A basic chat window component that talks to the secure backend proxy.
 */
export const AIChatWindow = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Generates a simple, unique session ID for the current client lifecycle
  const [sessionId] = useState(() => Date.now().toString());

  // Auto-scroll to the bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: inputMessage.trim() };

    // 1. Optimistic UI update with user message
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // 2. Call the secure backend proxy
      const response = await api.sendMessageToChat({
        sessionId,
        message: userMessage.text,
      });

      // 3. Handle the model's response
      // Check if response is successful and extract the text
      if (response.success && response.data) {
        const modelMessage: ChatMessage = {
          role: 'model',
          text: response.data.text,
        };
        
        // 4. Update with the model's message
        setMessages((prev) => [...prev, modelMessage]);
      } else {
        // Handle error response
        const errorMessage: ChatMessage = {
          role: 'model',
          text: `Error: The AI service could not process your request. Please try again later.`
        };
        setMessages((prev) => [...prev, errorMessage]);
      }

    } catch (error: any) {
      console.error("Error communicating with AI service:", error);
      const errorMessage: ChatMessage = {
        role: 'model',
        text: `Error: The AI service could not process your request. ${error.response?.data?.message || 'Please try again later.'}`
      }
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [inputMessage, isLoading, sessionId]);
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const MessageBubble = ({ message }: { message: ChatMessage }) => {
    const isUser = message.role === 'user';
    
    return (
      <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
        <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3 items-start`}>
          <Avatar className={isUser ? 'order-1' : 'order-2'}>
            <AvatarFallback className={`${isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
              {isUser ? <User size={16} /> : <Bot size={16} />}
            </AvatarFallback>
          </Avatar>
          <div 
            className={`p-3 rounded-lg shadow-md ${isUser 
              ? 'bg-primary text-primary-foreground rounded-br-none' 
              : 'bg-secondary text-secondary-foreground rounded-tl-none'
            }`}
          >
            <p className="whitespace-pre-wrap">{message.text}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader className="py-3 px-6 border-b">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          AI Home Assistant
        </h3>
      </CardHeader>
      
      <CardContent className="flex-grow p-4 overflow-hidden flex flex-col">
        <div className="flex-grow pr-4 overflow-y-auto" ref={scrollRef}>
          <div className="flex flex-col h-full">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground pt-10">
                <Bot className="w-8 h-8 mb-2" />
                <p>Hello! I'm your Contract-to-Cozy AI Assistant. How can I help with your property and maintenance questions today?</p>
                <p className="text-sm mt-1">Ask me about your homeowner checklist, maintenance plans, or general property advice.</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <MessageBubble key={index} message={msg} />
              ))
            )}
          </div>
        </div>
      </CardContent>
      
      <div className="p-4 border-t flex items-end gap-2">
        <Textarea
          placeholder="Type your message here..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-grow min-h-[50px] resize-none"
          disabled={isLoading}
        />
        <Button 
          onClick={handleSendMessage} 
          disabled={!inputMessage.trim() || isLoading}
          className="h-[50px] flex-shrink-0"
        >
          {isLoading ? 'Sending...' : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </Card>
  );
};