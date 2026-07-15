'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  activatePersonalizationDefinition,
  activatePersonalizationQuestion,
  getPersonalizationAdminCatalog,
  getPersonalizationQuality,
  pausePersonalizationDefinition,
  resumePersonalizationDefinition,
} from '@/lib/api/personalizationAdminApi';

export default function PersonalizationAdminPage() {
  const { user } = useAuth();
  const guard = useAdminGuard({
    title: 'Personalization Catalog',
    subtitle: 'Review and activate the small deterministic catalog.',
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [authorIds, setAuthorIds] = useState<Record<string, string>>({});
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
      authoredBy,
    }: {
      code: string;
      ruleVersion: number;
      contentVersion: number;
      authoredBy: string;
    }) =>
      activatePersonalizationDefinition(code, {
        ruleVersion,
        contentVersion,
        locale: 'en-US',
        authoredBy,
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

  if (guard.status !== 'ready') return guard.node;
  if (catalog.isLoading) {
    return <AdminConsoleShell title="Personalization Catalog" subtitle="Loading reviewed catalog state."><AdminRouteState state="loading" title="Loading catalog" description="Reading definitions, rules, content, and profile questions." /></AdminConsoleShell>;
  }
  if (catalog.isError || !catalog.data) {
    return <AdminConsoleShell title="Personalization Catalog" subtitle="Review and activation."><AdminRouteState state="error" title="Unable to load catalog" description={catalog.error instanceof Error ? catalog.error.message : 'Catalog request failed.'} /></AdminConsoleShell>;
  }

  const implementedDefinitions = catalog.data.definitions.filter(
    (definition) => definition.implementationStatus === 'IMPLEMENTED',
  );
  const planOnlyDefinitions = catalog.data.definitions.filter(
    (definition) => definition.implementationStatus === 'PLAN_ONLY',
  );

  return (
    <AdminConsoleShell
      title="Personalization Catalog"
      subtitle="Activate only reviewed deterministic rules and content. Safety-sensitive definitions require a different active admin author."
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
        <section className="space-y-3" aria-labelledby="implemented-catalog-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="implemented-catalog-heading" className="text-lg font-semibold">Implemented catalog</h2>
              <p className="text-sm text-slate-600">Only definitions with code-owned behavior can be reviewed or operated.</p>
            </div>
            <Badge variant="outline">{implementedDefinitions.length} implemented</Badge>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {implementedDefinitions.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 xl:col-span-3">
                No implemented catalog rows were found. Run the canonical catalog bootstrap before review.
              </div>
            ) : null}
            {implementedDefinitions.map((definition) => {
              const rule = definition.rules[0];
              const content = definition.contentVersions.find((item) => item.locale === 'en-US');
              const hasBundle = Boolean(rule && content);
              const bundleActive = Boolean(rule?.status === 'ACTIVE' && content?.status === 'ACTIVE');
              const authorOptions = catalog.data.activeAdmins.filter(
                (admin) => definition.safetyClass !== 'SAFETY_SENSITIVE' || admin.id !== user?.id,
              );
              const requestedAuthorId = authorIds[definition.code] ?? rule?.authoredBy ?? '';
              const selectedAuthorId = authorOptions.some((admin) => admin.id === requestedAuthorId)
                ? requestedAuthorId
                : '';
              const ready = Boolean(hasBundle && selectedAuthorId && !bundleActive);
              const canPause = definition.status === 'ACTIVE' || Boolean(definition.pausedAt);

              return (
                <Card key={definition.id} className="rounded-2xl">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{definition.status}</Badge>
                      <Badge variant="outline">{definition.safetyClass}</Badge>
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

                    {!hasBundle ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        This implemented definition is missing its rule or en-US content. Run the canonical catalog bootstrap before review.
                      </p>
                    ) : null}

                    {hasBundle && !bundleActive ? (
                      <label className="block space-y-1 text-sm font-medium">
                        Author admin
                        <select
                          value={selectedAuthorId}
                          onChange={(event) => setAuthorIds((current) => ({ ...current, [definition.code]: event.target.value }))}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Select an active admin author</option>
                          {authorOptions.map((admin) => (
                            <option key={admin.id} value={admin.id}>
                              {admin.firstName} {admin.lastName} ({admin.email})
                            </option>
                          ))}
                        </select>
                        <span className="block text-xs font-normal text-slate-500">
                          {definition.safetyClass === 'SAFETY_SENSITIVE'
                            ? 'Safety-sensitive definitions require an author other than the signed-in reviewer.'
                            : 'The selected active admin is recorded as author; the signed-in admin is recorded as reviewer.'}
                        </span>
                      </label>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {hasBundle && !bundleActive ? (
                        <Button
                          type="button"
                          disabled={!ready || activateDefinition.isPending}
                          onClick={() => {
                            if (window.confirm(`Activate reviewed rule and content for ${definition.code}?`)) {
                              activateDefinition.mutate({
                                code: definition.code,
                                ruleVersion: rule!.version,
                                contentVersion: content!.version,
                                authoredBy: selectedAuthorId,
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

        {planOnlyDefinitions.length > 0 ? (
          <details className="rounded-2xl border bg-white p-4">
            <summary className="cursor-pointer font-semibold">
              Plan-only records ({planOnlyDefinitions.length})
            </summary>
            <p className="mt-2 text-sm text-slate-600">
              These legacy planning rows have no implemented behavior. They are read-only here and cannot be activated or paused.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {planOnlyDefinitions.map((definition) => (
                <div key={definition.id} className="rounded-xl border border-dashed bg-slate-50 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">NOT IMPLEMENTED</Badge>
                    <Badge variant="outline">{definition.safetyClass}</Badge>
                  </div>
                  <p className="mt-3 font-mono text-sm font-semibold">{definition.code}</p>
                  <p className="mt-1 text-xs text-slate-500">Planning record only · no lifecycle actions</p>
                </div>
              ))}
            </div>
          </details>
        ) : null}

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
