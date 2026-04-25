'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import {
  createKnowledgeAdminArticle,
  getKnowledgeAdminArticle,
  getKnowledgeEditorOptions,
  updateKnowledgeAdminArticle,
} from '@/lib/knowledge/adminApi';
import {
  buildKnowledgeEditorDefaults,
  createEmptyCtaFormValue,
  createEmptySectionFormValue,
  createEmptyToolLinkFormValue,
  KnowledgeArticleEditorFormValues,
  KnowledgeEditorArticle,
  KnowledgeEditorOptions,
  knowledgeArticleEditorSchema,
  nextSortOrder,
  slugifyKnowledgeTitle,
  transformKnowledgeArticleForm,
} from '@/lib/knowledge/editor';
import { AdminAccessState, AdminConsoleShell, AdminRouteState, useAdminOnlineStatus } from '@/components/ops/AdminConsoleShell';

type KnowledgeArticleEditorProps = {
  articleId?: string;
};

function formatDateTime(value?: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString();
}

function extractFieldErrors(error: unknown): Array<{ field: string; message: string }> {
  const payload = (error as { payload?: { error?: { details?: Array<{ field?: string; message?: string }> } } })?.payload;
  return payload?.error?.details
    ?.filter((detail): detail is { field: string; message: string } => !!detail?.field && !!detail?.message) ?? [];
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Something went wrong while saving the article.';
}

function getNumberInputValue(value: unknown): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : '';
  }
  return '';
}

function SectionSummaryBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-normal text-slate-600">
      {label}
    </Badge>
  );
}

export function KnowledgeArticleEditor({ articleId }: KnowledgeArticleEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const isOnline = useAdminOnlineStatus();
  const isEditMode = Boolean(articleId);
  const [slugTouched, setSlugTouched] = React.useState(isEditMode);

  const optionsQuery = useQuery({
    queryKey: ['knowledge-admin-options'],
    queryFn: getKnowledgeEditorOptions,
    enabled: !loading && user?.role === 'ADMIN',
  });

  const articleQuery = useQuery({
    queryKey: ['knowledge-admin-article', articleId],
    queryFn: () => getKnowledgeAdminArticle(articleId!),
    enabled: !loading && user?.role === 'ADMIN' && Boolean(articleId),
  });

  const form = useForm<KnowledgeArticleEditorFormValues>({
    resolver: zodResolver(knowledgeArticleEditorSchema),
    defaultValues: buildKnowledgeEditorDefaults(),
    mode: 'onBlur',
  });

  const sectionsFieldArray = useFieldArray({
    control: form.control,
    name: 'sections',
    keyName: 'fieldId',
  });
  const toolLinksFieldArray = useFieldArray({
    control: form.control,
    name: 'toolLinks',
    keyName: 'fieldId',
  });
  const ctasFieldArray = useFieldArray({
    control: form.control,
    name: 'ctas',
    keyName: 'fieldId',
  });

  const watchedTitle = form.watch('title');
  const watchedSections = form.watch('sections') ?? [];
  const watchedCategoryIds = form.watch('categoryIds') ?? [];
  const watchedTagIds = form.watch('tagIds') ?? [];

  React.useEffect(() => {
    if (articleQuery.data) {
      form.reset(buildKnowledgeEditorDefaults(articleQuery.data));
      setSlugTouched(true);
    }
  }, [articleQuery.data, form]);

  React.useEffect(() => {
    if (isEditMode || slugTouched) return;
    form.setValue('slug', slugifyKnowledgeTitle(watchedTitle), {
      shouldDirty: true,
    });
  }, [form, isEditMode, slugTouched, watchedTitle]);

  const saveMutation = useMutation({
    mutationFn: async (values: KnowledgeArticleEditorFormValues) => {
      const transformed = transformKnowledgeArticleForm(values);
      if (!transformed.payload) {
        const error = new Error('Please resolve the highlighted validation issues before saving.');
        (error as Error & { details?: Array<{ path: string; message: string }> }).details = transformed.errors;
        throw error;
      }

      if (articleId) {
        return updateKnowledgeAdminArticle(articleId, transformed.payload);
      }

      return createKnowledgeAdminArticle(transformed.payload);
    },
    onSuccess: async (article) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['knowledge-admin-articles'] }),
        queryClient.invalidateQueries({ queryKey: ['knowledge-admin-article', article.id] }),
      ]);

      form.reset(buildKnowledgeEditorDefaults(article));
      setSlugTouched(true);

      toast({
        title: isEditMode ? 'Article updated' : 'Article created',
        description: `${article.title} is now saved in the Knowledge Hub.`,
      });

      if (!articleId) {
        router.replace(`/dashboard/knowledge-admin/${article.id}`);
      }
    },
    onError: (error) => {
      const localErrors = (error as Error & { details?: Array<{ path: string; message: string }> }).details ?? [];
      localErrors.forEach((detail) => {
        form.setError(detail.path as keyof KnowledgeArticleEditorFormValues, {
          type: 'manual',
          message: detail.message,
        });
      });

      extractFieldErrors(error).forEach((detail) => {
        form.setError(detail.field as keyof KnowledgeArticleEditorFormValues, {
          type: 'server',
          message: detail.message,
        });
      });

      const message = getErrorMessage(error);
      if (/slug/i.test(message)) {
        form.setError('slug', { type: 'server', message });
      }

      toast({
        title: 'Save failed',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const handleToggleId = React.useCallback(
    (fieldName: 'categoryIds' | 'tagIds', value: string, checked: boolean) => {
      const currentValues = form.getValues(fieldName) ?? [];
      const nextValues = checked ? [...currentValues, value] : currentValues.filter((id) => id !== value);
      form.setValue(fieldName, nextValues, { shouldDirty: true, shouldValidate: true });
    },
    [form]
  );

  const handleRemoveSection = React.useCallback(
    (index: number, tempKey: string) => {
      sectionsFieldArray.remove(index);

      const nextToolLinks = form
        .getValues('toolLinks')
        ?.map((toolLink) =>
          toolLink.anchorSectionTempKey === tempKey
            ? { ...toolLink, anchorSectionTempKey: '' }
            : toolLink
        ) ?? [];
      const nextCtas = form
        .getValues('ctas')
        ?.map((cta) =>
          cta.sectionTempKey === tempKey ? { ...cta, sectionTempKey: '' } : cta
        ) ?? [];

      form.setValue('toolLinks', nextToolLinks, { shouldDirty: true });
      form.setValue('ctas', nextCtas, { shouldDirty: true });
    },
    [form, sectionsFieldArray]
  );

  const sectionOptions = watchedSections.map((section, index) => ({
    tempKey: section.tempKey,
    label: section.title?.trim() || `Section ${index + 1}`,
    sectionType: section.sectionType,
  }));

  if (loading) {
    return (
      <AdminConsoleShell
        title={isEditMode ? 'Edit Knowledge Article' : 'Create Knowledge Article'}
        subtitle="Loading editor permissions and content details."
        backHref="/dashboard/knowledge-admin"
        backLabel="Back to article list"
      >
        <AdminRouteState
          state="loading"
          title="Checking editor permissions"
          description="Validating admin role and loading editor context."
        />
      </AdminConsoleShell>
    );
  }

  if (!user) {
    return (
      <AdminAccessState
        title="Sign in required"
        description="This Knowledge Hub editor is only available to authenticated internal users."
      />
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <AdminAccessState
        title="Admin access required"
        description="The Knowledge Hub editor is restricted to platform admins so article publishing stays controlled."
      />
    );
  }

  if (!isOnline) {
    return (
      <AdminConsoleShell
        title={isEditMode ? 'Edit Knowledge Article' : 'Create Knowledge Article'}
        subtitle="Knowledge Hub editorial workspace"
        backHref="/dashboard/knowledge-admin"
        backLabel="Back to article list"
      >
        <AdminRouteState
          state="offline"
          title="You're offline"
          description="Reconnect to create or edit Knowledge Hub articles."
        />
      </AdminConsoleShell>
    );
  }

  if (optionsQuery.isLoading || (articleId && articleQuery.isLoading)) {
    return (
      <AdminConsoleShell
        title={isEditMode ? 'Edit Knowledge Article' : 'Create Knowledge Article'}
        subtitle="Knowledge Hub editorial workspace"
        backHref="/dashboard/knowledge-admin"
        backLabel="Back to article list"
      >
        <AdminRouteState
          state="loading"
          title="Loading Knowledge Hub editor"
          description="Fetching categories, tags, tools, and article content."
        />
      </AdminConsoleShell>
    );
  }

  if (optionsQuery.isError) {
    return (
      <AdminConsoleShell
        title={isEditMode ? 'Edit Knowledge Article' : 'Create Knowledge Article'}
        subtitle="Knowledge Hub editorial workspace"
        backHref="/dashboard/knowledge-admin"
        backLabel="Back to article list"
      >
        <AdminRouteState
          state="error"
          title="Editor options unavailable"
          description={getErrorMessage(optionsQuery.error)}
        />
      </AdminConsoleShell>
    );
  }

  if (articleId && articleQuery.isError) {
    return (
      <AdminConsoleShell
        title="Edit Knowledge Article"
        subtitle="Knowledge Hub editorial workspace"
        backHref="/dashboard/knowledge-admin"
        backLabel="Back to article list"
      >
        <AdminRouteState
          state="error"
          title="Article unavailable"
          description={getErrorMessage(articleQuery.error)}
        />
      </AdminConsoleShell>
    );
  }

  if (articleId && !articleQuery.data) {
    return (
      <AdminConsoleShell
        title="Edit Knowledge Article"
        subtitle="Knowledge Hub editorial workspace"
        backHref="/dashboard/knowledge-admin"
        backLabel="Back to article list"
      >
        <AdminRouteState
          state="empty"
          title="Article not found"
          description="This Knowledge Hub article could not be found. It may have been deleted or the ID may be incorrect."
          action={
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/dashboard/knowledge-admin">Back to article list</Link>
            </Button>
          }
        />
      </AdminConsoleShell>
    );
  }

  const options = optionsQuery.data as KnowledgeEditorOptions;
  const currentArticle = articleQuery.data as KnowledgeEditorArticle | undefined;

  return (
    <AdminConsoleShell
      title={isEditMode ? 'Edit Knowledge Article' : 'Create Knowledge Article'}
      subtitle="Manage article details, taxonomy, sections, linked tools, and CTA modules."
      backHref="/dashboard/knowledge-admin"
      backLabel="Back to article list"
      actions={
        <Button
          onClick={form.handleSubmit((values) => saveMutation.mutate(values))}
          disabled={saveMutation.isPending}
          className="rounded-full"
        >
          {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isEditMode ? 'Save article' : 'Create article'}
        </Button>
      }
      chips={
        <>
          <Badge className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold tracking-normal text-white hover:bg-slate-900">
            Knowledge Admin
          </Badge>
          {currentArticle?.status ? (
            <Badge
              variant="outline"
              className="rounded-full border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-normal text-slate-600"
            >
              {currentArticle.status.replace(/_/g, ' ')}
            </Badge>
          ) : null}
        </>
      }
    >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <Link
                href="/dashboard/knowledge-admin"
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to article list
              </Link>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold tracking-normal text-white hover:bg-slate-900">
                    Knowledge Admin
                  </Badge>
                  {currentArticle?.status ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-normal text-slate-600"
                    >
                      {currentArticle.status.replace(/_/g, ' ')}
                    </Badge>
                  ) : null}
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                  {isEditMode ? 'Edit Knowledge Article' : 'Create Knowledge Article'}
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                  Manage article details, taxonomy, sections, linked tools, and CTA modules without touching Prisma
                  seed files.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {currentArticle?.slug ? (
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={`/knowledge/${currentArticle.slug}`} target="_blank">
                    Open live article
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
              <CardContent className="flex flex-wrap items-center gap-4 px-6 py-5 text-sm text-slate-600">
                <div>
                  <span className="font-medium text-slate-900">Status:</span>{' '}
                  {form.watch('status').replace(/_/g, ' ')}
                </div>
                <div>
                  <span className="font-medium text-slate-900">Type:</span>{' '}
                  {form.watch('articleType').replace(/_/g, ' ')}
                </div>
                <div>
                  <span className="font-medium text-slate-900">Published:</span>{' '}
                  {formatDateTime(currentArticle?.publishedAt || form.getValues('publishedAt') || null)}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
              <CardContent className="space-y-2 px-6 py-5 text-sm text-slate-600">
                <p>
                  <span className="font-medium text-slate-900">Updated:</span>{' '}
                  {formatDateTime(currentArticle?.updatedAt)}
                </p>
                <p>
                  <span className="font-medium text-slate-900">Sections:</span> {watchedSections.length}
                </p>
                  <p>
                    <span className="font-medium text-slate-900">Linked tools:</span> {(form.watch('toolLinks') ?? []).length}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">CTAs:</span> {(form.watch('ctas') ?? []).length}
                  </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-950">Article Basics</CardTitle>
                  <CardDescription>Core details used by the listing page and article header.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Top Homeowner Concerns in 2026" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Slug</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="top-homeowner-concerns-in-2026"
                            {...field}
                            onChange={(event) => {
                              setSlugTouched(true);
                              field.onChange(event.target.value);
                            }}
                          />
                        </FormControl>
                        <FormDescription>Lowercase letters, numbers, and hyphens only.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subtitle"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Subtitle</FormLabel>
                        <FormControl>
                          <Input placeholder="A concise supporting line for the article header." {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="excerpt"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Excerpt</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={4}
                            placeholder="Short summary for the listing page and article preview."
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="heroTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hero Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional hero headline" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="heroDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hero Description</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder="Optional hero description" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-950">SEO & Publish Settings</CardTitle>
                  <CardDescription>Editorial state, discovery details, and publish timing.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {options.statuses.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status.replace(/_/g, ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="articleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Article Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select article type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {options.articleTypes.map((articleType) => (
                              <SelectItem key={articleType} value={articleType}>
                                {articleType.replace(/_/g, ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="readingMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reading Minutes</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            placeholder="6"
                            value={getNumberInputValue(field.value)}
                            onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort Order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            value={getNumberInputValue(field.value)}
                            onChange={(event) => field.onChange(event.target.value === '' ? 0 : Number(event.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="publishedAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Published At</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormDescription>Leave blank to stamp the publish time on first publish.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="featured"
                    render={({ field }) => (
                      <FormItem className="rounded-2xl border border-slate-200 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <FormLabel>Featured article</FormLabel>
                            <FormDescription>Give this article featured treatment on the Knowledge Hub listing page.</FormDescription>
                          </div>
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="seoTitle"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>SEO Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional SEO title" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="seoDescription"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>SEO Description</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder="Optional SEO description" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="canonicalUrl"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Canonical URL</FormLabel>
                        <FormControl>
                          <Input placeholder="/knowledge/top-homeowner-concerns-in-2026" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-950">Sections</CardTitle>
                  <CardDescription>Structured blocks rendered on the public article detail page.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sectionsFieldArray.fields.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                      No sections yet. Add one to start structuring the article body.
                    </div>
                  ) : null}

                  {sectionsFieldArray.fields.map((sectionField, index) => (
                    <Card key={sectionField.fieldId} className="rounded-3xl border-slate-200 bg-slate-50/70 shadow-none">
                      <CardHeader className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <CardTitle className="text-lg text-slate-950">
                              {watchedSections[index]?.title?.trim() || `Section ${index + 1}`}
                            </CardTitle>
                            <div className="flex flex-wrap gap-2">
                              <SectionSummaryBadge label={watchedSections[index]?.sectionType || 'TEXT'} />
                              <SectionSummaryBadge label={`Sort ${watchedSections[index]?.sortOrder ?? 0}`} />
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-slate-500 hover:text-rose-600"
                            onClick={() => handleRemoveSection(index, sectionField.tempKey)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`sections.${index}.sectionType`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Section Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Choose a section type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {options.sectionTypes.map((sectionType) => (
                                    <SelectItem key={sectionType} value={sectionType}>
                                      {sectionType.replace(/_/g, ' ')}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`sections.${index}.sortOrder`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sort Order</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  value={getNumberInputValue(field.value)}
                                  onChange={(event) => field.onChange(event.target.value === '' ? 0 : Number(event.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`sections.${index}.title`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Title</FormLabel>
                              <FormControl>
                                <Input placeholder="Section heading" {...field} value={field.value ?? ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`sections.${index}.body`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Body</FormLabel>
                              <FormControl>
                                <Textarea rows={8} placeholder="Write the section body..." {...field} value={field.value ?? ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`sections.${index}.dataJsonText`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>dataJson</FormLabel>
                              <FormControl>
                                <Textarea
                                  rows={6}
                                  className="font-mono text-xs"
                                  placeholder='{"items":["One","Two"]}'
                                  {...field}
                                  value={field.value ?? ''}
                                />
                              </FormControl>
                              <FormDescription>Optional structured data for checklist, fact box, FAQ, or other section-specific rendering.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => sectionsFieldArray.append(createEmptySectionFormValue(nextSortOrder(form.getValues('sections') ?? [])))}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add section
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-950">Recommended Tools</CardTitle>
                  <CardDescription>Attach ProductTool records that should show up as contextual next steps.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {toolLinksFieldArray.fields.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                      No recommended tools linked yet.
                    </div>
                  ) : null}

                  {toolLinksFieldArray.fields.map((toolField, index) => (
                    <Card key={toolField.fieldId} className="rounded-3xl border-slate-200 bg-slate-50/70 shadow-none">
                      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                        <div>
                          <CardTitle className="text-lg text-slate-950">Tool Link {index + 1}</CardTitle>
                          <CardDescription>Choose the product surface and where it should appear.</CardDescription>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-rose-600"
                          onClick={() => toolLinksFieldArray.remove(index)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </CardHeader>
                      <CardContent className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`toolLinks.${index}.productToolId`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Product Tool</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a tool" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {options.productTools.map((tool) => (
                                    <SelectItem key={tool.id} value={tool.id}>
                                      {tool.name} {tool.routePath ? `· ${tool.routePath}` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`toolLinks.${index}.placement`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Placement</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Placement" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {options.toolPlacements.map((placement) => (
                                    <SelectItem key={placement} value={placement}>
                                      {placement.replace(/_/g, ' ')}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`toolLinks.${index}.priority`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Priority</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  value={getNumberInputValue(field.value)}
                                  onChange={(event) => field.onChange(event.target.value === '' ? 0 : Number(event.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`toolLinks.${index}.anchorSectionTempKey`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Anchor Section</FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(value === '__none' ? '' : value)}
                                value={field.value || '__none'}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Optional section anchor" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="__none">No anchor section</SelectItem>
                                  {sectionOptions.map((sectionOption) => (
                                    <SelectItem key={sectionOption.tempKey} value={sectionOption.tempKey}>
                                      {sectionOption.label} · {sectionOption.sectionType}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`toolLinks.${index}.customTitle`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Custom Title</FormLabel>
                              <FormControl>
                                <Input placeholder="Optional override title" {...field} value={field.value ?? ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`toolLinks.${index}.ctaLabel`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CTA Label</FormLabel>
                              <FormControl>
                                <Input placeholder="Open tool" {...field} value={field.value ?? ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`toolLinks.${index}.customBody`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Custom Body</FormLabel>
                              <FormControl>
                                <Textarea rows={4} placeholder="Optional override body copy" {...field} value={field.value ?? ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`toolLinks.${index}.isPrimary`}
                          render={({ field }) => (
                            <FormItem className="rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <FormLabel>Primary recommendation</FormLabel>
                                  <FormDescription>Primary tool links render with the stronger CTA treatment.</FormDescription>
                                </div>
                                <FormControl>
                                  <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} />
                                </FormControl>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() =>
                      toolLinksFieldArray.append(
                        createEmptyToolLinkFormValue((form.getValues('toolLinks') ?? []).length + 1)
                      )
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add tool link
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-950">CTA Modules</CardTitle>
                  <CardDescription>Action cards rendered inline or near the end of the article.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {ctasFieldArray.fields.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                      No CTA modules added yet.
                    </div>
                  ) : null}

                  {ctasFieldArray.fields.map((ctaField, index) => (
                    <Card key={ctaField.fieldId} className="rounded-3xl border-slate-200 bg-slate-50/70 shadow-none">
                      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                        <div>
                          <CardTitle className="text-lg text-slate-950">CTA {index + 1}</CardTitle>
                          <CardDescription>Configure the CTA copy, target, and section placement.</CardDescription>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-rose-600"
                          onClick={() => ctasFieldArray.remove(index)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </CardHeader>
                      <CardContent className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`ctas.${index}.ctaType`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CTA Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select CTA type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {options.ctaTypes.map((ctaType) => (
                                    <SelectItem key={ctaType} value={ctaType}>
                                      {ctaType.replace(/_/g, ' ')}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`ctas.${index}.priority`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Priority</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  value={getNumberInputValue(field.value)}
                                  onChange={(event) => field.onChange(event.target.value === '' ? 0 : Number(event.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`ctas.${index}.title`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Title</FormLabel>
                              <FormControl>
                                <Input placeholder="CTA title" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`ctas.${index}.description`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea rows={3} placeholder="Why should the reader click this action?" {...field} value={field.value ?? ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`ctas.${index}.ctaLabel`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Button Label</FormLabel>
                              <FormControl>
                                <Input placeholder="Open report" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`ctas.${index}.href`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Direct Href</FormLabel>
                              <FormControl>
                                <Input placeholder="/dashboard/coverage-intelligence" {...field} value={field.value ?? ''} />
                              </FormControl>
                              <FormDescription>Optional if you link a ProductTool instead.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`ctas.${index}.productToolId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Linked Product Tool</FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(value === '__none' ? '' : value)}
                                value={field.value || '__none'}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Optional linked tool" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="__none">No linked tool</SelectItem>
                                  {options.productTools.map((tool) => (
                                    <SelectItem key={tool.id} value={tool.id}>
                                      {tool.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`ctas.${index}.sectionTempKey`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Attached Section</FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(value === '__none' ? '' : value)}
                                value={field.value || '__none'}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Optional section placement" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="__none">No section anchor</SelectItem>
                                  {sectionOptions.map((sectionOption) => (
                                    <SelectItem key={sectionOption.tempKey} value={sectionOption.tempKey}>
                                      {sectionOption.label} · {sectionOption.sectionType}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`ctas.${index}.dataPromptKey`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Data Prompt Key</FormLabel>
                              <FormControl>
                                <Input placeholder="Optional product data prompt key" {...field} value={field.value ?? ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`ctas.${index}.visibilityRuleText`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Visibility Rule JSON</FormLabel>
                              <FormControl>
                                <Textarea
                                  rows={5}
                                  className="font-mono text-xs"
                                  placeholder='{"requiresProperty":true}'
                                  {...field}
                                  value={field.value ?? ''}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() =>
                      ctasFieldArray.append(createEmptyCtaFormValue((form.getValues('ctas') ?? []).length + 1))
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add CTA
                  </Button>
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-6">
              <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm xl:sticky xl:top-8">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-950">Taxonomy</CardTitle>
                  <CardDescription>Pick the categories and tags that should shape discovery and filtering.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold tracking-normal text-slate-500">Categories</h3>
                    <div className="space-y-3">
                      {options.categories.map((category) => (
                        <label
                          key={category.id}
                          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-3 py-3 transition-colors hover:border-slate-300"
                        >
                          <Checkbox
                            checked={watchedCategoryIds.includes(category.id)}
                            onCheckedChange={(checked) => handleToggleId('categoryIds', category.id, Boolean(checked))}
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-900">{category.name}</p>
                            {category.description ? <p className="text-xs leading-5 text-slate-500">{category.description}</p> : null}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold tracking-normal text-slate-500">Tags</h3>
                    <div className="space-y-3">
                      {options.tags.map((tag) => (
                        <label
                          key={tag.id}
                          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-3 py-3 transition-colors hover:border-slate-300"
                        >
                          <Checkbox
                            checked={watchedTagIds.includes(tag.id)}
                            onCheckedChange={(checked) => handleToggleId('tagIds', tag.id, Boolean(checked))}
                          />
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-slate-900">{tag.name}</p>
                              {tag.tagGroup ? (
                                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-medium tracking-normal text-slate-500">
                                  {tag.tagGroup.replace(/_/g, ' ')}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-500">{tag.slug}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,1))] shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                    <Sparkles className="h-5 w-5 text-slate-500" />
                    Save notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                  <p>Saving replaces categories, tags, sections, tool links, and CTA rows for this article inside one transaction.</p>
                  <p>Section-linked tools and CTAs are remapped through section temp keys so seeded articles stay editable without duplicating relations.</p>
                  {saveMutation.isError ? (
                    <Alert variant="destructive">
                      <AlertTitle>Last save failed</AlertTitle>
                      <AlertDescription>{getErrorMessage(saveMutation.error)}</AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            </aside>
          </form>
        </Form>
    </AdminConsoleShell>
  );
}
