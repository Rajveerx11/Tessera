import { Bug, FileText, Layers, Bookmark, GitBranch, type LucideIcon } from 'lucide-react';
import { type IssueType } from '@/stores/board-store';

import { PriorityBadge } from '@/components/boards/priority-badge';
import { MemberAvatar } from '@/components/boards/member-avatar';
import type { Issue } from '@/stores/board-store';

// ── Issue type icon mapping ───────────────────────────────────────────

const TYPE_ICON: Record<IssueType, { Icon: LucideIcon; color: string }> = {
  epic: { Icon: Layers, color: '#a78bfa' },
  story: { Icon: Bookmark, color: '#6bd8cb' },
  task: { Icon: FileText, color: '#4cd7f6' },
  bug: { Icon: Bug, color: '#ffb4ab' },
  subtask: { Icon: GitBranch, color: '#94a3b8' },
};

type Props = {
  issue: Issue;
  onClick?: () => void;
  isDragging?: boolean;
};

export function IssueCard({ issue, onClick, isDragging = false }: Props) {
  const { Icon, color } = TYPE_ICON[issue.issueType];
  const hasStoryPoints = issue.storyPoints !== undefined && issue.storyPoints !== null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`group w-full cursor-pointer rounded-lg border border-border bg-card p-3 text-left transition-all duration-150 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 ${
        isDragging
          ? 'opacity-40 bg-muted/40 border-dashed border-muted-foreground/30 shadow-none'
          : ''
      }`}
    >
      {/* Header: type icon + key */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0" style={{ color }} />
        <span className="text-[10px] font-mono text-muted-foreground">
          {issue.issueKey}
        </span>
      </div>

      {/* Title */}
      <p className="mb-2 text-sm font-medium leading-snug text-foreground line-clamp-2">
        {issue.title}
      </p>

      {/* Labels row */}
      {issue.labels.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((label) => (
            <span
              key={label.id}
              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
              style={{
                color: label.color,
                backgroundColor: `${label.color}22`,
              }}
            >
              {label.name}
            </span>
          ))}
          {issue.labels.length > 3 ? (
            <span className="text-[9px] text-muted-foreground">
              +{issue.labels.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Footer: priority + story points + due date + assignee */}
      <div className="flex items-center justify-between gap-1.5 mt-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <PriorityBadge priority={issue.priority} size="sm" />

          {hasStoryPoints ? (
            <span className="flex size-4.5 items-center justify-center rounded bg-muted text-[9px] font-bold text-muted-foreground shrink-0">
              {issue.storyPoints}
            </span>
          ) : null}

          {issue.dueDate ? (
            <span className="text-[9px] text-muted-foreground truncate max-w-[65px] sm:max-w-none">
              {formatDueDate(issue.dueDate)}
            </span>
          ) : null}

          {(issue.commentCount ?? 0) > 0 ? (
            <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground shrink-0">
              <svg
                className="size-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {issue.commentCount}
            </span>
          ) : null}
        </div>

        <div className="shrink-0">
          <MemberAvatar user={issue.assignee ?? null} size="sm" />
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `${diffDays}d`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
