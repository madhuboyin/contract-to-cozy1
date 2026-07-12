'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { api } from '@/lib/api/client';

type AddressValue = { address: string; city: string; state: string; zipCode: string };
type Suggestion = { placeId: string; label: string };

interface AddressAutocompleteProps {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  inputClassName: string;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

function newSessionToken() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function AddressAutocomplete({
  value,
  onChange,
  inputClassName,
  label = 'Street Address',
  placeholder = '123 Main St',
  autoFocus = false,
}: AddressAutocompleteProps) {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const sessionToken = useRef(newSessionToken());
  const requestSequence = useRef(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  useEffect(() => {
    const query = value.address.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setServiceUnavailable(false);
      return;
    }

    const sequence = ++requestSequence.current;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await api.suggestAddresses(query, sessionToken.current);
        if (sequence !== requestSequence.current) return;
        const next = response.success ? response.data || [] : [];
        setServiceUnavailable(!response.success);
        setSuggestions(next);
        setOpen(next.length > 0);
        setActiveIndex(-1);
      } catch {
        if (sequence === requestSequence.current) {
          setSuggestions([]);
          setOpen(false);
          setServiceUnavailable(true);
        }
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [value.address]);

  const selectSuggestion = async (suggestion: Suggestion) => {
    setLoading(true);
    setOpen(false);
    requestSequence.current += 1;
    try {
      const response = await api.getAddressDetails(suggestion.placeId, sessionToken.current);
      if (response.success && response.data) onChange(response.data);
      sessionToken.current = newSessionToken();
      setSuggestions([]);
    } catch {
      // Keep the user's text untouched; manual entry remains available.
      setServiceUnavailable(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={value.address}
          onChange={(event) => onChange({ ...value, address: event.target.value })}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (!open || suggestions.length === 0) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % suggestions.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
            } else if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault();
              void selectSuggestion(suggestions[activeIndex]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          required
          placeholder={placeholder}
          autoComplete="street-address"
          autoFocus={autoFocus}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          className={inputClassName}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
      </div>
      {serviceUnavailable && (
        <p role="status" className="text-xs text-amber-700">
          Address suggestions are unavailable. Continue entering the address manually.
        </p>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {suggestions.map((suggestion, index) => (
              <li
                id={`${listId}-${index}`}
                key={suggestion.placeId}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void selectSuggestion(suggestion)}
                className={`flex cursor-pointer items-start gap-2 px-3 py-2.5 text-left text-sm ${index === activeIndex ? 'bg-teal-50 text-teal-950' : 'text-slate-700'}`}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{suggestion.label}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-slate-100 px-3 py-1.5">
            <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" className="h-3.5 w-auto" />
          </div>
        </div>
      )}
    </div>
  );
}
