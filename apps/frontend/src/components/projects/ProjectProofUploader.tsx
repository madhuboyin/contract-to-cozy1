'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

export type ProjectProof = {
  proofKey: string;
  documentId: string;
  type: 'INVOICE' | 'PERMIT' | 'PHOTO' | 'OTHER';
  name: string;
  kind: 'PHOTO' | 'RECEIPT' | 'INVOICE' | 'PDF' | 'BEFORE' | 'AFTER' | 'OTHER';
};

const PROOF_KINDS: Array<{ proofKey: string; label: string; type: ProjectProof['type']; kind: ProjectProof['kind'] }> = [
  { proofKey: 'invoice', label: 'Final invoice', type: 'INVOICE', kind: 'INVOICE' },
  { proofKey: 'warranty', label: 'Warranty', type: 'OTHER', kind: 'PDF' },
  { proofKey: 'permit', label: 'Permit / inspection', type: 'PERMIT', kind: 'PDF' },
  { proofKey: 'before-photo', label: 'Before photo', type: 'PHOTO', kind: 'BEFORE' },
  { proofKey: 'after-photo', label: 'After photo', type: 'PHOTO', kind: 'AFTER' },
  { proofKey: 'completion-record', label: 'Completion record', type: 'OTHER', kind: 'PDF' },
];

export function ProjectProofUploader({ propertyId, value, onChange }: {
  propertyId: string;
  value: ProjectProof[];
  onChange: (proofs: ProjectProof[]) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(proof: typeof PROOF_KINDS[number], file?: File) {
    if (!file) return;
    setUploading(proof.proofKey);
    setError(null);
    try {
      const response = await api.uploadDocument(file, {
        propertyId,
        type: proof.type,
        name: proof.label,
        description: `Project completion proof: ${proof.label}`,
      });
      if (!response.success || !('data' in response) || !response.data?.id) throw new Error('Upload did not return a document ID.');
      const next: ProjectProof = { proofKey: proof.proofKey, documentId: response.data.id, type: proof.type, name: proof.label, kind: proof.kind };
      onChange([...value.filter((item) => item.proofKey !== proof.proofKey), next]);
    } catch (uploadError: any) {
      setError(uploadError?.message ?? `Failed to upload ${proof.label}.`);
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {PROOF_KINDS.map((proof) => {
          const uploaded = value.some((item) => item.proofKey === proof.proofKey);
          return (
            <label key={proof.proofKey} className="flex min-h-[48px] cursor-pointer items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                {uploading === proof.proofKey ? <Loader2 className="h-4 w-4 animate-spin" /> : uploaded ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Upload className="h-4 w-4 text-slate-500" />}
                {proof.label}
              </span>
              <span className="text-xs font-medium text-indigo-700">{uploaded ? 'Replace' : 'Upload'}</span>
              <input type="file" accept="image/*,.pdf" className="hidden" disabled={Boolean(uploading)} onChange={(event) => upload(proof, event.target.files?.[0])} />
            </label>
          );
        })}
      </div>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {value.length ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>Clear uploaded proof</Button> : null}
    </div>
  );
}
