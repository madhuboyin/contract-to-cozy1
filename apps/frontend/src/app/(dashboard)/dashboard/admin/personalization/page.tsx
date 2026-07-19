'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { useToast } from '@/components/ui/use-toast';
import {
  activatePersonalizationDefinition,
  activatePersonalizationQuestion,
  getPersonalizationAdminCatalog,
  getPersonalizationQuality,
  pausePersonalizationDefinition,
  recordPersonalizationGovernanceReview,
  resumePersonalizationDefinition,
  type RecommendationReviewRole,
} from '@/lib/api/personalizationAdminApi';

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
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['personalization-admin-catalog'] });
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

  if (guard.status !== 'ready') return guard.node;
  if (catalog.isLoading) {
    return <AdminConsoleShell title="Personalization Catalog" subtitle="Loading reviewed catalog state."><AdminRouteState state="loading" title="Loading catalog" description="Reading definitions, rules, content, and profile questions." /></AdminConsoleShell>;
  }
  if (catalog.isError || !catalog.data) {
    return <AdminConsoleShell title="Personalization Catalog" subtitle="Review and activation."><AdminRouteState state="error" title="Unable to load catalog" description={catalog.error instanceof Error ? catalog.error.message : 'Catalog request failed.'} /></AdminConsoleShell>;
  }

  return (
    <AdminConsoleShell
      title="Personalization Catalog"
      subtitle="Activate only reviewed deterministic rules and content. Every activation is MFA-protected and audited."
      chips={<Badge variant="outline">Internal · MFA protected</Badge>}
    >
      <div className="space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Personalization quality snapshot</CardTitle>
              <Badge variant="outline">Last 30 days</Badge>
              {quality.data ? <Badge variant={quality.data.sample.status === 'REVIEWABLE' ? 'default' : 'secondary'}>{quality.data.sample.status.replaceAll('_', ' ')}</Badge> : null}
            </div>
            <CardDescription>Aggregate signals only. Online tuning remains disabled even after the review threshold is reached.</CardDescription>
          </CardHeader>
          <CardContent>
            {quality.isLoading ? (
              <p className="text-sm text-slate-600">Loading personalization quality…</p>
            ) : quality.isError || !quality.data ? (
              <p className="text-sm text-rose-700">Personalization quality is unavailable. Catalog operations are unaffected.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Homes with default guidance</p><p className="mt-1 text-2xl font-semibold">{quality.data.propertiesWithDefaultGuidance}</p></div>
                  <div className="rounded-xl border p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Optional profiles enabled</p><p className="mt-1 text-2xl font-semibold">{quality.data.optionalProfilesEnabled}</p></div>
                  <div className="rounded-xl border p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recommendations</p><p className="mt-1 text-2xl font-semibold">{quality.data.recommendations.total}</p></div>
                  <div className="rounded-xl border p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Accepted</p><p className="mt-1 text-2xl font-semibold">{quality.data.feedback.accepted}</p></div>
                  <div className="rounded-xl border p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Negative</p><p className="mt-1 text-2xl font-semibold">{quality.data.feedback.negative}</p></div>
                </div>
                <p className="text-sm text-slate-600">
                  {quality.data.sample.decisionEvents} decision events collected; {quality.data.sample.minimumRequired} required before aggregate results are reviewable. This threshold permits manual review only, never automatic weight changes.
                </p>
                {quality.data.feedback.reasons.length > 0 ? (
                  <div className="flex flex-wrap gap-2" aria-label="Feedback reason counts">
                    {quality.data.feedback.reasons.map((reason) => <Badge key={reason.reasonCode} variant="outline">{reason.reasonCode.replaceAll('_', ' ')} · {reason.count}</Badge>)}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
        <section className="space-y-3" aria-labelledby="recommendation-catalog-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="recommendation-catalog-heading" className="text-lg font-semibold">Recommendation catalog</h2>
              <p className="text-sm text-slate-600">Review and operate the focused definitions supported by the application.</p>
            </div>
            <Badge variant="outline">{catalog.data.definitions.length} definitions</Badge>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {catalog.data.definitions.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 xl:col-span-3">
                No catalog rows were found. Run the canonical catalog bootstrap before review.
              </div>
            ) : null}
            {catalog.data.definitions.map((definition) => {
              const rule = definition.rules[0];
              const content = definition.contentVersions.find((item) => item.locale === 'en-US');
              const hasBundle = Boolean(rule && content);
              const bundleActive = Boolean(rule?.status === 'ACTIVE' && content?.status === 'ACTIVE');
              const ready = Boolean(hasBundle && !bundleActive);
              const canPause = definition.status === 'ACTIVE' || Boolean(definition.pausedAt);

              return (
                <Card key={definition.id} className="rounded-2xl">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{definition.status}</Badge>
                      <Badge variant="outline">{definition.safetyClass}</Badge>
                      <Badge variant="outline">{definition.safetyTier.replaceAll('_', ' ')}</Badge>
                      <Badge variant="outline">{definition.governancePolicyVersion}</Badge>
                      {!hasBundle ? <Badge variant="destructive">INCOMPLETE</Badge> : null}
                      {hasBundle && !bundleActive ? <Badge variant="secondary">READY FOR REVIEW</Badge> : null}
                      {bundleActive ? <Badge variant="secondary">ACTIVE BUNDLE</Badge> : null}
                      {definition.pausedAt ? <Badge variant="destructive">PAUSED</Badge> : null}
                    </div>
                    <CardTitle className="text-lg">{content?.title || definition.code}</CardTitle>
                    <CardDescription className="font-mono text-xs">{definition.code}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-slate-600">Rule v{rule?.version ?? '—'} · {rule?.status ?? 'missing'} · Content v{content?.version ?? '—'} · {content?.status ?? 'missing'}</p>

                    {definition.launchReadiness ? (
                      <div className="space-y-2 rounded-xl border bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">Trust review</span>
                          <Badge variant={definition.launchReadiness.ready ? 'default' : 'secondary'}>
                            {definition.launchReadiness.ready ? 'READY' : 'REVIEW REQUIRED'}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {definition.launchReadiness.requiredRoles.map((role) => {
                            const approved = definition.launchReadiness!.approvedRoles.includes(role);
                            const rejected = definition.governanceReviews.some((review) => review.role === role && review.decision === 'REJECTED' && review.policyVersion === definition.governancePolicyVersion);
                            return (
                              <div key={role} className="flex items-center gap-1 rounded-lg border bg-white px-2 py-1">
                                <Badge variant={approved ? 'default' : rejected ? 'destructive' : 'outline'}>{role.replaceAll('_', ' ')}</Badge>
                                {!approved ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={reviewGovernance.isPending}
                                    onClick={() => reviewGovernance.mutate({ code: definition.code, role, decision: 'APPROVED', notes: 'Reviewed from the Phase 4 trust queue.' })}
                                  >
                                    Approve
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={reviewGovernance.isPending}
                                    onClick={() => {
                                      const notes = window.prompt('Reason for rejecting this approval?');
                                      if (notes?.trim()) reviewGovernance.mutate({ code: definition.code, role, decision: 'REJECTED', notes: notes.trim() });
                                    }}
                                  >
                                    Reject
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {!definition.launchReadiness.ready ? (
                          <p className="text-xs text-slate-600">Activation remains blocked until every tier-required role approves the current governance policy.</p>
                        ) : null}
                      </div>
                    ) : null}

                    {!hasBundle ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        This implemented definition is missing its rule or en-US content. Run the canonical catalog bootstrap before review.
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {hasBundle && !bundleActive ? (
                        <Button
                          type="button"
                          disabled={!ready || !definition.launchReadiness?.ready || activateDefinition.isPending}
                          onClick={() => {
                            const warning = definition.safetyClass === 'SAFETY_SENSITIVE'
                              ? `Activate safety-sensitive rule and content for ${definition.code}? Confirm that you reviewed both versions.`
                              : `Activate reviewed rule and content for ${definition.code}?`;
                            if (window.confirm(warning)) {
                              activateDefinition.mutate({
                                code: definition.code,
                                ruleVersion: rule!.version,
                                contentVersion: content!.version,
                              });
                            }
                          }}
                        >
                          Review and activate
                        </Button>
                      ) : null}
                      {bundleActive && !definition.pausedAt ? <Button type="button" disabled>Active</Button> : null}
                      {canPause ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={setPause.isPending}
                          onClick={() => setPause.mutate({ code: definition.code, paused: Boolean(definition.pausedAt) })}
                        >
                          {definition.pausedAt ? 'Resume' : 'Pause'}
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Progressive profile questions</CardTitle>
            <CardDescription>Activate only reviewed questions approved for optional profile collection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {catalog.data.questions.map((question) => (
              <div key={`${question.code}:${question.version}`} className="flex flex-col justify-between gap-3 rounded-xl border p-4 md:flex-row md:items-center">
                <div>
                  <div className="flex items-center gap-2"><Badge variant="outline">{question.status}</Badge><span className="font-medium">{question.prompt}</span></div>
                  <p className="mt-1 font-mono text-xs text-slate-500">{question.code} · v{question.version}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={question.status === 'ACTIVE' || activateQuestion.isPending}
                  onClick={() => activateQuestion.mutate({ code: question.code, version: question.version })}
                >
                  {question.status === 'ACTIVE' ? 'Active' : 'Activate'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminConsoleShell>
  );
}
