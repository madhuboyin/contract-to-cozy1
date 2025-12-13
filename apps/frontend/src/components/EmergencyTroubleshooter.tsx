// apps/frontend/src/components/EmergencyTroubleshooter.tsx
'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Phone, Wrench, Loader2, XCircle } from 'lucide-react';
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startEmergency = async () => {
    if (!input.trim()) return;
    
    setLoading(true);
    setError('');
    setMessages([{ role: 'user', content: input }]);
    
    try {
      const response = await api.startEmergency(input, propertyId);
      
      if (response.success && response.data) {
        setSessionId(response.data.sessionId);
        setSeverity(response.data.severity);
        setResolution(response.data.resolution || null);
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response.data!.message
        }]);
      } else {
        setError('Failed to start emergency session');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to emergency service');
    } finally {
      setLoading(false);
      setInput('');
    }
  };

  const continueSession = async () => {
    if (!input.trim() || !sessionId) return;
    
    setLoading(true);
    setError('');
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    
    try {
      const response = await api.continueEmergency(sessionId, input);
      
      if (response.success && response.data) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response.data!.message
        }]);
        
        if (response.data.resolution) {
          setResolution(response.data.resolution);
        }
      } else {
        setError('Failed to continue session');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get response');
    } finally {
      setLoading(false);
      setInput('');
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sessionId ? continueSession() : startEmergency();
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-red-100 rounded-lg">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Emergency Troubleshooter</h1>
          <p className="text-gray-600">Get instant AI-powered help for home emergencies</p>
        </div>
      </div>

      {/* Severity Badge */}
      {severity && (
        <div className={`mb-4 px-4 py-3 rounded-lg border-2 ${getSeverityColor()}`}>
          <p className="font-semibold text-lg">Severity: {severity}</p>
        </div>
      )}

      {/* Critical Danger Warning */}
      {resolution === 'IMMEDIATE_DANGER' && (
        <div className="mb-4 bg-red-600 text-white p-6 rounded-lg border-4 border-red-800 animate-pulse">
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="h-8 w-8" />
            <p className="font-bold text-2xl">⚠️ IMMEDIATE DANGER</p>
          </div>
          <p className="text-lg font-semibold">EVACUATE NOW</p>
          <p className="mt-2">Call emergency services: <span className="font-mono text-xl">911</span></p>
        </div>
      )}

      {/* Call Professional Banner */}
      {resolution === 'CALL_PRO' && (
        <div className="mb-4 bg-orange-100 border-2 border-orange-500 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-orange-700" />
            <p className="font-semibold text-orange-900">Professional Help Recommended</p>
          </div>
          <p className="text-sm text-orange-800 mt-1">This issue requires a licensed professional</p>
        </div>
      )}

      {/* DIY Success Banner */}
      {resolution === 'DIY' && (
        <div className="mb-4 bg-green-100 border-2 border-green-500 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-green-700" />
            <p className="font-semibold text-green-900">You Can Fix This Yourself</p>
          </div>
          <p className="text-sm text-green-800 mt-1">Follow the steps below carefully</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 bg-red-50 border-2 border-red-300 p-4 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-4 mb-6 max-h-[500px] overflow-y-auto bg-gray-50 rounded-lg p-4">
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
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={sessionId ? "Answer the question or provide more details..." : "Describe your emergency (e.g., 'toilet overflowing')"}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-lg"
            disabled={loading}
          />
          <Button
            onClick={sessionId ? continueSession : startEmergency}
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