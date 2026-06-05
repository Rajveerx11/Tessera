import { useState } from 'react';
import { Search, X, RotateCw } from 'lucide-react';

import { useBoardStore } from '@/stores/board-store';
import type { IssueType, Priority } from '@/stores/board-store';

export function FiltersBar() {
  const members = useBoardStore((s) => s.members);
  const sprints = useBoardStore((s) => s.sprints);
  
  // Active context for refresh
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const activeTeamId = useBoardStore((s) => s.activeTeamId);
  const setIssues = useBoardStore((s) => s.setIssues);
  const setSprints = useBoardStore((s) => s.setSprints);
  const setColumns = useBoardStore((s) => s.setColumns);
  const setMembers = useBoardStore((s) => s.setMembers);

  // Local state for refresh button animation
  const [refreshing, setRefreshing] = useState(false);

  // Filters state
  const filterAssignee = useBoardStore((s) => s.filterAssignee);
  const filterPriority = useBoardStore((s) => s.filterPriority);
  const filterType = useBoardStore((s) => s.filterType);
  const filterSprint = useBoardStore((s) => s.filterSprint);
  const searchQuery = useBoardStore((s) => s.searchQuery);

  // Filters actions
  const setFilterAssignee = useBoardStore((s) => s.setFilterAssignee);
  const setFilterPriority = useBoardStore((s) => s.setFilterPriority);
  const setFilterType = useBoardStore((s) => s.setFilterType);
  const setFilterSprint = useBoardStore((s) => s.setFilterSprint);
  const setSearchQuery = useBoardStore((s) => s.setSearchQuery);
  const clearFilters = useBoardStore((s) => s.clearFilters);

  const hasActiveFilters =
    filterAssignee !== null ||
    filterPriority !== null ||
    filterType !== null ||
    filterSprint !== null ||
    searchQuery !== '';

  const handleRefresh = async () => {
    if (!activeBoardId) return;
    setRefreshing(true);
    try {
      const { fetchIssues, fetchSprints, fetchColumns, fetchTeamMembers } = await import('@/lib/ipc/boards');
      
      const [issues, sprints, columns] = await Promise.all([
        fetchIssues(activeBoardId),
        fetchSprints(activeBoardId),
        fetchColumns(activeBoardId),
      ]);
      
      setIssues(issues);
      setSprints(sprints);
      setColumns(columns);

      if (activeTeamId) {
        const freshMembers = await fetchTeamMembers(activeTeamId);
        setMembers(freshMembers);
      }
    } catch (err) {
      console.error('Failed to refresh board data:', err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-surface-1/30 px-6 py-3">
      {/* Search Input */}
      <div className="relative w-64">
        <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
          <Search className="size-4" />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search issues by key, title..."
          className="h-9 w-full rounded-lg border border-border/50 bg-background/50 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        />
      </div>

      {/* Assignee Filter */}
      <select
        value={filterAssignee || ''}
        onChange={(e) => setFilterAssignee(e.target.value || null)}
        className="h-9 rounded-lg border border-border/50 bg-background/50 px-3 text-xs text-foreground outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
      >
        <option value="">All Assignees</option>
        <option value="unassigned">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.userId}>
            {m.user?.displayName || m.userId}
          </option>
        ))}
      </select>

      {/* Type Filter */}
      <select
        value={filterType || ''}
        onChange={(e) => setFilterType((e.target.value as IssueType) || null)}
        className="h-9 rounded-lg border border-border/50 bg-background/50 px-3 text-xs text-foreground outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
      >
        <option value="">All Types</option>
        <option value="epic">Epic</option>
        <option value="story">Story</option>
        <option value="task">Task</option>
        <option value="bug">Bug</option>
        <option value="subtask">Subtask</option>
      </select>

      {/* Priority Filter */}
      <select
        value={filterPriority || ''}
        onChange={(e) => setFilterPriority((e.target.value as Priority) || null)}
        className="h-9 rounded-lg border border-border/50 bg-background/50 px-3 text-xs text-foreground outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
      >
        <option value="">All Priorities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="trivial">Trivial</option>
      </select>

      {/* Sprint Filter */}
      <select
        value={filterSprint || ''}
        onChange={(e) => setFilterSprint(e.target.value || null)}
        className="h-9 rounded-lg border border-border/50 bg-background/50 px-3 text-xs text-foreground outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
      >
        <option value="">All Sprints</option>
        <option value="backlog">Backlog (No Sprint)</option>
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.status})
          </option>
        ))}
      </select>

      {/* Clear Filters Button */}
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={clearFilters}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-surface-1/50 px-3 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-all"
        >
          <X className="size-3.5" />
          Clear Filters
        </button>
      ) : null}

      {/* Spacer to push refresh to the right */}
      <div className="flex-1" />

      {/* Refresh Button */}
      {activeBoardId && (
        <button
          type="button"
          disabled={refreshing}
          onClick={handleRefresh}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-background/50 hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95 disabled:opacity-50"
          title="Refresh Board Data"
        >
          <RotateCw className={`size-4.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
        </button>
      )}
    </div>
  );
}
