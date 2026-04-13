import { headers } from 'next/headers';
import type { KnowledgeArticleDetail, KnowledgeArticleListItem } from './types';

type KnowledgeApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

async function getKnowledgeApiBase(): Promise<string> {
  if (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host');

  if (host) {
    if (host.includes('localhost') || host.startsWith('127.0.0.1')) {
      return 'http://localhost:8080';
    }

    if (host.includes('contracttocozy.com')) {
      return 'https://api.contracttocozy.com';
    }

    const proto = requestHeaders.get('x-forwarded-proto') || 'https';
    return `${proto}://${host}`;
  }

  return 'http://localhost:8080';
}

async function knowledgeFetch<T>(path: string): Promise<T> {
  const baseUrl = await getKnowledgeApiBase();
  const response = await fetch(`${baseUrl}${path}`, {
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
