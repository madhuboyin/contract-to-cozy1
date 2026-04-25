'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BookOpenText, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
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
import { AdminAccessState, AdminConsoleShell, AdminRouteState, useAdminOnlineStatus } from '@/components/ops/AdminConsoleShell';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export default function KnowledgeAdminPage() {
  const { user, loading } = useAuth();
  const isOnline = useAdminOnlineStatus();
  const articlesQuery = useQuery({
    queryKey: ['knowledge-admin-articles'],
    queryFn: getKnowledgeAdminArticles,
    enabled: !loading && user?.role === 'ADMIN',
  });
  const articles = articlesQuery.data ?? [];

  if (loading) {
    return (
      <AdminConsoleShell title="Knowledge Hub Editor" subtitle="Loading editor access and article records.">
        <AdminRouteState
          state="loading"
          title="Checking admin access"
          description="Verifying authentication and role permissions for Knowledge Hub operations."
        />
      </AdminConsoleShell>
    );
  }

  if (!user) {
    return <AdminAccessState title="Sign in required" description="This internal Knowledge Hub admin view requires authentication." />;
  }

  if (user.role !== 'ADMIN') {
    return <AdminAccessState title="Admin access required" description="Only platform admins can manage Knowledge Hub articles." />;
  }

  if (!isOnline) {
    return (
      <AdminConsoleShell title="Knowledge Hub Editor" subtitle="Create, publish, and maintain homeowner knowledge articles.">
        <AdminRouteState
          state="offline"
          title="You're offline"
          description="Knowledge admin actions require a live connection. Reconnect to manage articles."
        />
      </AdminConsoleShell>
    );
  }

  return (
    <AdminConsoleShell
      title="Knowledge Hub Editor"
      subtitle="Create, publish, and update homeowner knowledge articles with clear taxonomy and operational visibility."
      actions={
        <Button asChild className="rounded-full">
          <Link href="/dashboard/knowledge-admin/new">
            <Plus className="mr-2 h-4 w-4" />
            New article
          </Link>
        </Button>
      }
      chips={
        <>
          <Badge className="rounded px-2 py-0.5 text-[10px] font-semibold tracking-normal">Knowledge Admin</Badge>
          <Badge variant="outline" className="rounded border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-normal text-slate-600">
            Internal
          </Badge>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {articles.length} articles
          </span>
        </>
      }
    >

        <Card className="rounded-2xl border-slate-200/80 bg-white shadow-sm">
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
              <AdminRouteState
                state="error"
                title="Unable to load articles"
                description={articlesQuery.error instanceof Error ? articlesQuery.error.message : 'Failed to load knowledge articles.'}
              />
            ) : articles.length === 0 ? (
              <AdminRouteState
                state="empty"
                title="No Knowledge Hub articles yet"
                description="Create the first article to start publishing beyond the seed set."
                action={
                  <Button asChild className="rounded-full">
                    <Link href="/dashboard/knowledge-admin/new">Create first article</Link>
                  </Button>
                }
              />
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
                                <Badge className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-semibold tracking-normal text-sky-700 hover:bg-sky-100">
                                  Featured
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{article.slug}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold tracking-normal text-slate-600">
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
    </AdminConsoleShell>
  );
}
