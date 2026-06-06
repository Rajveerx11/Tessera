import { type Priority } from '@/stores/board-store';

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: '#ffb4ab', bg: 'rgba(255, 180, 171, 0.15)' },
  high: { label: 'High', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  medium: { label: 'Medium', color: '#6bd8cb', bg: 'rgba(107, 216, 203, 0.15)' },
  low: { label: 'Low', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
  trivial: { label: 'Trivial', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)' },
};

type Props = {
  priority: Priority;
  size?: 'sm' | 'md';
};

export function PriorityBadge({ priority, size = 'sm' }: Props) {
  const cfg = PRIORITY_CONFIG[priority];
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses}`}
      style={{ color: cfg.color, backgroundColor: cfg.bg }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: cfg.color }}
        aria-hidden="true"
      />
      {cfg.label}
    </span>
  );
}
