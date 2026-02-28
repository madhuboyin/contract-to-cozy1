import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── UI stubs ──────────────────────────────────────────────────────────────────
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, type, disabled }: any) => (
    <button onClick={onClick} type={type} disabled={disabled}>{children}</button>
  ),
}));
jest.mock('@/components/ui/label', () => ({ Label: ({ children }: any) => <label>{children}</label> }));
jest.mock('@/components/ui/input', () => ({
  Input: ({ id, type, value, onChange, required }: any) => (
    <input id={id} type={type} value={value} onChange={onChange} required={required} />
  ),
}));
jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ id, value, onChange, rows }: any) => (
    <textarea id={id} value={value} onChange={onChange} rows={rows} />
  ),
}));
jest.mock('@/components/ui/radio-group', () => ({
  RadioGroup: ({ children, value, onValueChange }: any) => (
    <div data-value={value} onClick={(e: any) => onValueChange?.((e.target as any).value)}>{children}</div>
  ),
  RadioGroupItem: ({ value, id }: any) => <input type="radio" value={value} id={id} />,
}));
jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ id, checked, onCheckedChange }: any) => (
    <input type="checkbox" id={id} checked={checked} onChange={onCheckedChange} />
  ),
}));
jest.mock('lucide-react', () => ({
  Loader2: () => <span>Loading</span>,
  CheckCircle2: () => <span>Done</span>,
  Lock: () => <span>Lock</span>,
}));
jest.mock('@tanstack/react-query', () => ({
  useMutation: ({ mutationFn, onError }: any) => ({
    mutate: jest.fn((data: any) => mutationFn(data).catch((err: any) => onError?.(err))),
    isPending: false,
  }),
}));
jest.mock('@/lib/api/client', () => ({ api: { createSellerPrepLead: jest.fn() } }));

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { LeadCaptureModal } from '../LeadCaptureModal';

function fillContactFields(name = 'Jane Doe', email = 'jane@example.com', phone = '555-867-5309') {
  fireEvent.change(screen.getByDisplayValue(''), { target: { value: name } }); // fullName
  // target by id for precision
  fireEvent.change(document.getElementById('fullName')!, { target: { value: name } });
  fireEvent.change(document.getElementById('email')!, { target: { value: email } });
  fireEvent.change(document.getElementById('phone')!, { target: { value: phone } });
}

function renderModal(props = {}) {
  return render(
    <LeadCaptureModal
      propertyId="prop-1"
      open={true}
      onClose={jest.fn()}
      leadType="AGENT"
      {...props}
    />
  );
}

// ── Bug 7: Phone validation ───────────────────────────────────────────────────
describe('LeadCaptureModal — phone validation (Bug 7)', () => {
  beforeEach(() => mockToast.mockClear());

  it('rejects a non-numeric phone value and shows an error toast', async () => {
    renderModal();

    fireEvent.change(document.getElementById('fullName')!, { target: { value: 'Jane Doe' } });
    fireEvent.change(document.getElementById('email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(document.getElementById('phone')!, { target: { value: 'abc' } });

    fireEvent.click(screen.getByText('Get Free Quotes'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Invalid phone number', variant: 'destructive' })
      );
    });
  });

  it('rejects a phone number that is too short', async () => {
    renderModal();

    fireEvent.change(document.getElementById('fullName')!, { target: { value: 'Jane Doe' } });
    fireEvent.change(document.getElementById('email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(document.getElementById('phone')!, { target: { value: '123' } });

    fireEvent.click(screen.getByText('Get Free Quotes'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Invalid phone number', variant: 'destructive' })
      );
    });
  });

  it('accepts a valid US phone number', async () => {
    renderModal();

    fireEvent.change(document.getElementById('fullName')!, { target: { value: 'Jane Doe' } });
    fireEvent.change(document.getElementById('email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(document.getElementById('phone')!, { target: { value: '555-867-5309' } });

    fireEvent.click(screen.getByText('Get Free Quotes'));

    await waitFor(() => {
      const invalidPhoneCalls = mockToast.mock.calls.filter(
        ([arg]) => arg?.title === 'Invalid phone number'
      );
      expect(invalidPhoneCalls).toHaveLength(0);
    });
  });

  it('accepts an international phone number with + prefix', async () => {
    renderModal();

    fireEvent.change(document.getElementById('fullName')!, { target: { value: 'Jane Doe' } });
    fireEvent.change(document.getElementById('email')!, { target: { value: 'jane@example.com' } });
    fireEvent.change(document.getElementById('phone')!, { target: { value: '+44 7700 900123' } });

    fireEvent.click(screen.getByText('Get Free Quotes'));

    await waitFor(() => {
      const invalidPhoneCalls = mockToast.mock.calls.filter(
        ([arg]) => arg?.title === 'Invalid phone number'
      );
      expect(invalidPhoneCalls).toHaveLength(0);
    });
  });
});
