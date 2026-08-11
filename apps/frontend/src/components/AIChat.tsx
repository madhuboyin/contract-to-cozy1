'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Sparkles, X } from 'lucide-react';
import { AskWorkspace } from '@/components/ask/AskWorkspace';

export function AIChat() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener('cozy-chat-open', open);
    return () => window.removeEventListener('cozy-chat-open', open);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open Ask Cozy"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-teal-700 px-5 font-semibold text-white shadow-[0_18px_45px_-15px_rgba(15,118,110,0.8)] transition hover:bg-teal-800 lg:bottom-6 lg:right-6"
        >
          <Sparkles className="h-5 w-5" /><span className="hidden sm:inline">Ask Cozy</span><MessageCircle className="h-5 w-5 sm:hidden" />
        </button>
      )}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-[2px] lg:flex lg:items-end lg:justify-end lg:p-6" role="dialog" aria-modal="true" aria-label="Ask Cozy">
          <button className="absolute inset-0 cursor-default" aria-label="Close Ask Cozy" onClick={() => setIsOpen(false)} />
          <div className="relative h-full w-full overflow-hidden bg-white shadow-2xl lg:h-[min(780px,calc(100vh-3rem))] lg:w-[560px] lg:rounded-[28px] lg:border lg:border-slate-200">
            <button onClick={() => setIsOpen(false)} aria-label="Close Ask Cozy" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-xl bg-white text-slate-500 shadow-sm hover:bg-slate-100"><X className="h-4 w-4" /></button>
            <AskWorkspace mode="panel" />
          </div>
        </div>
      )}
    </>
  );
}

export default AIChat;
