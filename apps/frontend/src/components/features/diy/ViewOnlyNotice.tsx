import { Eye } from 'lucide-react';

/** Shown to a household viewer in place of the DIY write controls the server would refuse them. */
export default function ViewOnlyNotice({ className = '' }: { className?: string }) {
  return (
    <div role="note" data-view-only-notice="" className={`flex items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600 ${className}`}>
      <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>You have view-only access to this home. You can follow along, but only a contributor or owner can start or change DIY projects.</p>
    </div>
  );
}
