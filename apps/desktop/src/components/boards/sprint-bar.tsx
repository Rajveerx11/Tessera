/* eslint-disable */
import { Calendar, Play, CheckCircle } from 'lucide-react';
import { startSprint, completeSprint, fetchSprints, fetchIssues } from '@/lib/ipc/boards';
import { useBoardStore } from '@/stores/board-store';

export function SprintBar() {
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const sprints = useBoardStore((s) => s.sprints);
  const columns = useBoardStore((s) => s.columns);
  const issues = useBoardStore((s) => s.issues);
  const setSprints = useBoardStore((s) => s.setSprints);
  const setIssues = useBoardStore((s) => s.setIssues);

  // Find active sprint
  const activeSprint = sprints.find((s) => s.status === 'active');
  // Find next planned sprint
  const nextPlannedSprint = [...sprints]
    .filter((s) => s.status === 'planned')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

  const currentSprint = activeSprint || nextPlannedSprint;

  if (!currentSprint) {
    return (
      <div className="flex items-center justify-between border-b border-border/40 bg-surface-1/20 px-6 py-2">
        <span className="text-xs text-muted-foreground">No active or planned sprints. Create one in Sprint planning.</span>
      </div>
    );
  }

  // Calculate story points metrics for currentSprint
  const sprintIssues = issues.filter((i) => i.sprintId === currentSprint.id);
  const totalPoints = sprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);

  // Find the Done column (final column by position)
  const doneColumn = [...columns].sort((a, b) => b.position - a.position)[0];
  const completedIssues = doneColumn 
    ? sprintIssues.filter((i) => i.columnId === doneColumn.id)
    : [];
  const completedPoints = completedIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
  const progressPercent = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

  const handleStart = async () => {
    try {
      await startSprint(currentSprint.id);
      if (activeBoardId) {
        const freshSprints = await fetchSprints(activeBoardId);
        setSprints(freshSprints);
      }
    } catch (err) {
      console.error('Failed to start sprint:', err);
    }
  };

  const handleComplete = async () => {
    try {
      await completeSprint(currentSprint.id);
      if (activeBoardId) {
        const freshSprints = await fetchSprints(activeBoardId);
        const freshIssues = await fetchIssues(activeBoardId);
        setSprints(freshSprints);
        setIssues(freshIssues);
      }
    } catch (err) {
      console.error('Failed to complete sprint:', err);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 bg-surface-1/10 px-6 py-2">
      {/* Sprint Title & Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          <Calendar className="size-3.5" />
          {currentSprint.status === 'active' ? 'Active Sprint' : 'Planned Sprint'}
        </div>
        <h4 className="text-sm font-semibold text-foreground">{currentSprint.name}</h4>
        {currentSprint.goal ? (
          <span className="text-xs text-muted-foreground italic border-l border-border/50 pl-3">
            "{currentSprint.goal}"
          </span>
        ) : null}
      </div>

      {/* Progress & Actions */}
      <div className="flex items-center gap-6">
        {/* Story Points Progress */}
        {totalPoints > 0 ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Points: <strong className="text-foreground">{completedPoints}</strong> / {totalPoints}
            </span>
            <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-primary">{progressPercent}%</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">0 Story Points</span>
        )}

        {/* Action Button */}
        {currentSprint.status === 'active' ? (
          <button
            type="button"
            onClick={handleComplete}
            className="flex items-center gap-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/30 px-3 py-1.5 text-xs font-medium text-teal-400 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <CheckCircle className="size-3.5" />
            Complete Sprint
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/95 px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm shadow-primary/20"
          >
            <Play className="size-3.5 fill-current" />
            Start Sprint
          </button>
        )}
      </div>
    </div>
  );
}
