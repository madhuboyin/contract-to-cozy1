'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
import TemplateForm from '@/components/features/diy/admin/TemplateForm';

export default function NewDiyTemplatePage() {
  const { isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAdmin) router.replace('/dashboard');
  }, [isAdmin, router]);

  if (!isAdmin) return null;

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
        <h1 className="text-xl font-bold text-neutral-900">New Template</h1>
      </div>
      <TemplateForm />
    </div>
  );
}
