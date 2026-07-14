'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { useToast } from '@/components/ui/use-toast';
import {
  activatePersonalizationDefinition,
  activatePersonalizationQuestion,
  getPersonalizationAdminCatalog,
  pausePersonalizationDefinition,
  resumePersonalizationDefinition,
} from '@/lib/api/personalizationAdminApi';

export default function PersonalizationAdminPage() {
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
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['personalization-admin-catalog'] });
  const activateDefinition = useMutation({
    mutationFn: ({ code, ruleVersion, contentVersion }: { code: string; ruleVersion: number; contentVersion: number }) =>
      activatePersonalizationDefinition(code, {
        ruleVersion,
        contentVersion,
        locale: 'en-US',
        authoredBy: authorIds[code]?.trim() || '',
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

  return (
    <AdminConsoleShell
      title="Personalization Catalog"
      subtitle="Activate only reviewed deterministic rules and content. Safety-sensitive definitions require a different active admin author."
      chips={<Badge variant="outline">Internal · MFA protected</Badge>}
    >
      <div className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-3">
          {catalog.data.definitions.map((definition) => {
            const rule = definition.rules[0];
            const content = definition.contentVersions.find((item) => item.locale === 'en-US');
            const ready = Boolean(rule && content && authorIds[definition.code]?.trim());
            return (
              <Card key={definition.id} className="rounded-2xl">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{definition.status}</Badge>
                    <Badge variant="outline">{definition.safetyClass}</Badge>
                    {definition.pausedAt ? <Badge variant="destructive">PAUSED</Badge> : null}
                  </div>
                  <CardTitle className="text-lg">{content?.title || definition.code}</CardTitle>
                  <CardDescription className="font-mono text-xs">{definition.code}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-600">Rule v{rule?.version ?? '—'} · {rule?.status ?? 'missing'} · Content v{content?.version ?? '—'} · {content?.status ?? 'missing'}</p>
                  <label className="block space-y-1 text-sm font-medium">
                    Author admin user ID
                    <Input
                      value={authorIds[definition.code] ?? ''}
                      onChange={(event) => setAuthorIds((current) => ({ ...current, [definition.code]: event.target.value }))}
                      placeholder="Required active ADMIN user ID"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={!ready || activateDefinition.isPending}
                      onClick={() => {
                        if (window.confirm(`Activate reviewed rule and content for ${definition.code}?`)) {
                          activateDefinition.mutate({ code: definition.code, ruleVersion: rule.version, contentVersion: content!.version });
                        }
                      }}
                    >
                      Review and activate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={setPause.isPending}
                      onClick={() => setPause.mutate({ code: definition.code, paused: Boolean(definition.pausedAt) })}
                    >
                      {definition.pausedAt ? 'Resume' : 'Pause'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Progressive profile questions</CardTitle>
            <CardDescription>Activate only questions approved for the pilot placement.</CardDescription>
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
