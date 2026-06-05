import { useCallback } from 'react';

import { KanbanColumn } from '@/components/boards/kanban-column';
import { moveIssue } from '@/lib/ipc/boards';
import { useBoardStore } from '@/stores/board-store';

type Props = {
  onIssueClick: (issueId: string) => void;
  onCreateIssue: (columnId: string) => void;
};

export function KanbanBoard({ onIssueClick, onCreateIssue }: Props) {
  const columns = useBoardStore((s) => s.columns);
  const issues = useBoardStore((s) => s.issues);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const moveIssueOptimistic = useBoardStore((s) => s.moveIssueOptimistic);
  const setIssues = useBoardStore((s) => s.setIssues);

  // Filters state
  const filterAssignee = useBoardStore((s) => s.filterAssignee);
  const filterPriority = useBoardStore((s) => s.filterPriority);
  const filterType = useBoardStore((s) => s.filterType);
  const filterSprint = useBoardStore((s) => s.filterSprint);
  const searchQuery = useBoardStore((s) => s.searchQuery).toLowerCase();

  const handleDrop = useCallback(
    async (issueId: string, columnId: string, position: number) => {
      // Find the issue to verify it's changing column or position
      const issue = issues.find((i) => i.id === issueId);
      if (!issue) return;

      if (issue.columnId === columnId && issue.position === position) {
        return; // No change
      }

      // 1. Optimistic update in Zustand store
      moveIssueOptimistic(issueId, columnId, position);

      try {
        // 2. Persist to server
        await moveIssue(issueId, { columnId, position });
      } catch (err) {
        console.error('Failed to move issue:', err);
        // 3. Revert: on failure, we re-fetch the board's issues to restore consistent state
        if (activeBoardId) {
          const { fetchIssues } = await import('@/lib/ipc/boards');
          try {
            const freshIssues = await fetchIssues(activeBoardId);
            setIssues(freshIssues);
          } catch (fetchErr) {
            console.error('Failed to recover issues list after failed move:', fetchErr);
          }
        }
      }
    },
    [issues, moveIssueOptimistic, activeBoardId, setIssues],
  );

  // Filter issues before grouping into columns
  const filteredIssues = issues.filter((i) => {
    if (searchQuery) {
      const matchKey = i.issueKey.toLowerCase().includes(searchQuery);
      const matchTitle = i.title.toLowerCase().includes(searchQuery);
      const matchDesc = (i.description || '').toLowerCase().includes(searchQuery);
      if (!matchKey && !matchTitle && !matchDesc) return false;
    }
    if (filterAssignee) {
      if (filterAssignee === 'unassigned') {
        if (i.assigneeId) return false;
      } else if (i.assigneeId !== filterAssignee) {
        return false;
      }
    }
    if (filterPriority && i.priority !== filterPriority) return false;
    if (filterType && i.issueType !== filterType) return false;
    if (filterSprint) {
      if (filterSprint === 'backlog') {
        if (i.sprintId) return false;
      } else if (i.sprintId !== filterSprint) {
        return false;
      }
    }
    return true;
  });

  const sortedColumns = [...columns].sort((a, b) => a.position - b.position);

  if (sortedColumns.length === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-border/40 bg-surface-1/50 backdrop-blur-sm p-8 text-center">
        <p className="text-sm text-muted-foreground">This board has no columns configured.</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Go to Board Settings to add columns.
        </p>
      </div>
    );
  }

  return (
    <div className="custom-scrollbar flex flex-1 gap-4 overflow-x-auto pb-4 pr-4">
      {sortedColumns.map((column) => {
        const columnIssues = filteredIssues.filter((i) => i.columnId === column.id);
        return (
          <KanbanColumn
            key={column.id}
            column={column}
            issues={columnIssues}
            onIssueClick={onIssueClick}
            onCreateIssue={onCreateIssue}
            onDrop={handleDrop}
          />
        );
      })}
    </div>
  );

}
