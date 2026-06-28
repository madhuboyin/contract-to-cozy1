import type { PermitRecordStatus } from '@/types';
import { STATUS_LABELS, STATUS_COLOR } from './PermitUtils';

interface Props {
  status: PermitRecordStatus;
  size?: 'sm' | 'md';
}

export default function PermitStatusBadge({ status, size = 'md' }: Props) {
  const base = 'inline-flex items-center rounded-full font-medium';
  const sizes = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`${base} ${sizes} ${STATUS_COLOR[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
