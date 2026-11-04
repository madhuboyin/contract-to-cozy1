'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DictationController, getSpeechRecognitionCtor, type DictationState } from '@/features/ask/voiceInput';

// Microphone button for the Ask composer (FRD v1.102). Renders nothing where the browser has no speech recognition.
// It writes what it hears into the question box through `onChange` and never sends.
export function VoiceInputButton({ getValue, onChange, disabled, large, embedded = false, lang }: {
  getValue: () => string;
  onChange: (value: string) => void;
  disabled?: boolean;
  large?: boolean;
  embedded?: boolean;
  lang?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const controller = useRef<DictationController | null>(null);
  // The controller outlives renders, so it reads the latest callbacks through refs instead of capturing the first ones.
  const latest = useRef({ getValue, onChange });
  latest.current = { getValue, onChange };

  useEffect(() => { setSupported(Boolean(getSpeechRecognitionCtor())); }, []);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);
  useEffect(() => { if (disabled) controller.current?.stop(); }, [disabled]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    controller.current?.abort();
    controller.current = new DictationController({
      create: () => new Ctor(),
      lang: lang || (typeof navigator !== 'undefined' && navigator.language) || 'en-US',
      getBase: () => latest.current.getValue(),
      onText: (value) => latest.current.onChange(value),
      onState: (state: DictationState) => setListening(state === 'LISTENING'),
      onMessage: setMessage,
    });
    controller.current.start();
  }, [lang]);

  if (!supported) return null;
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => (listening ? controller.current?.stop() : start())} disabled={disabled && !listening}
        aria-label={listening ? 'Stop dictation' : 'Dictate your question'} aria-pressed={listening}
        title={listening ? 'Stop dictation' : 'Dictate your question. Your browser may send the audio to its speech service.'}
        className={cn('grid shrink-0 place-items-center transition disabled:cursor-not-allowed disabled:opacity-40', large ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-full', !embedded && 'border',
          listening ? 'border-red-300 bg-red-50 text-red-700' : embedded ? 'text-slate-600 hover:bg-slate-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
        {listening ? <Square className="h-4 w-4 motion-safe:animate-pulse" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{listening ? 'Listening. Press the button again to stop.' : message ?? ''}</span>
      {message && !listening && <span data-ask-voice-message aria-hidden="true" className="absolute bottom-full right-0 z-10 mb-2 w-56 rounded-lg bg-slate-800 px-2 py-1 text-xs text-white shadow">{message}</span>}
    </div>
  );
}
