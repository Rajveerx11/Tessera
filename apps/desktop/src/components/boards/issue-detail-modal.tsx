/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  X, 
  Trash2, 
  Send, 
  GitBranch, 
  Copy, 
  Check, 
  MessageSquare, 
  History 
} from 'lucide-react';

import { useBoardStore } from '@/stores/board-store';
import type { Issue, Priority } from '@/stores/board-store';
import { MemberAvatar } from '@/components/boards/member-avatar';
import { 
  fetchIssue, 
  updateIssue, 
  deleteIssue, 
  moveIssue,
  fetchComments, 
  createComment, 
  deleteComment,
  fetchActivityLogs,
  fetchIssues
} from '@/lib/ipc/boards';

type Props = {
  issueId: string;
  onClose: () => void;
};

export function IssueDetailModal({ issueId, onClose }: Props) {
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const columns = useBoardStore((s) => s.columns);
  const members = useBoardStore((s) => s.members);
  const sprints = useBoardStore((s) => s.sprints);
  
  const comments = useBoardStore((s) => s.comments);
  const activities = useBoardStore((s) => s.activities);
  const setComments = useBoardStore((s) => s.setComments);
  const setActivities = useBoardStore((s) => s.setActivities);
  const setIssues = useBoardStore((s) => s.setIssues);

  const [issue, setLocalIssue] = useState<Issue | null>(null);
  
  // Edit states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState('');
  
  // Comments state
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');

  // Load issue details
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const freshDetail = await fetchIssue(issueId);
        if (!active) return;
        setLocalIssue(freshDetail);
        setTitleInput(freshDetail.title);
        setDescInput(freshDetail.description || '');

        const freshComments = await fetchComments(issueId);
        if (!active) return;
        setComments(freshComments);

        const freshLogs = await fetchActivityLogs(issueId);
        if (!active) return;
        setActivities(freshLogs);
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load issue details');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => { active = false; };
  }, [issueId, setComments, setActivities]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-2 p-6 border border-border">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs text-muted-foreground">Loading issue details...</span>
        </div>
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
        <div className="w-full max-w-md rounded-xl bg-surface-2 p-6 border border-border text-center">
          <h4 className="text-sm font-bold text-destructive">Error</h4>
          <p className="mt-2 text-xs text-muted-foreground">{error || 'Issue not found'}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg bg-surface-3 px-4 py-2 text-xs text-foreground hover:bg-surface-3/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Branch name helper
  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  };
  const suggestedBranchName = `feature/${issue.issueKey}-${slugify(issue.title)}`;

  const handleCopyBranch = () => {
    navigator.clipboard.writeText(suggestedBranchName);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateBranch = async () => {
    try {
      // 1. Save branch name on issue in server
      const updated = await updateIssue(issueId, { gitBranch: suggestedBranchName });
      setLocalIssue(updated);
      
      // 2. Trigger Tauri shell command to checkout branch locally if desired, 
      // or simply copy to clipboard as success
      navigator.clipboard.writeText(`git checkout -b ${suggestedBranchName}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Re-fetch board issues list
      if (activeBoardId) {
        const freshIssues = await fetchIssues(activeBoardId);
        setIssues(freshIssues);
      }
    } catch (err) {
      console.error('Failed to set Git branch:', err);
    }
  };

  const handleUpdateField = async (fields: any) => {
    if (!activeBoardId) return;
    try {
      let updated;
      if (fields.columnId) {
        // Status column change uses moveIssue specifically
        updated = await moveIssue(issueId, { columnId: fields.columnId, position: 0 });
      } else {
        // Other fields use updateIssue
        updated = await updateIssue(issueId, fields);
      }
      setLocalIssue(updated);

      // Re-fetch issues list for Kanban view updates
      const freshIssues = await fetchIssues(activeBoardId);
      setIssues(freshIssues);

      // Refresh activity logs
      const freshLogs = await fetchActivityLogs(issueId);
      setActivities(freshLogs);
    } catch (err) {
      console.error('Failed to update issue field:', err);
    }
  };

  const handleSaveTitle = async () => {
    if (!titleInput.trim() || titleInput === issue.title) {
      setIsEditingTitle(false);
      return;
    }
    setIsEditingTitle(false);
    await handleUpdateField({ title: titleInput.trim() });
  };

  const handleSaveDesc = async () => {
    setIsEditingDesc(false);
    await handleUpdateField({ description: descInput.trim() });
  };

  const handleDeleteIssue = async () => {
    if (!activeBoardId) return;
    if (!confirm('Are you sure you want to delete this issue?')) return;
    try {
      await deleteIssue(issueId);
      const freshIssues = await fetchIssues(activeBoardId);
      setIssues(freshIssues);
      onClose();
    } catch (err) {
      console.error('Failed to delete issue:', err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmittingComment(true);

    try {
      const created = await createComment(issueId, { body: newComment.trim() });
      setComments([...comments, created]);
      setNewComment('');

      // Refresh activity logs
      const freshLogs = await fetchActivityLogs(issueId);
      setActivities(freshLogs);
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await deleteComment(commentId);
      setComments(comments.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex h-[90vh] w-full max-w-4xl rounded-xl border border-border bg-surface-2 shadow-2xl overflow-hidden">
        {/* Main layout: 2 columns */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 px-6 py-3 bg-surface-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-primary">{issue.issueKey}</span>
              <span className="text-[10px] uppercase font-bold opacity-60 bg-muted px-2 py-0.5 rounded border border-border/30">
                {issue.issueType}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeleteIssue}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                title="Delete Issue"
              >
                <Trash2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="size-4.5" />
              </button>
            </div>
          </div>

          {/* Left scrollable content */}
          <div className="custom-scrollbar flex-1 overflow-y-auto p-6 space-y-6">
            {/* Title */}
            <div>
              {isEditingTitle ? (
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                  autoFocus
                  className="w-full rounded-lg border border-primary bg-background px-3 py-1.5 text-sm font-semibold text-foreground outline-none"
                />
              ) : (
                <h2
                  onClick={() => setIsEditingTitle(true)}
                  className="cursor-pointer text-base font-bold text-foreground hover:text-primary transition-colors py-1.5"
                >
                  {issue.title}
                </h2>
              )}
            </div>

            {/* Git integration */}
            <div className="rounded-lg border border-border/50 bg-background/30 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <GitBranch className="size-4 text-primary" />
                  Git Branch Context
                </div>
                {issue.gitBranch ? (
                  <span className="text-[10px] font-mono font-medium text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Not created</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={issue.gitBranch || suggestedBranchName}
                  className="h-8 flex-1 rounded border border-border/50 bg-background/50 px-2.5 text-[11px] font-mono text-muted-foreground outline-none"
                />
                
                <button
                  type="button"
                  onClick={handleCopyBranch}
                  className="flex size-8 items-center justify-center rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Copy branch name"
                >
                  {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
                </button>

                {!issue.gitBranch && (
                  <button
                    type="button"
                    onClick={handleCreateBranch}
                    className="h-8 rounded bg-primary hover:bg-primary/90 px-3 text-xs font-semibold text-primary-foreground transition-colors shrink-0"
                  >
                    Setup Branch
                  </button>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Description
              </h4>
              {isEditingDesc ? (
                <div className="space-y-2">
                  <textarea
                    rows={6}
                    value={descInput}
                    onChange={(e) => setDescInput(e.target.value)}
                    className="w-full rounded-lg border border-primary bg-background p-3 text-xs text-foreground outline-none resize-y min-h-[100px]"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setDescInput(issue.description || '');
                        setIsEditingDesc(false);
                      }}
                      className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDesc}
                      className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setIsEditingDesc(true)}
                  className="prose prose-invert max-w-none cursor-pointer rounded-lg border border-border/30 bg-surface-1/30 hover:border-border/60 p-3.5 text-xs text-foreground min-h-[80px] transition-colors"
                >
                  {issue.description ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {issue.description}
                    </ReactMarkdown>
                  ) : (
                    <span className="text-muted-foreground/60 italic">No description provided. Click to add one.</span>
                  )}
                </div>
              )}
            </div>

            {/* Tab Selector */}
            <div className="border-b border-border/40 shrink-0">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('comments')}
                  className={`flex items-center gap-1.5 border-b-2 px-1 py-2 text-xs font-semibold transition-all ${
                    activeTab === 'comments'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <MessageSquare className="size-4" />
                  Comments ({comments.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('activity')}
                  className={`flex items-center gap-1.5 border-b-2 px-1 py-2 text-xs font-semibold transition-all ${
                    activeTab === 'activity'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <History className="size-4" />
                  Activity History ({activities.length})
                </button>
              </div>
            </div>

            {/* Comments Tab */}
            {activeTab === 'comments' ? (
              <div className="space-y-4">
                {/* List Comments */}
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-lg border border-border/30 bg-surface-1/20 p-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MemberAvatar user={c.author ?? null} size="sm" />
                          <span className="text-xs font-bold text-foreground">
                            {c.author?.displayName || 'Author'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(c.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {c.authorId === useBoardStore.getState().currentUser?.id ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(c.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </div>

                      <div className="prose prose-invert max-w-none mt-2 text-xs text-foreground/90 pl-7">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {c.body}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}

                  {comments.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground/60 italic">
                      No comments yet. Be the first to comment.
                    </div>
                  ) : null}
                </div>

                {/* Add Comment */}
                <form onSubmit={handleAddComment} className="flex gap-2 items-start pt-2 border-t border-border/30">
                  <textarea
                    rows={2}
                    required
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    className="flex-1 rounded-lg border border-border/60 bg-background/50 p-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-all resize-none"
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !newComment.trim()}
                    className="flex size-9 items-center justify-center rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground disabled:opacity-40 transition-all shadow-md shadow-primary/10 shrink-0"
                  >
                    <Send className="size-4" />
                  </button>
                </form>
              </div>
            ) : (
              /* Activity History Tab */
              <div className="space-y-3 pl-3 border-l-2 border-border/35 ml-2">
                {activities.map((a) => (
                  <div key={a.id} className="relative pb-1">
                    <div className="absolute -left-5.5 mt-1 size-2 rounded-full border border-primary bg-background" />
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="font-bold text-foreground">
                        {a.user?.displayName || 'Someone'}
                      </span>
                      
                      {a.action === 'created' ? (
                        <span className="text-muted-foreground">created the issue</span>
                      ) : (
                        <>
                          <span className="text-muted-foreground">updated the</span>
                          <span className="font-semibold text-primary">{a.field}</span>
                          
                          {a.oldValue ? (
                            <>
                              <span className="text-muted-foreground">from</span>
                              <span className="font-mono text-[10px] opacity-75 bg-muted px-1.5 py-0.2 rounded strike-through border border-border/30 line-through">
                                {a.oldValue}
                              </span>
                            </>
                          ) : null}

                          <span className="text-muted-foreground">to</span>
                          <span className="font-mono text-[10px] opacity-75 bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.2 rounded">
                            {a.newValue || 'empty'}
                          </span>
                        </>
                      )}

                      <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}

                {activities.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground/60 italic">
                    No activity recorded yet.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: status and metadata */}
        <div className="w-80 border-l border-border/40 bg-surface-1/40 p-6 flex flex-col justify-between overflow-y-auto shrink-0 space-y-6">
          <div className="space-y-4">
            {/* Status Column */}
            <div className="space-y-1.5">
              <label htmlFor="detail-column" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Status / Column
              </label>
              <select
                id="detail-column"
                value={issue.columnId}
                onChange={(e) => handleUpdateField({ columnId: e.target.value })}
                className="h-9 w-full rounded-lg border border-border/60 bg-background/50 px-2.5 text-xs text-foreground outline-none focus:border-primary/50 transition-all font-semibold"
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
              <label htmlFor="detail-sprint" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Sprint
              </label>
              <select
                id="detail-sprint"
                value={issue.sprintId || ''}
                onChange={(e) => handleUpdateField({ sprintId: e.target.value || null })}
                className="h-9 w-full rounded-lg border border-border/60 bg-background/50 px-2.5 text-xs text-foreground outline-none focus:border-primary/50 transition-all"
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

            {/* Assignee */}
            <div className="space-y-1.5">
              <label htmlFor="detail-assignee" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Assignee
              </label>
              <div className="flex items-center gap-2">
                <MemberAvatar user={issue.assignee ?? null} size="sm" />
                <select
                  id="detail-assignee"
                  value={issue.assigneeId || ''}
                  onChange={(e) => handleUpdateField({ assigneeId: e.target.value || null })}
                  className="h-9 flex-1 rounded-lg border border-border/60 bg-background/50 px-2.5 text-xs text-foreground outline-none focus:border-primary/50 transition-all"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.userId}>
                      {m.user?.displayName || m.userId}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reporter */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Reporter
              </span>
              <div className="flex items-center gap-2 px-1 py-1">
                <MemberAvatar user={issue.reporter ?? null} size="sm" />
                <span className="text-xs text-foreground font-medium">
                  {issue.reporter?.displayName || 'Reporter'}
                </span>
              </div>
            </div>

            <div className="border-t border-border/40 my-3" />

            {/* Priority */}
            <div className="space-y-1.5">
              <label htmlFor="detail-priority" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Priority
              </label>
              <select
                id="detail-priority"
                value={issue.priority}
                onChange={(e) => handleUpdateField({ priority: e.target.value as Priority })}
                className="h-9 w-full rounded-lg border border-border/60 bg-background/50 px-2.5 text-xs text-foreground outline-none focus:border-primary/50 transition-all"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="trivial">Trivial</option>
              </select>
            </div>

            {/* Story Points */}
            <div className="space-y-1.5">
              <label htmlFor="detail-points" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Story Points
              </label>
              <input
                id="detail-points"
                type="number"
                min="0"
                value={issue.storyPoints || ''}
                onChange={(e) => handleUpdateField({ storyPoints: e.target.value ? parseInt(e.target.value, 10) : null })}
                placeholder="Unestimated"
                className="h-9 w-full rounded-lg border border-border/60 bg-background/50 px-2.5 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <label htmlFor="detail-due" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Due Date
              </label>
              <input
                id="detail-due"
                type="date"
                value={issue.dueDate ? issue.dueDate.split('T')[0] : ''}
                onChange={(e) => handleUpdateField({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className="h-9 w-full rounded-lg border border-border/60 bg-background/50 px-2.5 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {/* Timestamps */}
          <div className="text-[9px] text-muted-foreground/60 space-y-1 pt-4 border-t border-border/40">
            <div>Created: {new Date(issue.createdAt).toLocaleString()}</div>
            <div>Updated: {new Date(issue.updatedAt).toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
