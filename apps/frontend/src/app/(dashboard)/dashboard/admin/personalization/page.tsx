'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { useToast } from '@/components/ui/use-toast';
import {
  activatePersonalizationDefinition,
  activatePersonalizationQuestion,
  createRecommendationIncident,
  getPersonalizationAdminCatalog,
  getPersonalizationQuality,
  getRecommendationIncidents,
  pausePersonalizationDefinition,
  recordPersonalizationGovernanceReview,
  resumePersonalizationDefinition,
  transitionRecommendationIncident,
  type RecommendationIncident,
  type RecommendationIncidentStatus,
  type RecommendationReviewRole,
} from '@/lib/api/personalizationAdminApi';
import { QualitySnapshotCard } from '@/components/ops/personalization/QualitySnapshotCard';
import { IncidentQueueCard } from '@/components/ops/personalization/IncidentQueueCard';
import { DefinitionCard } from '@/components/ops/personalization/DefinitionCard';
import { ProfileQuestionsCard } from '@/components/ops/personalization/ProfileQuestionsCard';

export default function PersonalizationAdminPage() {
  const guard = useAdminGuard({
    title: 'Personalization Catalog',
    subtitle: 'Review and activate the small deterministic catalog.',
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const catalog = useQuery({
    queryKey: ['personalization-admin-catalog'],
    queryFn: getPersonalizationAdminCatalog,
    enabled: guard.isAdmin,
  });
  const quality = useQuery({
    queryKey: ['personalization-quality', 30],
    queryFn: () => getPersonalizationQuality(30),
    enabled: guard.isAdmin,
  });
  const incidents = useQuery({
    queryKey: ['recommendation-incidents'],
    queryFn: getRecommendationIncidents,
    enabled: guard.isAdmin,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['personalization-admin-catalog'] }),
      queryClient.invalidateQueries({ queryKey: ['personalization-quality'] }),
      queryClient.invalidateQueries({ queryKey: ['recommendation-incidents'] }),
    ]);
  };
  const activateDefinition = useMutation({
    mutationFn: ({
      code,
      ruleVersion,
      contentVersion,
    }: {
      code: string;
      ruleVersion: number;
      contentVersion: number;
    }) =>
      activatePersonalizationDefinition(code, {
        ruleVersion,
        contentVersion,
        locale: 'en-US',
      }),
    onSuccess: async () => {
      await refresh();
      toast({ title: 'Definition activated', description: 'The reviewed rule and content are now active.' });
    },
    onError: (error: Error) => toast({ title: 'Activation failed', description: error.message, variant: 'destructive' }),
  });
  const activateQuestion = useMutation({
    mutationFn: ({ code, version }: { code: string; version: number }) => activatePersonalizationQuestion(code, version),
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: 'Question activation failed', description: error.message, variant: 'destructive' }),
  });
  const setPause = useMutation({
    mutationFn: ({ code, paused }: { code: string; paused: boolean }) => paused
      ? resumePersonalizationDefinition(code)
      : pausePersonalizationDefinition(code, 'Paused from personalization catalog admin'),
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: 'Lifecycle update failed', description: error.message, variant: 'destructive' }),
  });
  const reviewGovernance = useMutation({
    mutationFn: ({
      code,
      role,
      decision,
      notes,
    }: {
      code: string;
      role: RecommendationReviewRole;
      decision: 'APPROVED' | 'REJECTED';
      notes?: string | null;
    }) => recordPersonalizationGovernanceReview(code, { role, decision, notes }),
    onSuccess: async () => {
      await refresh();
      toast({ title: 'Governance review recorded', description: 'Launch readiness has been recalculated for the current policy version.' });
    },
    onError: (error: Error) => toast({ title: 'Review failed', description: error.message, variant: 'destructive' }),
  });
  const openIncident = useMutation({
    mutationFn: ({ definitionCode, summary, details }: { definitionCode: string; summary: string; details?: string }) =>
      createRecommendationIncident({ definitionCode, type: 'INCORRECT_CONTENT', summary, details }),
    onSuccess: async (result) => {
      await refresh();
      toast({
        title: 'Incident opened',
        description: result.definitionPaused
          ? 'The definition was automatically paused for immediate mitigation.'
          : 'The incident is available in the trust operations queue.',
      });
    },
    onError: (error: Error) => toast({ title: 'Incident intake failed', description: error.message, variant: 'destructive' }),
  });
  const transitionIncident = useMutation({
    mutationFn: ({ incidentId, status, note, resolution }: {
      incidentId: string;
      status: RecommendationIncidentStatus;
      note: string;
      resolution?: { summary: string; rootCause: string; correctiveAction: string };
    }) => transitionRecommendationIncident(incidentId, {
      status,
      note,
      ...(resolution ? {
        resolutionCode: 'CORRECTED',
        resolutionSummary: resolution.summary,
        rootCause: resolution.rootCause,
        correctiveAction: resolution.correctiveAction,
      } : {}),
    }),
    onSuccess: async () => {
      await refresh();
      toast({ title: 'Incident updated', description: 'The audited incident lifecycle was advanced.' });
    },
    onError: (error: Error) => toast({ title: 'Incident update failed', description: error.message, variant: 'destructive' }),
  });

  const advanceIncident = (incident: RecommendationIncident) => {
    const nextByStatus: Partial<Record<RecommendationIncidentStatus, RecommendationIncidentStatus>> = {
      OPEN: 'TRIAGED',
      TRIAGED: 'INVESTIGATING',
      INVESTIGATING: 'RESOLVED',
      MITIGATED: 'RESOLVED',
      RESOLVED: 'CLOSED',
    };
    const status = nextByStatus[incident.status];
    if (!status) return;
    const note = window.prompt(`Operational note for ${incident.status} → ${status}:`);
    if (!note?.trim()) return;
    if (status !== 'RESOLVED') {
      transitionIncident.mutate({ incidentId: incident.id, status, note: note.trim() });
      return;
    }
    const summary = window.prompt('Resolution summary:');
    const rootCause = window.prompt('Root cause:');
    const correctiveAction = window.prompt('Corrective action:');
    if (summary?.trim() && rootCause?.trim() && correctiveAction?.trim()) {
      transitionIncident.mutate({
        incidentId: incident.id,
        status,
        note: note.trim(),
        resolution: { summary: summary.trim(), rootCause: rootCause.trim(), correctiveAction: correctiveAction.trim() },
      });
    }
  };

  const reportIncident = (definitionCode: string) => {
    const summary = window.prompt(`Summarize the recommendation issue for ${definitionCode}:`);
    if (!summary?.trim()) return;
    const details = window.prompt('Add investigation details (optional):');
    openIncident.mutate({ definitionCode, summary: summary.trim(), details: details?.trim() || undefined });
  };

  if (guard.status !== 'ready') return guard.node;
  if (catalog.isLoading) {
    return (
      <AdminConsoleShell title="Personalization Catalog" subtitle="Loading reviewed catalog state.">
        <AdminRouteState state="loading" title="Loading catalog" description="Reading definitions, rules, content, and profile questions." />
      </AdminConsoleShell>
    );
  }
  if (catalog.isError || !catalog.data) {
    return (
      <AdminConsoleShell title="Personalization Catalog" subtitle="Review and activation.">
        <AdminRouteState
          state="error"
          title="Unable to load catalog"
          description={catalog.error instanceof Error ? catalog.error.message : 'Catalog request failed.'}
        />
      </AdminConsoleShell>
    );
  }

  return (
    <AdminConsoleShell
      title="Personalization Catalog"
      subtitle="Activate only reviewed deterministic rules and content. Every activation is MFA-protected and audited."
      chips={
        <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          Internal · MFA protected
        </span>
      }
    >
      <QualitySnapshotCard isLoading={quality.isLoading} isError={quality.isError} data={quality.data} />

      <IncidentQueueCard
        isLoading={incidents.isLoading}
        isError={incidents.isError}
        incidents={incidents.data}
        onAdvance={advanceIncident}
        advancePending={transitionIncident.isPending}
      />

      <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2 px-5 pb-1 pt-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Recommendation catalog</h2>
            <p className="text-[12px] text-slate-500">Review and operate the focused definitions supported by the application.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {catalog.data.definitions.length} definitions
          </span>
        </div>
        <div className="p-5">
          {catalog.data.definitions.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              No catalog rows were found. Run the canonical catalog bootstrap before review.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {catalog.data.definitions.map((definition) => (
                <DefinitionCard
                  key={definition.id}
                  definition={definition}
                  onActivate={(code, ruleVersion, contentVersion) => activateDefinition.mutate({ code, ruleVersion, contentVersion })}
                  activatePending={activateDefinition.isPending}
                  onSetPause={(code, paused) => setPause.mutate({ code, paused })}
                  pausePending={setPause.isPending}
                  onReviewGovernance={(code, role, decision) => reviewGovernance.mutate({ code, role, decision })}
                  reviewPending={reviewGovernance.isPending}
                  onReportIncident={reportIncident}
                  incidentPending={openIncident.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ProfileQuestionsCard
        questions={catalog.data.questions}
        onActivate={(code, version) => activateQuestion.mutate({ code, version })}
        activatePending={activateQuestion.isPending}
      />
    </AdminConsoleShell>
  );
}
