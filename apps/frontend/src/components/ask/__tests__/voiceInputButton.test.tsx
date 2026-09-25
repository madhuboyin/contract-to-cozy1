/** @jest-environment jsdom */
import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VoiceInputButton } from '../VoiceInputButton';
import { getSpeechRecognitionCtor, mergeDictation, transcriptFromEvent, voiceErrorMessage, MAX_QUESTION_LENGTH } from '@/features/ask/voiceInput';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = ''; continuous = true; interimResults = false; started = false; stopped = false; aborted = false;
  onresult: ((event: any) => void) | null = null; onerror: ((event: any) => void) | null = null; onend: (() => void) | null = null;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; }
  stop() { this.stopped = true; this.onend?.(); }
  abort() { this.aborted = true; }
  hear(...parts: Array<[string, boolean]>) { this.onresult?.({ results: parts.map(([transcript, isFinal]) => ({ 0: { transcript }, isFinal })) }); }
}

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState('Is my');
  return <><output data-testid="box">{value}</output><VoiceInputButton getValue={() => value} onChange={setValue} disabled={disabled} /></>;
}

beforeEach(() => { FakeRecognition.instances = []; (window as any).SpeechRecognition = FakeRecognition; });
afterEach(() => { delete (window as any).SpeechRecognition; delete (window as any).webkitSpeechRecognition; });

describe('voice input helpers', () => {
  it('finds the standard or prefixed constructor, or none', () => {
    expect(getSpeechRecognitionCtor({})).toBeNull();
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(getSpeechRecognitionCtor({ SpeechRecognition: FakeRecognition, webkitSpeechRecognition: class {} as any })).toBe(FakeRecognition);
  });
  it('joins everything heard, appends it to the existing text, and respects the limit', () => {
    expect(transcriptFromEvent({ results: [{ 0: { transcript: ' furnace ' } }, { 0: { transcript: 'is old' } }] })).toBe('furnace is old');
    expect(mergeDictation('Is my', 'furnace ok')).toBe('Is my furnace ok');
    expect(mergeDictation('', 'furnace')).toBe('furnace');
    expect(mergeDictation('keep this', '  ')).toBe('keep this');
    expect(mergeDictation('a'.repeat(MAX_QUESTION_LENGTH - 2), 'bbbbb')).toHaveLength(MAX_QUESTION_LENGTH);
  });
  it('explains errors, and stays quiet when the person stopped it', () => {
    expect(voiceErrorMessage('not-allowed')).toMatch(/blocked/);
    expect(voiceErrorMessage('network')).toMatch(/connection/);
    expect(voiceErrorMessage('aborted')).toBeNull();
    expect(voiceErrorMessage('weird')).toMatch(/still type/);
  });
});

describe('VoiceInputButton', () => {
  it('renders nothing where speech recognition is missing', () => {
    delete (window as any).SpeechRecognition;
    render(<Harness />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('dictates into the box after the existing text, live, and never sends', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Dictate your question' }));
    const rec = FakeRecognition.instances[0];
    expect(rec.started).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.continuous).toBe(false);
    expect(screen.getByRole('button', { name: 'Stop dictation' })).toHaveAttribute('aria-pressed', 'true');
    act(() => rec.hear(['furnace', false]));
    expect(screen.getByTestId('box').textContent).toBe('Is my furnace');
    act(() => rec.hear(['furnace still', true]));
    expect(screen.getByTestId('box').textContent).toBe('Is my furnace still');
    act(() => rec.onend?.());
    expect(screen.getByRole('button', { name: 'Dictate your question' })).toBeInTheDocument();
    expect(screen.getByTestId('box').textContent).toBe('Is my furnace still');
  });

  it('stops on the second press and shows a plain message on an error', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Dictate your question' }));
    const rec = FakeRecognition.instances[0];
    fireEvent.click(screen.getByRole('button', { name: 'Stop dictation' }));
    expect(rec.stopped).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Dictate your question' }));
    const second = FakeRecognition.instances[1];
    act(() => { second.onerror?.({ error: 'not-allowed' }); second.onend?.(); });
    expect(document.querySelector('[data-ask-voice-message]')?.textContent).toMatch(/Microphone access is blocked/);
  });

  it('is disabled while a question is running, and aborts on unmount', () => {
    const { rerender, unmount } = render(<Harness disabled />);
    expect(screen.getByRole('button', { name: 'Dictate your question' })).toBeDisabled();
    rerender(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Dictate your question' }));
    const rec = FakeRecognition.instances[0];
    unmount();
    expect(rec.aborted).toBe(true);
  });
});
