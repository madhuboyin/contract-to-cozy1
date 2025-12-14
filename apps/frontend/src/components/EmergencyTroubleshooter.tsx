// apps/frontend/src/components/EmergencyTroubleshooter.tsx
'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface EmergencyTroubleshooterProps {
  propertyId?: string;
}

export default function EmergencyTroubleshooter({ propertyId }: EmergencyTroubleshooterProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [severity, setSeverity] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    setLoading(true);
    setError('');
    
    // Add user message to conversation
    const newMessages: Message[] = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    
    try {
      const response = await api.emergencyChat(newMessages, propertyId);
      
      if (response.success && response.data) {
        // Update severity/resolution from response
        setSeverity(response.data.severity);
        setResolution(response.data.resolution || null);
        
        // Add assistant response to conversation
        setMessages([...newMessages, {
          role: 'assistant',
          content: response.data.message
        }]);
      } else {
        setError('Failed to get emergency response');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to emergency service');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getSeverityColor = () => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-100 border-red-500 text-red-900';
      case 'HIGH': return 'bg-orange-100 border-orange-500 text-orange-900';
      case 'MEDIUM': return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      default: return 'bg-blue-100 border-blue-500 text-blue-900';
    }
  };

  const getResolutionBadge = () => {
    if (!resolution) return null;
    
    const badges = {
      'DIY': { color: 'bg-green-100 text-green-800 border-green-300', text: '✓ You Can Fix This' },
      'CALL_PRO': { color: 'bg-orange-100 text-orange-800 border-orange-300', text: '☎ Call Professional' },
      'IMMEDIATE_DANGER': { color: 'bg-red-100 text-red-800 border-red-300', text: '⚠ IMMEDIATE ACTION REQUIRED' }
    };
    
    const badge = badges[resolution as keyof typeof badges];
    if (!badge) return null;
    
    return (
      <div className={`inline-block px-3 py-1 rounded-full border-2 text-sm font-semibold ${badge.color}`}>
        {badge.text}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-red-600" />
            <h3 className="text-xl font-semibold">Emergency Troubleshooter</h3>
          </div>
          {getResolutionBadge()}
        </div>
        
        {severity && (
          <div className={`inline-block px-3 py-1 rounded-full border-2 text-sm font-semibold ${getSeverityColor()}`}>
            Severity: {severity}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border-2 border-red-300 rounded-lg text-red-800">
          <p className="font-semibold">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[300px] max-h-[500px]">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p>Describe your emergency to get started</p>
            <p className="text-sm mt-2">Examples: "Toilet overflowing", "Smell gas", "No hot water"</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`p-4 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-100 border-2 border-blue-300 ml-12'
                  : 'bg-white border-2 border-gray-300 mr-12'
              }`}
            >
              <div className="flex items-start gap-2">
                {msg.role === 'assistant' && (
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <p className="whitespace-pre-wrap text-gray-900">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        
        {loading && (
          <div className="flex items-center gap-2 text-blue-600 bg-blue-50 p-4 rounded-lg">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>AI is analyzing your emergency...</span>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="space-y-3 max-w-3xl mx-auto">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={messages.length === 0 ? "Describe your emergency (e.g., 'toilet overflowing')" : "Answer the question or provide more details..."}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-lg"
            disabled={loading}
          />
          <Button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            size="lg"
            className="px-6"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              'Send'
            )}
          </Button>
        </div>

        {/* Safety Disclaimer */}
        <p className="text-xs text-gray-500 text-center">
          ⚠️ For life-threatening emergencies, always call 911 immediately. This AI assistant provides guidance only and is not a substitute for professional help.
        </p>
      </div>
    </div>
  );
}