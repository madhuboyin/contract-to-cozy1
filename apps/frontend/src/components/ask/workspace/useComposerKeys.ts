import { useRef, type FormEvent, type KeyboardEvent } from 'react';

// The composer's send handling: the form submit, and Enter to send (not Shift+Enter, and not while an input method is
// composing). Moved out of AskWorkspace unchanged (P2, FRD v1.109).
export function useComposerKeys({ input, ask }: { input: string; ask: (question: string) => Promise<void> }) {
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(input); };
  // Relying only on event.nativeEvent.isComposing is unreliable across
  // browsers (Safari in particular can report it as already false by the
  // time the confirming Enter keydown fires), so composition state is
  // also tracked explicitly via onCompositionStart/End. Without this,
  // pressing Enter to commit an IME candidate (CJK and other composed
  // input) sent the half-typed question instead of just committing it.
  const isComposingRef = useRef(false);
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isComposingRef.current && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(input);
    }
  };

  return { submit, keyDown, isComposingRef };
}
