'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BookOpenText, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { DashboardShell } from '@/components/DashboardShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getKnowledgeAdminArticles } from '@/lib/knowledge/adminApi';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function AccessState({ title, description }: { title: string; description: string }) {
  return (
    <DashboardShell className="py-10">
      <Card className="rounded-[28px] border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 py-12 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">{description}</p>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/dashboard">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}

export default function KnowledgeAdminPage() {
  const { user, loading } = useAuth();
  const articlesQuery = useQuery({
    queryKey: ['knowledge-admin-articles'],
    queryFn: getKnowledgeAdminArticles,
    enabled: !loading && user?.role === 'ADMIN',
  });
  const articles = articlesQuery.data ?? [];

  if (loading) {
    return (
      <DashboardShell className="py-10">
        <Card className="rounded-[28px] border-slate-200 bg-white shadow-sm">
          <CardContent className="flex items-center justify-center gap-3 py-16 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Checking admin access...
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  if (!user) {
    return <AccessState title="Sign in required" description="This internal Knowledge Hub admin view requires authentication." />;
  }

  if (user.role !== 'ADMIN') {
    return <AccessState title="Admin access required" description="Only CtC admins can manage Knowledge Hub articles." />;
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_30%,#f8fafc_100%)]">
      <DashboardShell className="space-y-8 py-8 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white hover:bg-slate-900">
                Knowledge Admin
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                Internal
              </Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">Knowledge Hub Editor</h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
              Create, publish, and update Knowledge Hub articles with categories, tags, sections, tools, and CTAs.
            </p>
          </div>

          <Button asChild className="rounded-full">
            <Link href="/dashboard/knowledge-admin/new">
              <Plus className="mr-2 h-4 w-4" />
              New article
            </Link>
          </Button>
        </div>

        <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
              <BookOpenText className="h-5 w-5 text-slate-500" />
              Articles
            </CardTitle>
            <CardDescription>Sorted by most recently updated so internal content work stays easy to scan.</CardDescription>
          </CardHeader>
          <CardContent>
            {articlesQuery.isLoading ? (
              <div className="flex items-center justify-center gap-3 py-16 text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading articles...
              </div>
            ) : articlesQuery.isError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                {articlesQuery.error instanceof Error ? articlesQuery.error.message : 'Failed to load knowledge articles.'}
              </div>
            ) : articles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
                No Knowledge Hub articles exist yet. Create the first one to start publishing beyond the seed set.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Read time</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articles.map((article) => (
                      <TableRow key={article.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900">{article.title}</span>
                              {article.featured ? (
                                <Badge className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 hover:bg-sky-100">
                                  Featured
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{article.slug}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                            {article.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-600">{article.articleType.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-slate-600">{formatDateTime(article.publishedAt)}</TableCell>
                        <TableCell className="text-slate-600">{formatDateTime(article.updatedAt)}</TableCell>
                        <TableCell className="text-slate-600">{article.readingMinutes ? `${article.readingMinutes} min` : '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button asChild variant="outline" size="sm" className="rounded-full">
                              <Link href={`/dashboard/knowledge-admin/${article.id}`}>Edit</Link>
                            </Button>
                            <Button asChild variant="ghost" size="sm" className="rounded-full">
                              <Link href={`/knowledge/${article.slug}`} target="_blank">
                                View
                                <ArrowUpRight className="ml-1.5 h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </DashboardShell>
    </div>
  );
}
