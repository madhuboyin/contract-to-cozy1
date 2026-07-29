'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Search } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MobilePageIntro, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';

type Requirement = {
  id: string;
  family: string;
  question: string;
  advisoryLikelihood: string;
  applicability: 'UNKNOWN' | 'APPLICABLE' | 'NOT_APPLICABLE';
  determination: 'UNDETERMINED' | 'APPLIES' | 'DOES_NOT_APPLY' | 'CONDITIONAL';
  truthLayer: string;
  confidence: string;
  limitation?: string | null;
  exactNextAction: string;
  dueAt?: string | null;
  isBlocking: boolean;
  sourceUrl?: string | null;
  confirmedByName?: string | null;
  confirmedByOrg?: string | null;
};

export default function RenovationRequirementsPage() {
  const { id: propertyId, caseId } = useParams<{ id: string; caseId: string }>();
  const [renovationCase, setRenovationCase] = useState<any>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [authority, setAuthority] = useState({
    municipality: '',
    authorityName: '',
    authorityWebsite: '',
    confirmedByName: '',
    confirmedByOrg: '',
  });
  const [determination, setDetermination] = useState({
    applicability: 'APPLICABLE',
    determination: 'APPLIES',
    truthLayer: 'AUTHORITY_CONFIRMED',
    sourceType: 'AUTHORITY_WEBSITE',
    sourceUrl: '',
    sourceSection: '',
    confirmedByName: '',
    confirmedByOrg: '',
    exactNextAction: 'Complete the confirmed requirement before work starts.',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [caseResponse, requirementResponse] = await Promise.all([
        api.getRenovationCase(propertyId, caseId),
        api.listRenovationRequirements(propertyId, caseId),
      ]);
      if (!caseResponse.success || !caseResponse.data) throw new Error(caseResponse.message || 'Renovation case not found');
      setRenovationCase(caseResponse.data);
      setRequirements(requirementResponse.success && Array.isArray(requirementResponse.data)
        ? requirementResponse.data
        : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load requirements');
    } finally {
      setLoading(false);
    }
  }, [caseId, propertyId]);

  useEffect(() => { void load(); }, [load]);

  async function generateCandidates() {
    setWorking(true);
    setError('');
    try {
      const response = await api.generateRenovationRequirements(propertyId, caseId);
      if (!response.success) throw new Error(response.message || 'Failed to generate requirements');
      setRequirements(Array.isArray(response.data) ? response.data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to generate requirements');
    } finally {
      setWorking(false);
    }
  }

  async function saveAuthorityProfile() {
    setWorking(true);
    setError('');
    try {
      const response = await api.createRenovationAuthorityProfile(propertyId, caseId, {
        ...authority,
        confirmed: true,
        sourceType: 'AUTHORITY_WEBSITE',
        sourceReference: authority.authorityWebsite,
      });
      if (!response.success) throw new Error(response.message || 'Failed to confirm authority');
    } catch (err: any) {
      setError(err.message || 'Failed to confirm authority');
    } finally {
      setWorking(false);
    }
  }

  async function saveDetermination(requirement: Requirement) {
    setWorking(true);
    setError('');
    try {
      const response = await api.determineRenovationRequirement(
        propertyId,
        caseId,
        requirement.id,
        {
          ...determination,
          isBlocking: requirement.isBlocking,
          sourceObservedAt: new Date().toISOString(),
        },
      );
      if (!response.success) throw new Error(response.message || 'Failed to record determination');
      setEditingId(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to record determination');
    } finally {
      setWorking(false);
    }
  }

  const unresolved = requirements.filter(item => item.determination === 'UNDETERMINED').length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-28 sm:p-6">
      <MobilePageIntro
        title={renovationCase?.name ? `${renovationCase.name}: Requirements` : 'Renovation requirements'}
        subtitle="Advisor results are research candidates. Only sourced authority or professional evidence establishes a requirement."
        action={<StatusChip tone={unresolved ? 'needsAction' : 'good'}>{unresolved} unresolved</StatusChip>}
      />

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : null}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="font-semibold text-slate-900">Authority and jurisdiction</h2>
            <p className="text-sm text-slate-600">Record who confirmed the authority and the source used.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Municipality</Label><Input value={authority.municipality} onChange={event => setAuthority(current => ({ ...current, municipality: event.target.value }))} /></div>
            <div><Label>Authority name</Label><Input value={authority.authorityName} onChange={event => setAuthority(current => ({ ...current, authorityName: event.target.value }))} /></div>
            <div><Label>Authority website</Label><Input type="url" value={authority.authorityWebsite} onChange={event => setAuthority(current => ({ ...current, authorityWebsite: event.target.value }))} /></div>
            <div><Label>Confirmed by</Label><Input value={authority.confirmedByName} onChange={event => setAuthority(current => ({ ...current, confirmedByName: event.target.value }))} placeholder="Name or title" /></div>
            <div><Label>Confirming organization</Label><Input value={authority.confirmedByOrg} onChange={event => setAuthority(current => ({ ...current, confirmedByOrg: event.target.value }))} /></div>
          </div>
          <Button
            variant="outline"
            disabled={working || !authority.authorityName || !authority.authorityWebsite || (!authority.confirmedByName && !authority.confirmedByOrg)}
            onClick={saveAuthorityProfile}
          >
            Confirm jurisdiction profile
          </Button>
        </CardContent>
      </Card>

      {requirements.length === 0 && !loading ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <Search className="mx-auto h-8 w-8 text-indigo-600" />
            <p className="font-semibold">Start scope-specific requirements research</p>
            <p className="text-sm text-slate-600">This creates actionable research questions, not compliance conclusions.</p>
            <Button disabled={working} onClick={generateCandidates}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Generate research candidates
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {requirements.map(requirement => {
          const resolved = requirement.determination !== 'UNDETERMINED';
          return (
            <Card key={requirement.id} className={resolved ? 'border-emerald-200' : 'border-amber-200'}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start gap-3">
                  {resolved ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{requirement.family.replace(/_/g, ' ')}</p>
                      <StatusChip tone={resolved ? 'good' : 'needsAction'}>
                        {resolved ? requirement.determination.replace(/_/g, ' ') : 'Research needed'}
                      </StatusChip>
                    </div>
                    <p className="mt-1 text-sm text-slate-800">{requirement.question}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Advisory likelihood: {requirement.advisoryLikelihood.replace(/_/g, ' ').toLowerCase()} · Confidence: {requirement.confidence.toLowerCase()}
                    </p>
                  </div>
                </div>
                {!resolved ? (
                  <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-medium">Next action</p>
                    <p>{requirement.exactNextAction}</p>
                    {requirement.dueAt ? <p className="mt-1 text-xs">Research due {new Date(requirement.dueAt).toLocaleDateString()}</p> : null}
                  </div>
                ) : (
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p>Truth layer: {requirement.truthLayer.replace(/_/g, ' ').toLowerCase()}</p>
                    <p>Confirmed by: {requirement.confirmedByName || requirement.confirmedByOrg}</p>
                    {requirement.sourceUrl ? <a className="inline-flex items-center gap-1 underline" href={requirement.sourceUrl} target="_blank" rel="noreferrer">View source <ExternalLink className="h-3 w-3" /></a> : null}
                  </div>
                )}
                {!resolved && editingId !== requirement.id ? (
                  <Button variant="outline" onClick={() => setEditingId(requirement.id)}>Record sourced determination</Button>
                ) : null}
                {editingId === requirement.id ? (
                  <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                    <div><Label>Determination</Label><select className="h-10 w-full rounded-md border px-3" value={determination.determination} onChange={event => setDetermination(current => ({ ...current, determination: event.target.value, applicability: event.target.value === 'DOES_NOT_APPLY' ? 'NOT_APPLICABLE' : 'APPLICABLE' }))}><option value="APPLIES">Applies</option><option value="DOES_NOT_APPLY">Does not apply</option><option value="CONDITIONAL">Conditional</option></select></div>
                    <div><Label>Truth layer</Label><select className="h-10 w-full rounded-md border px-3" value={determination.truthLayer} onChange={event => setDetermination(current => ({ ...current, truthLayer: event.target.value, sourceType: event.target.value === 'PROFESSIONAL_CONFIRMED' ? 'PROFESSIONAL_STATEMENT' : 'AUTHORITY_WEBSITE' }))}><option value="AUTHORITY_CONFIRMED">Authority confirmed</option><option value="PROFESSIONAL_CONFIRMED">Professional confirmed</option><option value="SOURCE_OBSERVED">Source observed</option></select></div>
                    <div><Label>Source URL</Label><Input type="url" value={determination.sourceUrl} onChange={event => setDetermination(current => ({ ...current, sourceUrl: event.target.value }))} /></div>
                    <div><Label>Source section</Label><Input value={determination.sourceSection} onChange={event => setDetermination(current => ({ ...current, sourceSection: event.target.value }))} /></div>
                    <div><Label>Confirmed by</Label><Input value={determination.confirmedByName} onChange={event => setDetermination(current => ({ ...current, confirmedByName: event.target.value }))} /></div>
                    <div><Label>Organization</Label><Input value={determination.confirmedByOrg} onChange={event => setDetermination(current => ({ ...current, confirmedByOrg: event.target.value }))} /></div>
                    <div className="sm:col-span-2"><Label>Exact next action</Label><Input value={determination.exactNextAction} onChange={event => setDetermination(current => ({ ...current, exactNextAction: event.target.value }))} /></div>
                    <div className="flex gap-2 sm:col-span-2"><Button disabled={working || !determination.sourceUrl || (!determination.confirmedByName && !determination.confirmedByOrg)} onClick={() => saveDetermination(requirement)}>Save determination</Button><Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button></div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
