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
