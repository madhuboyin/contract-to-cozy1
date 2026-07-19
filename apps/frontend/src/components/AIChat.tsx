// apps/frontend/src/components/AIChat.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { User } from '@/types';
import { cn } from '@/lib/utils'; 
// [NEW IMPORT]
import { usePropertyContext } from '@/lib/property/PropertyContext'; 

function getWelcomeMessage(user: User | null): string {
    if (!user) {
        return "Hi! I'm Cozy. I see you're exploring. How can I help you today?";
    }
    return "Hi! I'm Cozy. Ask me about the home, an active decision, maintenance, coverage, or a major project.";
}

function createChatSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    grounding?: {
      mode: 'PROPERTY' | 'GENERAL';
      evidence: Array<{ factKey: string; label: string; source: string | null; observedAt: string | null }>;
      missingFacts: string[];
      confidence: { label: 'LOW' | 'MEDIUM' | 'HIGH'; rationale: string };
      safetyBoundary: string;
      nextAction: string;
    };
}

type AskProposalKind = 'ADD_FACT' | 'CORRECT_FACT' | 'CREATE_TASK' | 'START_JOURNEY' | 'COMPARE_OPTIONS' | 'UPLOAD_EVIDENCE' | 'ADD_NOTE';

function parsePromptValue(value: string): unknown {
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  if (trimmed.toLowerCase() === 'unknown' || trimmed.toLowerCase() === 'not sure') return null;
  return trimmed;
}

function slugifyAskValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const AIChatInner: React.FC = () => {
  const { user } = useAuth();
  const pathname = usePathname();
  // [MODIFICATION] Get selectedPropertyId from context
  const { selectedPropertyId } = usePropertyContext();
  
  const [sessionId, setSessionId] = useState(createChatSessionId);
  const previousPropertyIdRef = useRef<string | null | undefined>(selectedPropertyId);

  const [isOpen, setIsOpen] = useState(false);
  const [showPulse, setShowPulse] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isFormInputFocused, setIsFormInputFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isCollisionZoneVisible, setIsCollisionZoneVisible] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launcherRef = useRef<HTMLDivElement>(null);
  
  // Memoize the welcome message for the signed-in user.
  const welcomeMessage = useMemo(() => getWelcomeMessage(user), [user]);
  const welcomeInitRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { role: 'model', text: getWelcomeMessage(user) }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    if (previousPropertyIdRef.current === selectedPropertyId) return;
    previousPropertyIdRef.current = selectedPropertyId;
    setSessionId(createChatSessionId());
    setMessages([{
      role: 'model',
      text: selectedPropertyId
        ? 'The selected home changed, so I started a new grounded conversation with that home’s record.'
        : 'No home is selected now, so I started a new general-guidance conversation.',
    }]);
  }, [selectedPropertyId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasInteracted = window.localStorage.getItem('cozy_chat_interacted') === '1';
    if (hasInteracted) {
      setShowPulse(false);
      return;
    }

    setShowPulse(true);
    const timer = window.setTimeout(() => setShowPulse(false), 30000);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isMobileViewport = () => window.matchMedia('(max-width: 1023px)').matches;
    const isFocusableField = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (launcherRef.current?.contains(target)) return false;
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isMobileViewport()) return;
      if (!isFocusableField(event.target)) return;
      setIsFormInputFocused(true);
      setIsOpen((prev) => (prev ? false : prev));
    };

    const handleFocusOut = () => {
      if (!isMobileViewport()) return;
      const activeElement = document.activeElement;
      if (isFocusableField(activeElement)) return;
      setIsFormInputFocused(false);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;

    const handleViewportChange = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        setIsKeyboardVisible(false);
        return;
      }

      const keyboardOpen = window.innerHeight - viewport.height > 120;
      setIsKeyboardVisible(keyboardOpen);
    };

    handleViewportChange();
    viewport.addEventListener('resize', handleViewportChange);
    viewport.addEventListener('scroll', handleViewportChange);

    return () => {
      viewport.removeEventListener('resize', handleViewportChange);
      viewport.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const collisionNodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-chat-collision-zone="true"]')
    );

    if (!collisionNodes.length) {
      setIsCollisionZoneVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const hasVisibleCollisionZone = entries.some((entry) => entry.isIntersecting);
        setIsCollisionZoneVisible(hasVisibleCollisionZone);
      },
      { threshold: 0.2 }
    );

    collisionNodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, []);

  const shouldHideLauncher = !isOpen && (isFormInputFocused || isKeyboardVisible || isCollisionZoneVisible);

  useEffect(() => {
    if (shouldHideLauncher) {
      setShowTooltip(false);
    }
  }, [shouldHideLauncher]);

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
        
        setMessages(prev => [...prev, {
          role: 'model',
          text: modelResponseText,
          grounding: {
            mode: response.data.groundingMode,
            evidence: response.data.evidence.map(({ factKey, label, source, observedAt }) => ({ factKey, label, source, observedAt })),
            missingFacts: response.data.missingFacts,
            confidence: response.data.confidence,
            safetyBoundary: response.data.safetyBoundary,
            nextAction: response.data.nextAction,
          },
        }]);

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

  const confirmProposal = async (message: ChatMessage, input: {
    kind: AskProposalKind;
    summary: string;
    payload: Record<string, unknown>;
    propertyId?: string | null;
    confirmation: string;
    completion: string;
  }) => {
    if (!message.grounding) return;
    const proposal = await api.createGroundedAskProposal({
      sessionId,
      propertyId: input.propertyId,
      kind: input.kind,
      summary: input.summary,
      payload: input.payload,
      evidence: message.grounding.evidence.map(({ factKey, source, observedAt }) => ({ factKey, source, observedAt })),
    });
    if (!proposal.success || !proposal.data) return;
    if (window.confirm(input.confirmation)) {
      const confirmed = await api.confirmGroundedAskProposal(proposal.data.id);
      if (confirmed.success) setMessages((previous) => [...previous, { role: 'model', text: input.completion }]);
    } else {
      await api.rejectGroundedAskProposal(proposal.data.id);
    }
  };

  const proposeTask = async (message: ChatMessage) => {
    if (!selectedPropertyId || !message.grounding) return;
    const title = window.prompt('Task title to create from this answer:');
    if (!title?.trim()) return;
    await confirmProposal(message, {
      kind: 'CREATE_TASK',
      summary: `Create maintenance task: ${title.trim()}`,
      payload: { title: title.trim(), description: `Confirmed from a Grounded Ask answer: ${message.text.slice(0, 300)}`, priority: 'MEDIUM' },
      propertyId: selectedPropertyId,
      confirmation: `Create the task “${title.trim()}” for this property?`,
      completion: `Created the confirmed task “${title.trim()}”. The action is linked to this Ask proposal for auditability.`,
    });
  };

  const proposeFact = async (message: ChatMessage, kind: 'ADD_FACT' | 'CORRECT_FACT') => {
    if (!selectedPropertyId || !message.grounding) return;
    const suggestedKey = kind === 'ADD_FACT' ? message.grounding.missingFacts[0] : message.grounding.evidence[0]?.factKey;
    const factKey = window.prompt('Living Home Record fact key:', suggestedKey ?? '');
    if (!factKey?.trim()) return;
    const rawValue = window.prompt(`Value for ${factKey.trim()}:`);
    if (rawValue === null || !rawValue.trim()) return;
    await confirmProposal(message, {
      kind,
      summary: `${kind === 'ADD_FACT' ? 'Add' : 'Correct'} ${factKey.trim()}`,
      payload: { factKey: factKey.trim(), value: parsePromptValue(rawValue) },
      propertyId: selectedPropertyId,
      confirmation: `${kind === 'ADD_FACT' ? 'Add' : 'Correct'} this home fact?`,
      completion: `The confirmed ${factKey.trim()} update was written through the Living Home Record capture policy.`,
    });
  };

  const proposeJourney = async (message: ChatMessage) => {
    if (!selectedPropertyId) return;
    const label = window.prompt('What decision or project should the plan address?');
    if (!label?.trim()) return;
    const serviceKey = slugifyAskValue(label);
    await confirmProposal(message, {
      kind: 'START_JOURNEY', summary: `Start plan: ${label.trim()}`,
      payload: { scopeCategory: 'SERVICE', scopeId: serviceKey, issueType: serviceKey, serviceKey },
      propertyId: selectedPropertyId,
      confirmation: `Start a guided plan for “${label.trim()}”?`,
      completion: `Started the confirmed guided plan for “${label.trim()}”.`,
    });
  };

  const proposeComparison = async (message: ChatMessage) => {
    if (!selectedPropertyId) return;
    const scopeSummary = window.prompt('What options or quotes should be compared?');
    if (!scopeSummary?.trim()) return;
    await confirmProposal(message, {
      kind: 'COMPARE_OPTIONS', summary: `Compare options: ${scopeSummary.trim()}`,
      payload: { scopeSummary: scopeSummary.trim() }, propertyId: selectedPropertyId,
      confirmation: `Create a comparison workspace for “${scopeSummary.trim()}”?`,
      completion: `Created the confirmed comparison workspace for “${scopeSummary.trim()}”.`,
    });
  };

  const proposeEvidence = async (message: ChatMessage) => {
    if (!selectedPropertyId) return;
    const response = await api.listDocuments(selectedPropertyId);
    if (!response.success) return;
    const documents = response.data.documents;
    if (!documents.length) {
      setMessages((previous) => [...previous, { role: 'model', text: 'Upload the document to this home first, then return here to attach it as evidence.' }]);
      return;
    }
    const choices = documents.slice(0, 10).map((document, index) => `${index + 1}. ${document.name}`).join('\n');
    const selection = Number(window.prompt(`Choose an uploaded document:\n${choices}`));
    const document = Number.isInteger(selection) ? documents[selection - 1] : undefined;
    if (!document) return;
    await confirmProposal(message, {
      kind: 'UPLOAD_EVIDENCE', summary: `Attach evidence: ${document.name}`,
      payload: { documentId: document.id }, propertyId: selectedPropertyId,
      confirmation: `Attach “${document.name}” as evidence for this answer?`,
      completion: `Attached the confirmed document “${document.name}” as auditable evidence.`,
    });
  };

  const proposeNote = async (message: ChatMessage) => {
    const note = window.prompt('Note to keep from this answer:');
    if (!note?.trim()) return;
    await confirmProposal(message, {
      kind: 'ADD_NOTE', summary: 'Keep a note from Grounded Ask', payload: { note: note.trim() },
      propertyId: selectedPropertyId ?? null,
      confirmation: 'Save this note?', completion: 'Saved the confirmed note with its Ask evidence and audit link.',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const openChat = useCallback(() => {
    setIsOpen(true);
    setShowPulse(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('cozy_chat_interacted', '1');
    }
  }, []);

  const closeChat = () => {
    setIsOpen(false);
    setShowTooltip(false);
  };

  const showTooltipWithDelay = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) return;
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = setTimeout(() => setShowTooltip(true), 500);
  };

  const hideTooltip = () => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setShowTooltip(false);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOpenRequest = (event: Event) => {
      const question = (event as CustomEvent<{ question?: string }>).detail?.question;
      if (question) setInput(question);
      openChat();
    };

    window.addEventListener('cozy-chat-open', handleOpenRequest);
    return () => {
      window.removeEventListener('cozy-chat-open', handleOpenRequest);
    };
  }, [openChat]);


  return (
    <>
      {isOpen && (
        <button
          type="button"
          onClick={closeChat}
          className="fixed inset-0 z-40 bg-black/30"
          aria-label="Close Cozy chat"
        />
      )}
      <div
        ref={launcherRef}
        className={cn(
          'fixed right-3 font-sans transition-all duration-200 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] sm:right-4 lg:bottom-6 lg:right-6',
          isOpen ? 'z-[70]' : 'z-40',
          shouldHideLauncher && 'pointer-events-none translate-y-2 opacity-0'
        )}
      >
        <div className="relative flex justify-end">
          {showTooltip && !isOpen && (
            <div className="absolute -top-10 right-0 hidden rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm lg:block">
              Ask Cozy anything about your home
            </div>
          )}
          {showPulse && !isOpen && (
            <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-amber-400/70 animate-ping" />
          )}
          <button
            onClick={isOpen ? closeChat : openChat}
            onMouseEnter={showTooltipWithDelay}
            onMouseLeave={hideTooltip}
            data-cozy-chat-launcher="true"
            aria-label={isOpen ? 'Close Cozy chat' : 'Open Cozy chat'}
            className={cn(
              'group relative z-10 flex min-h-12 items-center text-white shadow-2xl transition-all duration-200',
              isOpen
                ? 'h-12 w-12 justify-center rounded-full bg-stone-900 hover:bg-stone-800'
                : 'rounded-full bg-stone-900 px-4 py-3 hover:bg-amber-600'
            )}
          >
            {isOpen ? (
              <X className="h-5 w-5 rotate-180 transition-transform duration-200" />
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                <span className="font-medium text-sm">Ask Cozy</span>
              </>
            )}
          </button>
        </div>

        {isOpen && (
          <div className={cn(
              "mt-3 bg-white rounded-2xl shadow-2xl w-[min(350px,calc(100vw-1.5rem))] md:w-[400px] flex flex-col overflow-hidden border border-stone-200 h-[min(500px,70dvh)] sm:h-[500px]",
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
              <button onClick={closeChat} className="flex h-10 w-10 items-center justify-center rounded-full text-stone-400 hover:bg-stone-700 hover:text-white transition-colors" aria-label="Close chat">
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
                    <div>{msg.text}</div>
                    {msg.grounding ? (
                      <div className="mt-3 space-y-2 border-t border-stone-200 pt-2 text-xs whitespace-normal">
                        <div className="flex flex-wrap gap-1"><span className="rounded-full bg-stone-100 px-2 py-1 font-semibold">{msg.grounding.mode === 'PROPERTY' ? 'Grounded in this home' : 'General answer'}</span><span className="rounded-full bg-stone-100 px-2 py-1">{msg.grounding.confidence.label} confidence</span></div>
                        <p>{msg.grounding.confidence.rationale}</p>
                        {msg.grounding.evidence.length > 0 ? <p><strong>Evidence:</strong> {msg.grounding.evidence.slice(0, 5).map((item) => item.label).join(', ')}</p> : null}
                        {msg.grounding.missingFacts.length > 0 ? <p><strong>Missing:</strong> {msg.grounding.missingFacts.slice(0, 5).join(', ')}</p> : null}
                        <p><strong>Boundary:</strong> {msg.grounding.safetyBoundary}</p>
                        <p><strong>Next:</strong> {msg.grounding.nextAction}</p>
                        <details className="rounded-lg border border-stone-200 p-2">
                          <summary className="cursor-pointer font-semibold">Propose an action</summary>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {msg.grounding.mode === 'PROPERTY' ? <button type="button" onClick={() => void proposeTask(msg)} className="rounded-lg border border-stone-300 px-2 py-1 font-semibold">Create task</button> : null}
                            {msg.grounding.mode === 'PROPERTY' && msg.grounding.missingFacts.length ? <button type="button" onClick={() => void proposeFact(msg, 'ADD_FACT')} className="rounded-lg border border-stone-300 px-2 py-1 font-semibold">Add missing fact</button> : null}
                            {msg.grounding.mode === 'PROPERTY' && msg.grounding.evidence.length ? <button type="button" onClick={() => void proposeFact(msg, 'CORRECT_FACT')} className="rounded-lg border border-stone-300 px-2 py-1 font-semibold">Correct fact</button> : null}
                            {msg.grounding.mode === 'PROPERTY' ? <button type="button" onClick={() => void proposeJourney(msg)} className="rounded-lg border border-stone-300 px-2 py-1 font-semibold">Start guided plan</button> : null}
                            {msg.grounding.mode === 'PROPERTY' ? <button type="button" onClick={() => void proposeComparison(msg)} className="rounded-lg border border-stone-300 px-2 py-1 font-semibold">Compare options</button> : null}
                            {msg.grounding.mode === 'PROPERTY' ? <button type="button" onClick={() => void proposeEvidence(msg)} className="rounded-lg border border-stone-300 px-2 py-1 font-semibold">Attach evidence</button> : null}
                            <button type="button" onClick={() => void proposeNote(msg)} className="rounded-lg border border-stone-300 px-2 py-1 font-semibold">Save note</button>
                          </div>
                        </details>
                      </div>
                    ) : null}
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
    </>
  );
};

// Always mount the client shell so dashboard Ask controls have a live event
// target. The backend's runtime GEMINI_CHAT_ENABLED flag remains authoritative
// and returns 403 when AI responses are disabled. Using a NEXT_PUBLIC build-time
// flag here previously removed the listener from production bundles while the
// dashboard continued to render clickable Ask controls.
export const AIChat: React.FC = () => <AIChatInner />;
