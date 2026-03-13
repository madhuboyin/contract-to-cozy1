'use client';

import { useParams } from 'next/navigation';
import { KnowledgeArticleEditor } from '@/components/knowledge-admin/KnowledgeArticleEditor';

export default function EditKnowledgeArticlePage() {
  const params = useParams<{ id: string }>();

  return <KnowledgeArticleEditor articleId={params.id} />;
}
