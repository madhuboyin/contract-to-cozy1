// Voice input for the Ask composer (P2, FRD v1.102). Browser speech recognition only: it fills the question box and
// never sends. The person reads and edits the text, then sends it as they would a typed question.

export type SpeechResultLike = { isFinal?: boolean; 0: { transcript: string } };
export type SpeechEventLike = { resultIndex?: number; results: ArrayLike<SpeechResultLike> };
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export const MAX_QUESTION_LENGTH = 4000; // the composer's maxLength

export function getSpeechRecognitionCtor(scope: unknown = typeof window === 'undefined' ? undefined : window): SpeechRecognitionCtor | null {
  const w = scope as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor } | undefined;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
}

// Everything heard so far in one session (final and interim), as one line of text.
export function transcriptFromEvent(event: SpeechEventLike): string {
  return Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').replace(/\s+/g, ' ').trim();
}

// The text already in the box when listening began, plus what has been heard. Kept within the composer's limit.
export function mergeDictation(base: string, heard: string): string {
  const spoken = heard.trim();
  if (!spoken) return base;
  const joined = base.trim() ? `${base.replace(/\s+$/, '')} ${spoken}` : spoken;
  return joined.slice(0, MAX_QUESTION_LENGTH);
}

// Plain-language reason for a recognition error; null for the ones that need no message (the person stopped it).
export function voiceErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed': return 'Microphone access is blocked. Allow it in your browser settings to dictate.';
    case 'audio-capture': return 'No microphone was found.';
    case 'network': return 'Voice input needs a connection. You can still type your question.';
    case 'no-speech': return 'No speech was heard. Try again.';
    case 'aborted': return null;
    default: return 'Voice input stopped. You can still type your question.';
  }
}

// UX-08 (consolidated plan 4B): continuous dictation. A pause no longer ends the session; it ends on the person's manual stop, after a
// bounded stretch of silence, or on a real error. Browsers end a continuous session on their own from time to time, so the controller
// restarts it and carries only text already marked final across the restart, which is what keeps one spoken phrase from being typed twice.
export const DICTATION_SILENCE_MS = 8000;
const MAX_EMPTY_RESTARTS = 3;
const MAX_RESTARTS = 30;

// Only the segments the recognizer has marked final, as one line of text.
export function finalTranscriptFromEvent(event: SpeechEventLike): string {
  return Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0]?.transcript ?? '').join(' ').replace(/\s+/g, ' ').trim();
}

export type DictationState = 'IDLE' | 'LISTENING';
export interface DictationOptions {
  create: () => SpeechRecognitionLike;
  lang: string;
  /** The text in the box when dictation starts. */
  getBase: () => string;
  onText: (value: string) => void;
  onState: (state: DictationState) => void;
  /** A plain-language reason shown to the person, or null to clear it. */
  onMessage: (message: string | null) => void;
  silenceMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class DictationController {
  private recognition: SpeechRecognitionLike | null = null;
  private base = '';
  private wanted = false;
  private heardThisSession = false;
  private emptyRestarts = 0;
  private restarts = 0;
  private silenceTimer: unknown = null;
  private lastFinal = '';
  constructor(private readonly options: DictationOptions) {}

  get listening(): boolean { return this.wanted; }

  start(): void {
    if (this.wanted) return;
    this.base = this.options.getBase();
    this.wanted = true;
    this.emptyRestarts = 0;
    this.restarts = 0;
    this.options.onMessage(null);
    if (!this.beginSession()) { this.finish(voiceErrorMessage(undefined)); return; }
    this.options.onState('LISTENING');
    this.armSilence();
  }

  /** The person's manual stop: keeps everything heard so far in the box. */
  stop(): void {
    if (!this.wanted) return;
    this.wanted = false;
    this.clearSilence();
    try { this.recognition?.stop(); } catch { /* already stopped */ }
    this.options.onState('IDLE');
  }

  /** Teardown (unmount): no further callbacks matter. */
  abort(): void {
    this.wanted = false;
    this.clearSilence();
    const current = this.recognition;
    this.recognition = null;
    try { current?.abort(); } catch { /* already stopped */ }
  }

  private beginSession(): boolean {
    let next: SpeechRecognitionLike;
    try {
      next = this.options.create();
      next.lang = this.options.lang;
      next.continuous = true;
      next.interimResults = true;
      this.heardThisSession = false;
      this.lastFinal = '';
      next.onresult = (event) => {
        if (this.recognition !== next || !this.wanted) return;
        this.heardThisSession = true;
        this.emptyRestarts = 0;
        this.lastFinal = finalTranscriptFromEvent(event);
        this.options.onText(mergeDictation(this.base, transcriptFromEvent(event)));
        this.armSilence();
      };
      next.onerror = (event) => {
        if (this.recognition !== next) return;
        // "No speech" and "aborted" are part of normal continuous use: the end handler decides whether to carry on.
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        this.finish(voiceErrorMessage(event.error));
      };
      next.onend = () => {
        if (this.recognition !== next) return;
        this.recognition = null;
        if (!this.wanted) { this.options.onState('IDLE'); return; }
        // Browser ended the session by itself: carry the final text forward and listen again, within bounds.
        this.base = mergeDictation(this.base, this.lastFinal);
        if (!this.heardThisSession) this.emptyRestarts += 1;
        this.restarts += 1;
        if (this.emptyRestarts > MAX_EMPTY_RESTARTS || this.restarts > MAX_RESTARTS || !this.beginSession()) {
          this.finish(this.heardThisSession || this.base.trim() ? null : voiceErrorMessage('no-speech'));
        }
      };
      this.recognition = next;
      next.start();
      return true;
    } catch {
      this.recognition = null;
      return false;
    }
  }

  private finish(message: string | null): void {
    this.wanted = false;
    this.clearSilence();
    const current = this.recognition;
    this.recognition = null;
    try { current?.abort(); } catch { /* already stopped */ }
    this.options.onMessage(message);
    this.options.onState('IDLE');
  }

  private armSilence(): void {
    this.clearSilence();
    const set = this.options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.silenceTimer = set(() => { this.silenceTimer = null; this.stop(); }, this.options.silenceMs ?? DICTATION_SILENCE_MS);
  }

  private clearSilence(): void {
    if (this.silenceTimer === null) return;
    (this.options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)))(this.silenceTimer);
    this.silenceTimer = null;
  }
}
