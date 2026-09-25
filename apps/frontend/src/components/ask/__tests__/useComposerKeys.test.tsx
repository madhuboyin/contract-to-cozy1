/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { useComposerKeys } from '../workspace/useComposerKeys';

const key = (overrides: Record<string, unknown> = {}) => ({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault: jest.fn(), ...overrides }) as any;

function setup(input = 'Is my roof ok?') {
  const ask = jest.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => useComposerKeys({ input, ask }));
  return { hook, ask };
}

describe('useComposerKeys', () => {
  it('Enter sends the question and stops the newline', () => {
    const { hook, ask } = setup();
    const event = key();
    hook.result.current.keyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(ask).toHaveBeenCalledWith('Is my roof ok?');
  });

  it('Shift+Enter, other keys, and Enter while an input method is composing do not send', () => {
    const { hook, ask } = setup();
    for (const event of [key({ shiftKey: true }), key({ key: 'a' }), key({ nativeEvent: { isComposing: true } })]) {
      hook.result.current.keyDown(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    hook.result.current.isComposingRef.current = true;
    const event = key();
    hook.result.current.keyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    hook.result.current.isComposingRef.current = false;
    hook.result.current.keyDown(key());
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('submitting the form sends the question without a page reload', () => {
    const { hook, ask } = setup('Hello');
    const event = { preventDefault: jest.fn() } as any;
    hook.result.current.submit(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(ask).toHaveBeenCalledWith('Hello');
  });
});
