'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import type { AdminDiyTemplateDetail } from '@/types';
import TemplateForm from '@/components/features/diy/admin/TemplateForm';
import StatusBadge from '@/components/features/diy/admin/StatusBadge';

export default function EditDiyTemplatePage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const templateId = params?.id ?? '';

  const [template, setTemplate] = useState<AdminDiyTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) { router.replace('/dashboard'); return; }
    api.adminGetDiyTemplate(templateId)
      .then(setTemplate)
      .catch(() => setError('Template not found'))
      .finally(() => setLoading(false));
  }, [isAdmin, router, templateId]);

  if (!isAdmin) return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="py-16 text-center text-sm text-neutral-400">Loading…</div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-sm text-red-600">{error || 'Template not found'}</p>
        <Link href="/dashboard/admin/diy/templates" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Back to Templates
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/dashboard/admin/diy/templates"
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          ← Templates
        </Link>
        <span className="text-neutral-300">/</span>
        <h1 className="text-xl font-bold text-neutral-900 flex-1 truncate">{template.title}</h1>
        <StatusBadge status={template.status} />
      </div>
      <TemplateForm templateId={templateId} initial={template} />
    </div>
  );
}
