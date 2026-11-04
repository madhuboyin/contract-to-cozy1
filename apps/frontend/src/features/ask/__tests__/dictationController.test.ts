import { DictationController, finalTranscriptFromEvent, type SpeechEventLike, type SpeechRecognitionLike } from '../voiceInput';

// UX-08 (consolidated plan 4B): continuous dictation state machine, with no browser speech engine involved.
class Fake implements SpeechRecognitionLike {
  static instances: Fake[] = [];
  lang = ''; continuous = false; interimResults = false;
  onresult: SpeechRecognitionLike['onresult'] = null; onerror: SpeechRecognitionLike['onerror'] = null; onend: SpeechRecognitionLike['onend'] = null;
  started = false; stopped = false; aborted = false;
  constructor() { Fake.instances.push(this); }
  start() { this.started = true; } stop() { this.stopped = true; } abort() { this.aborted = true; }
  hear(...segments: Array<[string, boolean]>) { this.onresult?.({ results: segments.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })) } as SpeechEventLike); }
}

function setup(base = 'Is my') {
  Fake.instances = [];
  const texts: string[] = []; const states: string[] = []; const messages: Array<string | null> = [];
  let timer: (() => void) | null = null;
  const controller = new DictationController({
    create: () => new Fake(), lang: 'en-US', getBase: () => base,
    onText: (value) => texts.push(value), onState: (state) => states.push(state), onMessage: (message) => messages.push(message),
    setTimer: (callback) => { timer = callback; return 1; }, clearTimer: () => { timer = null; },
  });
  return { controller, texts, states, messages, fireSilence: () => timer?.(), hasTimer: () => timer !== null };
}

describe('DictationController', () => {
  it('keeps listening through a pause, a browser-ended session, and never types a final phrase twice', () => {
    const { controller, texts, states } = setup();
    controller.start();
    const first = Fake.instances[0];
    expect(first.continuous).toBe(true);
    first.hear(['furnace', true], ['still', false]);
    expect(texts.at(-1)).toBe('Is my furnace still');
    first.onend?.();
    expect(Fake.instances).toHaveLength(2);
    expect(states).toEqual(['LISTENING']);
    // The new session starts from the text already final; the unfinished word is not carried, so it cannot be duplicated.
    Fake.instances[1].hear(['works', true]);
    expect(texts.at(-1)).toBe('Is my furnace works');
    controller.stop();
    expect(states.at(-1)).toBe('IDLE');
  });

  it('stops on the manual stop and keeps what was heard; a later end event does not restart', () => {
    const { controller, texts } = setup('');
    controller.start();
    Fake.instances[0].hear(['hello there', true]);
    controller.stop();
    expect(Fake.instances[0].stopped).toBe(true);
    Fake.instances[0].onend?.();
    expect(Fake.instances).toHaveLength(1);
    expect(texts.at(-1)).toBe('hello there');
  });

  it('stops after the bounded silence, and re-arms the timer whenever something is heard', () => {
    const { controller, states, fireSilence, hasTimer } = setup();
    controller.start();
    expect(hasTimer()).toBe(true);
    Fake.instances[0].hear(['hi', false]);
    expect(hasTimer()).toBe(true);
    fireSilence();
    expect(Fake.instances[0].stopped).toBe(true);
    expect(states.at(-1)).toBe('IDLE');
    expect(controller.listening).toBe(false);
  });

  it('reports a blocked microphone and stops instead of looping', () => {
    const { controller, states, messages } = setup();
    controller.start();
    Fake.instances[0].onerror?.({ error: 'not-allowed' });
    expect(messages.at(-1)).toMatch(/blocked/);
    expect(states.at(-1)).toBe('IDLE');
    Fake.instances[0].onend?.();
    expect(Fake.instances).toHaveLength(1);
  });

  it('treats no-speech as normal in continuous use but gives up after a few empty restarts', () => {
    const { controller, states, messages } = setup('');
    controller.start();
    for (let i = 0; i < 6 && controller.listening; i += 1) {
      const current = Fake.instances.at(-1)!;
      current.onerror?.({ error: 'no-speech' });
      current.onend?.();
    }
    expect(controller.listening).toBe(false);
    expect(states.at(-1)).toBe('IDLE');
    expect(messages.at(-1)).toMatch(/No speech/);
    expect(Fake.instances.length).toBeLessThanOrEqual(5);
  });

  it('ignores callbacks from an abandoned session', () => {
    const { controller, texts } = setup();
    controller.start();
    const first = Fake.instances[0];
    controller.abort();
    first.hear(['late words', true]);
    expect(texts).toHaveLength(0);
  });

  it('reads only final segments for the carried text', () => {
    expect(finalTranscriptFromEvent({ results: [{ isFinal: true, 0: { transcript: ' a ' } }, { isFinal: false, 0: { transcript: 'b' } }, { isFinal: true, 0: { transcript: 'c' } }] })).toBe('a c');
  });
});
