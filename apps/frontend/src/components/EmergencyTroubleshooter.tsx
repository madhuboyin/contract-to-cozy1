// apps/frontend/src/components/EmergencyTroubleshooter.tsx
'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import {
  MobileCard,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

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
      case 'CRITICAL': return 'danger' as const;
      case 'HIGH': return 'danger' as const;
      case 'MEDIUM': return 'elevated' as const;
      default: return 'info' as const;
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
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-8">
      <MobilePageIntro
        eyebrow="Emergency"
        title="Emergency Troubleshooter"
        subtitle="Step-by-step triage support to assess urgency and decide the next safest action."
        action={
          <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
        }
      />

      <MobileSection className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {severity ? <StatusChip tone={getSeverityColor()}>Severity: {severity}</StatusChip> : null}
          {resolution ? (
            <StatusChip tone={resolution === 'IMMEDIATE_DANGER' ? 'danger' : resolution === 'CALL_PRO' ? 'elevated' : 'good'}>
              {resolution === 'IMMEDIATE_DANGER'
                ? 'Immediate Action Required'
                : resolution === 'CALL_PRO'
                ? 'Call Professional'
                : 'DIY Candidate'}
            </StatusChip>
          ) : null}
        </div>
        {getResolutionBadge()}
      </MobileSection>

      {error && (
        <MobileCard className="border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-800">Error</p>
          <p className="text-sm text-red-700">{error}</p>
        </MobileCard>
      )}

      <MobileSection>
        <MobileCard className="space-y-3 max-h-[58vh] overflow-y-auto">
          {messages.length === 0 ? (
            <div className="py-10 text-center text-gray-500">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-gray-400" />
              <p className="text-sm font-medium">Describe your emergency to get started</p>
              <p className="text-xs mt-2">
                Examples: &quot;Toilet overflowing&quot;, &quot;Smell gas&quot;, &quot;No hot water&quot;
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`rounded-xl border px-3 py-2.5 ${
                  msg.role === 'user'
                    ? 'ml-10 border-blue-200 bg-blue-50'
                    : 'mr-10 border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-2">
                  {msg.role === 'assistant' ? (
                    <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm text-gray-900">{msg.content}</p>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI is analyzing your emergency...</span>
            </div>
          )}
        </MobileCard>
      </MobileSection>

      <MobileFilterSurface>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              messages.length === 0
                ? "Describe your emergency (e.g., 'toilet overflowing')"
                : 'Answer the question or provide more details...'
            }
            className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            disabled={loading}
          />
          <Button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="min-h-[44px] px-4"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
          </Button>
        </div>
        <p className="text-center text-xs text-gray-500">
          For life-threatening emergencies, call 911 immediately. This AI guidance is not a substitute for professional help.
        </p>
      </MobileFilterSurface>
    </MobilePageContainer>
  );
}
