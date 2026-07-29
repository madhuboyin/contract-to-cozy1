'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api/client';

interface Props {
  propertyId: string;
  initialPrompt?: string;
  onGuideStarted: (guideId: string) => void;
  onClose: () => void;
}

export default function AiGuideSheet({ propertyId, initialPrompt = '', onGuideStarted, onClose }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim().length < 10) { setError('Please describe your project in at least 10 characters.'); return; }
    setLoading(true);
    setError(null);
    try {
      const { guideId } = await api.generateDiyAiGuide(propertyId, prompt.trim());
      onGuideStarted(guideId);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to start generation');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-semibold">Describe Your Project</p>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-neutral-500">
          Tell us what you&apos;d like to tackle and we&apos;ll generate a step-by-step guide tailored to your home.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            rows={4}
            placeholder="e.g. Replace the faucet in my master bathroom…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full resize-none rounded-xl border px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={1000}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || prompt.trim().length < 10}
            className="w-full rounded-xl bg-[hsl(var(--mobile-brand-strong))] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Generating guide…' : 'Generate Guide'}
          </button>
        </form>
      </div>
    </div>
  );
}
