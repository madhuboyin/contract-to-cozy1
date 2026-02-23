'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, Plus, X } from 'lucide-react';

type InlineValueEditorProps = {
  itemId: string;
  onSave: (value: number) => Promise<void>;
};

export default function InlineValueEditor({ itemId, onSave }: InlineValueEditorProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  async function handleSave() {
    const numeric = parseFloat(inputValue.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setEditing(false);
      setInputValue('');
      return;
    }

    setSaving(true);
    try {
      await onSave(numeric);
    } finally {
      setSaving(false);
      setEditing(false);
      setInputValue('');
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {editing ? (
        <motion.div
          key={`${itemId}-editing`}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 'auto', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSave();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setEditing(false);
                  setInputValue('');
                }
              }}
              placeholder="0"
              className="w-24 rounded-lg border border-teal-400 py-1 pl-5 pr-2 text-sm outline-none ring-1 ring-teal-300 focus:ring-teal-400"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-teal-600 p-1 text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            aria-label="Save value"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setInputValue('');
            }}
            className="p-1 text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Cancel value edit"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      ) : (
        <motion.button
          key={`${itemId}-trigger`}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.15 }}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setEditing(true);
          }}
          className="group flex items-center gap-1 text-xs font-medium text-teal-600 underline-offset-2 transition-colors hover:text-teal-700 hover:underline"
        >
          <Plus className="h-3 w-3 transition-transform group-hover:scale-110" />
          Add value
        </motion.button>
      )}
    </AnimatePresence>
  );
}
