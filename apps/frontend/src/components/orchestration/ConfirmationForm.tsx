'use client';

import React, { useState } from 'react';
import { CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ConfidenceBadge } from '@/components/trust';
import { cn } from '@/lib/utils';

interface ExtractionData {
  productName?: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
}

interface ConfirmationFormProps {
  initialData: ExtractionData;
  confidence: number;
  onConfirm: (finalData: ExtractionData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ConfirmationForm({
  initialData,
  confidence,
  onConfirm,
  onCancel,
  isSubmitting = false
}: ConfirmationFormProps) {
  const [formData, setFormData] = useState<ExtractionData>({
    productName: initialData.productName || '',
    manufacturer: initialData.manufacturer || '',
    modelNumber: initialData.modelNumber || '',
    serialNumber: initialData.serialNumber || '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const isLowConfidence = confidence < 0.8;

  return (
    <div className="space-y-6 px-6 py-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-slate-900">Review Extraction</h3>
          <ConfidenceBadge level={confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'low'} score={Math.round(confidence * 100)} />
        </div>
        <p className="text-sm text-slate-500">
          {isLowConfidence 
            ? "Some details were hard to read. Please verify the fields below." 
            : "We've extracted these details from your photo. Do they look correct?"}
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
        <div className="space-y-2">
          <Label htmlFor="productName" className="text-[10px] font-bold tracking-normal text-slate-400">Item Name</Label>
          <Input 
            id="productName" 
            name="productName" 
            value={formData.productName} 
            onChange={handleChange}
            placeholder="e.g. Dishwasher"
            className="h-11 rounded-xl bg-white border-slate-200"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="manufacturer" className="text-[10px] font-bold tracking-normal text-slate-400">Brand</Label>
            <Input 
              id="manufacturer" 
              name="manufacturer" 
              value={formData.manufacturer} 
              onChange={handleChange}
              placeholder="e.g. Bosch"
              className="h-11 rounded-xl bg-white border-slate-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="modelNumber" className="text-[10px] font-bold tracking-normal text-slate-400">Model #</Label>
            <Input 
              id="modelNumber" 
              name="modelNumber" 
              value={formData.modelNumber} 
              onChange={handleChange}
              placeholder="Model number"
              className="h-11 rounded-xl bg-white border-slate-200 font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="serialNumber" className="text-[10px] font-bold tracking-normal text-slate-400">Serial #</Label>
          <Input 
            id="serialNumber" 
            name="serialNumber" 
            value={formData.serialNumber} 
            onChange={handleChange}
            placeholder="Serial number"
            className="h-11 rounded-xl bg-white border-slate-200 font-mono text-xs"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <Button 
          onClick={() => onConfirm(formData)} 
          className="h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving to Vault..." : "Confirm & Secure in Vault"}
        </Button>
        <Button 
          variant="ghost" 
          onClick={onCancel} 
          className="text-slate-500 font-medium"
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>

      <div className="bg-emerald-50 p-4 rounded-xl flex items-start gap-3 border border-emerald-100">
        <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        <p className="text-[11px] text-emerald-800 leading-relaxed">
          <span className="font-bold block mb-0.5 text-emerald-900">Verified by Gemini AI</span>
          Confirming these details helps us track your warranties and find potential savings.
        </p>
      </div>
    </div>
  );
}
