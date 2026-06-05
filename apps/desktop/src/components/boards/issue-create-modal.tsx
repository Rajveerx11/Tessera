import { useState, useEffect } from 'react';
import { X, Loader2, Plus, Check } from 'lucide-react';

import { useBoardStore } from '@/stores/board-store';
import type { IssueType, Priority } from '@/stores/board-store';
import { createIssue, fetchIssues, fetchLabels, createLabel } from '@/lib/ipc/boards';

type Props = {
  columnId?: string | null;
  parentId?: string | null;
  onClose: () => void;
};

export function IssueCreateModal({ columnId, parentId, onClose }: Props) {
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const columns = useBoardStore((s) => s.columns);
  const members = useBoardStore((s) => s.members);
  const sprints = useBoardStore((s) => s.sprints);
  const labels = useBoardStore((s) => s.labels);
  const setIssues = useBoardStore((s) => s.setIssues);
  const setLabels = useBoardStore((s) => s.setLabels);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [issueType, setIssueType] = useState<IssueType>('task');
  const [priority, setPriority] = useState<Priority>('medium');
  const [selectedColumnId, setSelectedColumnId] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [storyPoints, setStoryPoints] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');
  const [showNewLabelForm, setShowNewLabelForm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set default column if provided
  useEffect(() => {
    if (columnId) {
      setSelectedColumnId(columnId);
    } else if (columns.length > 0) {
      setSelectedColumnId(columns[0]?.id || '');
    }
  }, [columnId, columns]);

  // Load labels for this board if empty
  useEffect(() => {
    if (activeBoardId && labels.length === 0) {
      fetchLabels(activeBoardId)
        .then(setLabels)
        .catch((err) => console.error('Failed to load board labels:', err));
    }
  }, [activeBoardId, labels.length, setLabels]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBoardId) return;
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        issueType,
        priority,
        columnId: selectedColumnId,
      };

      if (sprintId) payload.sprintId = sprintId;
      if (parentId) payload.parentId = parentId;
      if (assigneeId) payload.assigneeId = assigneeId;
      if (storyPoints) payload.storyPoints = parseInt(storyPoints, 10);
      if (dueDate) payload.dueDate = new Date(dueDate).toISOString();
      if (gitBranch.trim()) payload.gitBranch = gitBranch.trim();
      if (selectedLabelIds.length > 0) payload.labelIds = selectedLabelIds;

      await createIssue(activeBoardId, payload);

      // Reload issues to get fully detailed issue list
      const freshIssues = await fetchIssues(activeBoardId);
      setIssues(freshIssues);

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create issue.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLabel = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!activeBoardId || !newLabelName.trim()) return;

    try {
      const created = await createLabel(activeBoardId, {
        name: newLabelName.trim(),
        color: newLabelColor,
      });

      setLabels([...labels, created]);
      setSelectedLabelIds([...selectedLabelIds, created.id]);
      setNewLabelName('');
      setShowNewLabelForm(false);
    } catch (err) {
      console.error('Failed to create label:', err);
    }
  };

  const toggleLabel = (labelId: string) => {
    if (selectedLabelIds.includes(labelId)) {
      setSelectedLabelIds(selectedLabelIds.filter((id) => id !== labelId));
    } else {
      setSelectedLabelIds([...selectedLabelIds, labelId]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface-2 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
          <h3 className="text-base font-bold text-foreground">
            {parentId ? 'Create Subtask' : 'Create Issue'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="custom-scrollbar flex-1 overflow-y-auto p-6 space-y-5">
          {error ? (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive font-medium">
              {error}
            </div>
          ) : null}

          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="issue-title" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Issue Title <span className="text-destructive">*</span>
            </label>
            <input
              id="issue-title"
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement user login session"
              className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label htmlFor="issue-desc" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Description (Markdown)
            </label>
            <textarea
              id="issue-desc"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue, acceptance criteria, etc."
              className="w-full rounded-lg border border-border/60 bg-background/50 p-3 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-y min-h-[100px]"
            />
          </div>

          {/* Dropdowns row 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Issue Type */}
            <div className="space-y-1.5">
              <label htmlFor="issue-type" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Issue Type
              </label>
              <select
                id="issue-type"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value as IssueType)}
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-foreground outline-none focus:border-primary/50 transition-all"
              >
                <option value="task">Task</option>
                <option value="story">Story</option>
                <option value="bug">Bug</option>
                <option value="epic">Epic</option>
                <option value="subtask">Subtask</option>
              </select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label htmlFor="issue-priority" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Priority
              </label>
              <select
                id="issue-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-foreground outline-none focus:border-primary/50 transition-all"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="trivial">Trivial</option>
              </select>
            </div>
          </div>

          {/* Dropdowns row 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Column / Status */}
            <div className="space-y-1.5">
              <label htmlFor="issue-column" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Status Column
              </label>
              <select
                id="issue-column"
                value={selectedColumnId}
                onChange={(e) => setSelectedColumnId(e.target.value)}
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-foreground outline-none focus:border-primary/50 transition-all"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sprint */}
            <div className="space-y-1.5">
              <label htmlFor="issue-sprint" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Sprint
              </label>
              <select
                id="issue-sprint"
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-foreground outline-none focus:border-primary/50 transition-all"
              >
                <option value="">Backlog (No Sprint)</option>
                {sprints
                  .filter((s) => s.status !== 'completed')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Dropdowns row 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Assignee */}
            <div className="space-y-1.5 col-span-1 sm:col-span-2">
              <label htmlFor="issue-assignee" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Assignee
              </label>
              <select
                id="issue-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-foreground outline-none focus:border-primary/50 transition-all"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.userId}>
                    {m.user?.displayName || m.userId}
                  </option>
                ))}
              </select>
            </div>

            {/* Story Points */}
            <div className="space-y-1.5">
              <label htmlFor="issue-points" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Story Points
              </label>
              <input
                id="issue-points"
                type="number"
                min="0"
                max="100"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                placeholder="e.g. 5"
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {/* Date and Git integration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Due Date */}
            <div className="space-y-1.5">
              <label htmlFor="issue-due" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Due Date
              </label>
              <input
                id="issue-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Git Branch */}
            <div className="space-y-1.5">
              <label htmlFor="issue-branch" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Git Branch Name
              </label>
              <input
                id="issue-branch"
                type="text"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                placeholder="e.g. feature/login-session"
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {/* Labels Section */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Labels
            </label>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => {
                const isSelected = selectedLabelIds.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLabel(l.id)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border transition-all"
                    style={{
                      backgroundColor: isSelected ? `${l.color}18` : 'transparent',
                      borderColor: isSelected ? l.color : '#3d4947',
                      color: isSelected ? l.color : '#94a3b8',
                    }}
                  >
                    {isSelected && <Check className="size-3" />}
                    {l.name}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setShowNewLabelForm(!showNewLabelForm)}
                className="flex items-center gap-1 rounded-full border border-dashed border-border/60 bg-surface-1/40 px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
              >
                <Plus className="size-3" />
                Add Label
              </button>
            </div>

            {showNewLabelForm && (
              <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface-1/30 p-3 mt-2">
                <input
                  type="text"
                  required
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Label name"
                  className="h-8 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                />
                
                <input
                  type="color"
                  value={newLabelColor}
                  onChange={(e) => setNewLabelColor(e.target.value)}
                  className="size-8 rounded cursor-pointer border border-border"
                />

                <button
                  type="button"
                  onClick={handleCreateLabel}
                  className="h-8 rounded bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewLabelForm(false)}
                  className="h-8 rounded border border-border px-3 text-xs text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border/40 px-6 py-4 bg-background/25">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary hover:bg-primary/95 px-4 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/10 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            Create Issue
          </button>
        </div>
      </div>
    </div>
  );
}
