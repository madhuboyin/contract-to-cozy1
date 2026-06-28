'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Upload } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import {
  MobileCard,
  MobilePageContainer,
} from '@/components/mobile/dashboard/MobilePrimitives';
import DetailTemplate from '../../components/route-templates/DetailTemplate';

const REPORT_TYPES = [
  { value: 'GENERAL', label: 'General Home Inspection' },
  { value: 'PRE_PURCHASE', label: 'Pre-Purchase Inspection' },
  { value: 'PRE_LISTING', label: 'Pre-Listing Inspection' },
  { value: 'ANNUAL', label: 'Annual / Maintenance' },
  { value: 'ROOF', label: 'Roof Inspection' },
  { value: 'HVAC', label: 'HVAC Inspection' },
  { value: 'SEWER', label: 'Sewer Scope' },
  { value: 'ELECTRICAL', label: 'Electrical Inspection' },
  { value: 'FOUNDATION', label: 'Foundation / Structural' },
  { value: 'OTHER', label: 'Other' },
];

export default function UploadInspectionReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const propertyId = params.id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reportType, setReportType] = useState('GENERAL');
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [inspectorName, setInspectorName] = useState('');
  const [inspectorLicense, setInspectorLicense] = useState('');
  const [inspectorCompany, setInspectorCompany] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') setFile(dropped);
    else setError('Only PDF files are accepted.');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a PDF file.'); return; }
    setUploading(true);
    setError(null);
    try {
      const { reportId } = await api.uploadInspectionReport(propertyId, file, {
        reportType,
        inspectionDate: new Date(inspectionDate).toISOString(),
        inspectorName: inspectorName || undefined,
        inspectorLicense: inspectorLicense || undefined,
        inspectorCompany: inspectorCompany || undefined,
      });
      router.push(`/dashboard/properties/${propertyId}/inspection-hub/${reportId}`);
    } catch (e: any) {
      setError(e?.message ?? 'Upload failed. Please try again.');
      setUploading(false);
    }
  }

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-2xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/inspection-hub`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Inspection Hub
        </Link>
      </Button>

      <DetailTemplate
        title="Upload Inspection Report"
        subtitle="Upload a PDF and AI will extract every finding into structured, trackable records."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Drop zone */}
          <div
            className={`rounded-2xl cursor-pointer border-2 border-dashed transition-colors ${
              dragOver ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              {file ? (
                <>
                  <FileText className="h-10 w-10 text-emerald-500" />
                  <p className="text-sm font-medium text-emerald-800">{file.name}</p>
                  <p className="text-xs text-emerald-600">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700">Drop PDF here or tap to browse</p>
                  <p className="text-xs text-slate-500">Up to 200 MB · PDF only</p>
                </>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
            }}
          />

          {/* Metadata */}
          <MobileCard className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Report Type *</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                required
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Inspection Date *</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Inspector Name</label>
                <input
                  type="text"
                  placeholder="Optional"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Company</label>
                <input
                  type="text"
                  placeholder="Optional"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={inspectorCompany}
                  onChange={(e) => setInspectorCompany(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Inspector License #</label>
              <input
                type="text"
                placeholder="Optional"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={inspectorLicense}
                onChange={(e) => setInspectorLicense(e.target.value)}
              />
            </div>
          </MobileCard>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
          )}

          {uploading && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-2">
              <p className="font-medium">Processing your report…</p>
              <div className="space-y-1 text-xs text-blue-700">
                <p>Reading report structure → Extracting findings → Estimating costs → Cross-referencing your home data</p>
              </div>
              <div className="flex gap-1 mt-2">
                {[0,1,2].map((i) => (
                  <div key={i} className="h-1.5 flex-1 rounded-full bg-blue-200 overflow-hidden">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500" style={{ animationDelay: `${i * 0.2}s` }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full min-h-[48px] text-base"
            disabled={!file || uploading}
          >
            {uploading ? 'Analyzing report…' : 'Upload and Analyze'}
          </Button>
        </form>
      </DetailTemplate>
    </MobilePageContainer>
  );
}
