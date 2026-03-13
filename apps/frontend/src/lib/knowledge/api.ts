import type { KnowledgeArticleDetail, KnowledgeArticleListItem } from './types';

const KNOWLEDGE_API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

type KnowledgeApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

async function knowledgeFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${KNOWLEDGE_API_BASE}${path}`, {
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as KnowledgeApiEnvelope<T> | null;

  if (!response.ok || !payload?.success || payload.data === undefined) {
    const error = new Error(payload?.message || `Knowledge Hub request failed (${response.status})`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload.data;
}

export async function getPublishedKnowledgeArticles(): Promise<KnowledgeArticleListItem[]> {
  const data = await knowledgeFetch<{ articles: KnowledgeArticleListItem[] }>('/api/knowledge/articles');
  return data.articles;
}

export async function getKnowledgeArticleBySlug(slug: string): Promise<KnowledgeArticleDetail | null> {
  try {
    const data = await knowledgeFetch<{ article: KnowledgeArticleDetail }>(
      `/api/knowledge/articles/${encodeURIComponent(slug)}`
    );
    return data.article;
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) {
      return null;
    }
    throw error;
  }
}
