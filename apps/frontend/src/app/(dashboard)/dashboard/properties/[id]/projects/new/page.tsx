'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  MobileCard,
  MobilePageContainer,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { PROJECT_TYPE_OPTIONS, ErrorBanner } from '../ProjectTrackerHelpers';

export default function NewProjectPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    projectType: 'CUSTOM',
    contractorName: '',
    contractorPhone: '',
    contractorLicense: '',
    contractorEmail: '',
    contractAmountCents: '',
    startDate: new Date().toISOString().split('T')[0],
    expectedEndDate: '',
  });

  const set = (field: string, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const toInt = (s: string) => {
    const v = parseFloat(s.replace(/[^0-9.]/g, ''));
    return isNaN(v) ? undefined : Math.round(v * 100);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Project name is required'); return; }
    if (!form.contractorName.trim()) { setError('Contractor name is required'); return; }
    if (!form.contractAmountCents) { setError('Contract amount is required'); return; }
    const amtCents = toInt(form.contractAmountCents);
    if (!amtCents || amtCents <= 0) { setError('Enter a valid contract amount'); return; }
    if (!form.startDate) { setError('Start date is required'); return; }

    setSaving(true);
    try {
      const project = await api.createProject(propertyId, {
        name: form.name.trim(),
        projectType: form.projectType,
        contractorName: form.contractorName.trim(),
        contractorPhone: form.contractorPhone.trim() || undefined,
        contractorLicense: form.contractorLicense.trim() || undefined,
        contractorEmail: form.contractorEmail.trim() || undefined,
        contractAmountCents: amtCents,
        startDate: form.startDate,
        expectedEndDate: form.expectedEndDate || undefined,
      });
      router.push(`/dashboard/properties/${propertyId}/projects/${project.id}`);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create project');
      setSaving(false);
    }
  }

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-2xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to projects
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">New Project</h1>
        <p className="text-sm text-slate-500">Set up a project to track milestones, payments, and progress photos.</p>
      </div>

      {error && <ErrorBanner msg={error} />}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Project basics */}
        <MobileCard className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Project basics</h2>

          <div className="space-y-1.5">
            <Label htmlFor="name">Project name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Roof Replacement 2026"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="projectType">Project type *</Label>
            <select
              id="projectType"
              value={form.projectType}
              onChange={e => set('projectType', e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {PROJECT_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </MobileCard>

        {/* Contractor info */}
        <MobileCard className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Contractor</h2>

          <div className="space-y-1.5">
            <Label htmlFor="contractorName">Contractor / company name *</Label>
            <Input
              id="contractorName"
              value={form.contractorName}
              onChange={e => set('contractorName', e.target.value)}
              placeholder="ABC Roofing Co."
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contractorPhone">Phone</Label>
              <Input
                id="contractorPhone"
                type="tel"
                value={form.contractorPhone}
                onChange={e => set('contractorPhone', e.target.value)}
                placeholder="(555) 000-0000"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contractorLicense">License #</Label>
              <Input
                id="contractorLicense"
                value={form.contractorLicense}
                onChange={e => set('contractorLicense', e.target.value)}
                placeholder="CA-12345"
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contractorEmail">Email</Label>
            <Input
              id="contractorEmail"
              type="email"
              value={form.contractorEmail}
              onChange={e => set('contractorEmail', e.target.value)}
              placeholder="contractor@example.com"
              className="h-11"
            />
          </div>
        </MobileCard>

        {/* Contract / schedule */}
        <MobileCard className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Contract &amp; schedule</h2>

          <div className="space-y-1.5">
            <Label htmlFor="amount">Contract amount ($) *</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={form.contractAmountCents}
              onChange={e => set('contractAmountCents', e.target.value)}
              placeholder="12500.00"
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date *</Label>
              <Input
                id="startDate"
                type="date"
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expectedEndDate">Expected completion</Label>
              <Input
                id="expectedEndDate"
                type="date"
                value={form.expectedEndDate}
                onChange={e => set('expectedEndDate', e.target.value)}
                className="h-11"
              />
            </div>
          </div>
        </MobileCard>

        <Button type="submit" disabled={saving} className="w-full min-h-[48px] text-base">
          {saving ? 'Creating…' : 'Create project'}
        </Button>
      </form>
    </MobilePageContainer>
  );
}
