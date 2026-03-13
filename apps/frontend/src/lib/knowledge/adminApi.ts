import { api } from '@/lib/api/client';
import type {
  KnowledgeAdminListItem,
  KnowledgeArticleUpsertPayload,
  KnowledgeEditorArticle,
  KnowledgeEditorOptions,
} from './editor';

export async function getKnowledgeAdminArticles(): Promise<KnowledgeAdminListItem[]> {
  const { data } = await api.get<{ articles: KnowledgeAdminListItem[] }>('/api/knowledge/admin/articles');
  return data.articles;
}

export async function getKnowledgeEditorOptions(): Promise<KnowledgeEditorOptions> {
  const { data } = await api.get<KnowledgeEditorOptions>('/api/knowledge/admin/options');
  return data;
}

export async function getKnowledgeAdminArticle(articleId: string): Promise<KnowledgeEditorArticle> {
  const { data } = await api.get<{ article: KnowledgeEditorArticle }>(`/api/knowledge/admin/articles/${articleId}`);
  return data.article;
}

export async function createKnowledgeAdminArticle(payload: KnowledgeArticleUpsertPayload): Promise<KnowledgeEditorArticle> {
  const { data } = await api.post<{ article: KnowledgeEditorArticle }>('/api/knowledge/admin/articles', payload);
  return data.article;
}

export async function updateKnowledgeAdminArticle(
  articleId: string,
  payload: KnowledgeArticleUpsertPayload
): Promise<KnowledgeEditorArticle> {
  const { data } = await api.put<{ article: KnowledgeEditorArticle }>(`/api/knowledge/admin/articles/${articleId}`, payload);
  return data.article;
}
