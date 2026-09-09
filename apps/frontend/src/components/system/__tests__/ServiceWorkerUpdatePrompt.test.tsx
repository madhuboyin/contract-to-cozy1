/**
 * C3 (F9): the SW update prompt is a dismissible toast, not a blocking
 * window.confirm(). This component listens for SW_UPDATE_READY_EVENT and raises
 * a toast whose action reloads the page.
 */

import { render } from '@testing-library/react';
import { ServiceWorkerUpdatePrompt } from '@/components/system/ServiceWorkerUpdatePrompt';
import { SW_UPDATE_READY_EVENT } from '@/lib/pwa';
import { toast } from '@/components/ui/use-toast';

jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));

const mockedToast = toast as jest.Mock;

describe('ServiceWorkerUpdatePrompt', () => {
  beforeEach(() => mockedToast.mockClear());

  it('does not toast until an update is announced', () => {
    render(<ServiceWorkerUpdatePrompt />);
    expect(mockedToast).not.toHaveBeenCalled();
  });

  it('raises a reload toast when SW_UPDATE_READY_EVENT fires', () => {
    render(<ServiceWorkerUpdatePrompt />);

    window.dispatchEvent(new CustomEvent(SW_UPDATE_READY_EVENT));

    expect(mockedToast).toHaveBeenCalledTimes(1);
    const arg = mockedToast.mock.calls[0][0];
    expect(arg.title).toBe('Update available');
    expect(arg.action.props.altText).toMatch(/reload/i);

    const reloadSpy = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
    arg.action.props.onClick();
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('stops listening after unmount', () => {
    const { unmount } = render(<ServiceWorkerUpdatePrompt />);
    unmount();

    window.dispatchEvent(new CustomEvent(SW_UPDATE_READY_EVENT));

    expect(mockedToast).not.toHaveBeenCalled();
  });
});
