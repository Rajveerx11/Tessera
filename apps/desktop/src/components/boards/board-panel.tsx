/* eslint-disable */
import { useEffect, useState } from 'react';
import { Loader2, FolderKanban, Users2, X } from 'lucide-react';

import { useAuthStore } from '@/stores/auth-store';
import { useBoardStore } from '@/stores/board-store';
import type { Comment } from '@/stores/board-store';
import { BoardSidebar } from '@/components/boards/board-sidebar';
import { SprintBar } from '@/components/boards/sprint-bar';
import { FiltersBar } from '@/components/boards/filters-bar';
import { KanbanBoard } from '@/components/boards/kanban-board';
import { ServerConnectModal } from '@/components/boards/server-connect-modal';
import { IssueDetailModal } from '@/components/boards/issue-detail-modal';
import { IssueCreateModal } from '@/components/boards/issue-create-modal';
import { TeamManagement } from '@/components/boards/team-management';
import { BoardSettings } from '@/components/boards/board-settings';
import { getSupabase } from '@/lib/supabase';
import { 
  createTeam, 
  joinTeam, 
  createBoard, 
  createSprint, 
  fetchTeams,
  fetchBoards,
  fetchTeamMembers,
  fetchIssues,
  fetchSprints,
  fetchColumns,
  fetchIssue,
  serverGetMe,
} from '@/lib/ipc/boards';
import type { TeamRole } from '@testing-ide/shared';

export function BoardPanel() {
  const serverUrl = useBoardStore((s) => s.serverUrl);
  const connected = useBoardStore((s) => s.connected);
  const activeTeamId = useBoardStore((s) => s.activeTeamId);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const activeIssueId = useBoardStore((s) => s.activeIssueId);

  // Modal open states
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [showManageTeam, setShowManageTeam] = useState(false);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [createIssueColId, setCreateIssueColId] = useState<string | null>(null);

  // Form states
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [boardName, setBoardName] = useState('');
  const [boardKey, setBoardKey] = useState('');
  const [boardDesc, setBoardDesc] = useState('');
  const [sprintName, setSprintName] = useState('');
  const [sprintGoal, setSprintGoal] = useState('');
  const [sprintStart, setSprintStart] = useState('');
  const [sprintEnd, setSprintEnd] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);

  // 0. Auto-restore session on mount if token exists
  useEffect(() => {
    async function restoreSession() {
      const token = useAuthStore.getState().accessToken;
      const refreshToken = useAuthStore.getState().refreshToken;
      if (token && refreshToken) {
        try {
          useBoardStore.setState({ connecting: true });
          await getSupabase().auth.setSession({
            access_token: token,
            refresh_token: refreshToken,
          });
          const userProfile = await serverGetMe();
          useBoardStore.setState({ currentUser: userProfile, connected: true, serverUrl: 'supabase' });

          // Pre-load data
          const fetchedTeams = await fetchTeams();
          useBoardStore.setState({ teams: fetchedTeams });

          if (fetchedTeams.length > 0 && fetchedTeams[0]) {
            const firstTeam = fetchedTeams[0];
            useBoardStore.setState({ activeTeamId: firstTeam.id });

            const fetchedBoards = await fetchBoards(firstTeam.id);
            useBoardStore.setState({ boards: fetchedBoards });

            const fetchedMembers = await fetchTeamMembers(firstTeam.id);
            useBoardStore.setState({ members: fetchedMembers });

            if (fetchedBoards.length > 0 && fetchedBoards[0]) {
              const firstBoard = fetchedBoards[0];
              useBoardStore.setState({ activeBoardId: firstBoard.id });

              const fetchedIssues = await fetchIssues(firstBoard.id);
              const fetchedSprints = await fetchSprints(firstBoard.id);
              useBoardStore.setState({ issues: fetchedIssues, sprints: fetchedSprints });
            }
          }
        } catch (err) {
          console.error('Failed to restore session:', err);
          useAuthStore.getState().clear();
          useBoardStore.setState({ connected: false, currentUser: null });
        } finally {
          useBoardStore.setState({ connecting: false });
        }
      }
      setRestoringSession(false);
    }
    restoreSession();
  }, []);

  // 1. Establish Supabase Realtime subscription when board ID or team ID changes
  useEffect(() => {
    if (activeBoardId) {
      const channel = getSupabase()
        .channel(`board-changes:${activeBoardId}`)
        .on(
          'postgres_changes' as any,
          {
            event: '*',
            schema: 'public',
            table: 'issues',
            filter: `board_id=eq.${activeBoardId}`,
          } as any,
          async (payload: any) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            const { addIssue, updateIssue, removeIssue } = useBoardStore.getState();

            switch (eventType) {
              case 'INSERT':
                try {
                  const freshIssue = await fetchIssue(newRecord.id);
                  addIssue(freshIssue);
                } catch (e) {
                  console.error('Realtime insert error:', e);
                }
                break;
              case 'UPDATE':
                try {
                  const existingIssues = useBoardStore.getState().issues;
                  const existing = existingIssues.find((i) => i.id === newRecord.id);
                  if (existing) {
                    // Check if anything other than position, column_id, or updated_at changed
                    const hasOtherChanges =
                      existing.title !== newRecord.title ||
                      existing.description !== newRecord.description ||
                      existing.priority !== newRecord.priority ||
                      existing.issueType !== newRecord.issue_type ||
                      existing.assigneeId !== (newRecord.assignee_id || undefined) ||
                      existing.sprintId !== (newRecord.sprint_id || undefined) ||
                      existing.parentId !== (newRecord.parent_id || undefined) ||
                      existing.storyPoints !== (newRecord.story_points !== null && newRecord.story_points !== undefined ? newRecord.story_points : undefined) ||
                      existing.dueDate !== (newRecord.due_date || undefined) ||
                      existing.gitBranch !== (newRecord.git_branch || undefined);

                    if (hasOtherChanges) {
                      const freshIssue = await fetchIssue(newRecord.id);
                      updateIssue(newRecord.id, freshIssue);
                    } else {
                      // Only position or column changed (common drag-and-drop case)
                      if (existing.position !== newRecord.position || existing.columnId !== newRecord.column_id) {
                        updateIssue(newRecord.id, {
                          position: newRecord.position,
                          columnId: newRecord.column_id,
                          updatedAt: newRecord.updated_at,
                        });
                      }
                    }
                  } else {
                    const freshIssue = await fetchIssue(newRecord.id);
                    addIssue(freshIssue);
                  }
                } catch (e) {
                  console.error('Realtime update error:', e);
                }
                break;
              case 'DELETE':
                if (oldRecord && oldRecord.id) {
                  removeIssue(oldRecord.id);
                }
                break;
            }
          }
        )
        .on(
          'postgres_changes' as any,
          {
            event: '*',
            schema: 'public',
            table: 'comments',
          } as any,
          async (payload: any) => {
            const { eventType, new: newRecord } = payload;
            const { addComment } = useBoardStore.getState();
            if (eventType === 'INSERT') {
              try {
                const { data: dbComment } = await getSupabase()
                  .from('comments')
                  .select('*, author:author_id(*)')
                  .eq('id', newRecord.id)
                  .single();

                if (dbComment) {
                  const comment: Comment = {
                    id: dbComment.id,
                    issueId: dbComment.issue_id,
                    authorId: dbComment.author_id,
                    body: dbComment.body,
                    createdAt: dbComment.created_at,
                    updatedAt: dbComment.updated_at,
                  };
                  if (dbComment.author) {
                    comment.author = {
                      id: dbComment.author.id,
                      email: dbComment.author.email,
                      displayName: dbComment.author.display_name,
                    };
                    if (dbComment.author.avatar_url) {
                      comment.author.avatarUrl = dbComment.author.avatar_url;
                    }
                  }
                  addComment(comment);
                }
              } catch (e) {
                console.error('Realtime comment error:', e);
              }
            }
          }
        )
        .on(
          'postgres_changes' as any,
          {
            event: '*',
            schema: 'public',
            table: 'team_members',
            filter: activeTeamId ? `team_id=eq.${activeTeamId}` : undefined,
          } as any,
          async (payload: any) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            const { addMember, removeMember } = useBoardStore.getState();

            if (eventType === 'INSERT') {
              try {
                const { data: dbMember } = await getSupabase()
                  .from('team_members')
                  .select('*, users:user_id(*)')
                  .eq('id', newRecord.id)
                  .single();

                if (dbMember) {
                  const member: any = {
                    id: dbMember.id,
                    teamId: dbMember.team_id,
                    userId: dbMember.user_id,
                    role: dbMember.role as TeamRole,
                    joinedAt: dbMember.joined_at,
                  };
                  if (dbMember.users) {
                    member.user = {
                      id: dbMember.users.id,
                      email: dbMember.users.email,
                      displayName: dbMember.users.display_name,
                    };
                    if (dbMember.users.avatar_url) {
                      member.user.avatarUrl = dbMember.users.avatar_url;
                    }
                  }
                  addMember(member);
                }
              } catch (e) {
                console.error('Realtime member error:', e);
              }
            } else if (eventType === 'DELETE' && oldRecord && oldRecord.id) {
              removeMember(oldRecord.id);
            }
          }
        )
        .subscribe();

      useBoardStore.setState({ connected: true });

      return () => {
        getSupabase().removeChannel(channel);
        useBoardStore.setState({ connected: false });
      };
    }
  }, [activeBoardId, activeTeamId]);

  // Form submission handlers
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const payload: any = { name: teamName.trim() };
      if (teamDesc.trim()) {
        payload.description = teamDesc.trim();
      }
      const created = await createTeam(payload);

      const { teams } = useBoardStore.getState();
      useBoardStore.setState({ 
        teams: [...teams, created],
        activeTeamId: created.id,
        boards: [],
        issues: [],
        sprints: [],
        members: []
      });

      // Fetch member profile list for new team
      const members = await fetchTeamMembers(created.id);
      useBoardStore.setState({ members });

      setTeamName('');
      setTeamDesc('');
      setShowCreateTeam(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create team.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setError(null);
    setLoading(true);

    try {
      await joinTeam(inviteCode.trim());
      
      // Reload all teams
      const freshTeams = await fetchTeams();
      useBoardStore.setState({ teams: freshTeams });
      
      if (freshTeams.length > 0) {
        const targetTeam = freshTeams.find((t) => t.inviteCode === inviteCode.trim()) || freshTeams[0];
        if (targetTeam) {
          useBoardStore.setState({ activeTeamId: targetTeam.id });
          
          const boards = await fetchBoards(targetTeam.id);
          useBoardStore.setState({ boards });
          
          const members = await fetchTeamMembers(targetTeam.id);
          useBoardStore.setState({ members });
        }
      }

      setInviteCode('');
      setShowCreateTeam(false);
    } catch (err: any) {
      setError(err.message || 'Failed to join team.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !boardName.trim() || !boardKey.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const payload: any = {
        name: boardName.trim(),
        key: boardKey.trim().toUpperCase(),
        boardType: 'kanban'
      };
      if (boardDesc.trim()) {
        payload.description = boardDesc.trim();
      }
      const created = await createBoard(activeTeamId, payload);

      const { boards } = useBoardStore.getState();
      useBoardStore.setState({ 
        boards: [...boards, created],
        activeBoardId: created.id
      });

      // Load new board columns, sprints and issues
      const cols = await fetchColumns(created.id);
      const sprintList = await fetchSprints(created.id);
      const issueList = await fetchIssues(created.id);
      
      useBoardStore.setState({ columns: cols, sprints: sprintList, issues: issueList });

      setBoardName('');
      setBoardKey('');
      setBoardDesc('');
      setShowCreateBoard(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create board.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBoardId || !sprintName.trim() || !sprintStart || !sprintEnd) return;
    setError(null);
    setLoading(true);

    try {
      const payload: any = {
        name: sprintName.trim(),
        startDate: new Date(sprintStart).toISOString(),
        endDate: new Date(sprintEnd).toISOString()
      };
      if (sprintGoal.trim()) {
        payload.goal = sprintGoal.trim();
      }
      await createSprint(activeBoardId, payload);

      // Refresh sprints
      const sprintList = await fetchSprints(activeBoardId);
      useBoardStore.setState({ sprints: sprintList });

      setSprintName('');
      setSprintGoal('');
      setSprintStart('');
      setSprintEnd('');
      setShowCreateSprint(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create sprint.');
    } finally {
      setLoading(false);
    }
  };

  if (restoringSession) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not connected to a server, show connection modal
  if (!serverUrl || !connected) {
    return <ServerConnectModal />;
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Sidebar navigation */}
      <BoardSidebar
        onCreateTeam={() => { setError(null); setShowCreateTeam(true); }}
        onCreateBoard={() => { setError(null); setShowCreateBoard(true); }}
        onCreateSprint={() => { setError(null); setShowCreateSprint(true); }}
        onManageTeam={() => setShowManageTeam(true)}
        onBoardSettings={() => setShowBoardSettings(true)}
      />

      {/* Main workspace */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Active Sprint Bar */}
        {activeBoardId ? (
          <SprintBar />
        ) : (
          <div className="flex items-center justify-between border-b border-border/40 bg-surface-1/25 px-6 py-2">
            <span className="text-xs text-muted-foreground">Select or create a board to get started</span>
          </div>
        )}

        {/* Filters control bar */}
        {activeBoardId && <FiltersBar />}

        {/* Kanban Board columns scrollable container */}
        <div className="custom-scrollbar flex-1 overflow-x-auto overflow-y-hidden p-6">
          {activeBoardId ? (
            <KanbanBoard
              onIssueClick={(issueId) => useBoardStore.setState({ activeIssueId: issueId })}
              onCreateIssue={(colId) => setCreateIssueColId(colId)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-surface-1/10">
              <FolderKanban className="size-10 text-muted-foreground opacity-45" />
              <h3 className="mt-3 text-sm font-bold text-foreground">No Board Selected</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Select an existing board from the sidebar dropdown or create a new board to start managing tasks.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── MODALS & DIALOGS ────────────────────────────────────────────────── */}

      {/* Issue details modal */}
      {activeIssueId && (
        <IssueDetailModal
          issueId={activeIssueId}
          onClose={() => useBoardStore.setState({ activeIssueId: null })}
        />
      )}

      {/* Issue creation modal */}
      {createIssueColId && (
        <IssueCreateModal
          columnId={createIssueColId.includes('-') ? createIssueColId : null} // UUID vs Parent ID check
          parentId={!createIssueColId.includes('-') ? createIssueColId : null}
          onClose={() => setCreateIssueColId(null)}
        />
      )}

      {/* Team management modal */}
      {showManageTeam && (
        <TeamManagement onClose={() => setShowManageTeam(false)} />
      )}

      {/* Board settings modal */}
      {showBoardSettings && (
        <BoardSettings onClose={() => setShowBoardSettings(false)} />
      )}

      {/* Create or Join Team Modal */}
      {showCreateTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-2 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-sm font-bold text-foreground">Create or Join a Team</h3>
              <button
                type="button"
                onClick={() => setShowCreateTeam(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            {error ? (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive text-center">
                {error}
              </div>
            ) : null}

            {/* Create Team Form */}
            <form onSubmit={handleCreateTeam} className="space-y-3 pb-3 border-b border-border/40">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <Users2 className="size-4" />
                CREATE TEAM
              </div>
              <input
                type="text"
                required
                placeholder="Team Name (e.g. Acme Dev Team)"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-xs outline-none focus:border-primary"
              />
              <input
                type="text"
                placeholder="Description (Optional)"
                value={teamDesc}
                onChange={(e) => setTeamDesc(e.target.value)}
                className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-xs outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full h-9 rounded-lg bg-primary hover:bg-primary/95 text-xs font-semibold text-primary-foreground transition-all shadow-md shadow-primary/10"
              >
                {loading ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Create Team'}
              </button>
            </form>

            {/* Join Team Form */}
            <form onSubmit={handleJoinTeam} className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <Users2 className="size-4" />
                JOIN TEAM WITH CODE
              </div>
              <input
                type="text"
                required
                placeholder="Enter 8-digit Invite Code (e.g. AB12CD34)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-xs font-mono outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full h-9 rounded-lg border border-border hover:bg-muted text-xs font-semibold text-foreground transition-all"
              >
                {loading ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Join Team'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create Board Modal */}
      {showCreateBoard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateBoard} className="w-full max-w-md rounded-xl border border-border bg-surface-2 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-sm font-bold text-foreground">Create Board</h3>
              <button
                type="button"
                onClick={() => setShowCreateBoard(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            {error ? (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive text-center">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Board Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Core Service API"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-xs outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Key (2-4 chars)</label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  placeholder="e.g. API"
                  value={boardKey}
                  onChange={(e) => setBoardKey(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-xs font-mono outline-none focus:border-primary uppercase"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
              <textarea
                rows={2}
                placeholder="Optional board details"
                value={boardDesc}
                onChange={(e) => setBoardDesc(e.target.value)}
                className="w-full rounded-lg border border-border/60 bg-background p-2 text-xs outline-none focus:border-primary resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => setShowCreateBoard(false)}
                className="h-9 rounded-lg border border-border px-4 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary hover:bg-primary/95 px-4 text-xs font-semibold text-primary-foreground transition-all shadow-md shadow-primary/10"
              >
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                Create Board
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Sprint Modal */}
      {showCreateSprint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateSprint} className="w-full max-w-md rounded-xl border border-border bg-surface-2 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-sm font-bold text-foreground">Create planned Sprint</h3>
              <button
                type="button"
                onClick={() => setShowCreateSprint(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            {error ? (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive text-center">
                {error}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sprint Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Sprint 1 - Core Auth"
                value={sprintName}
                onChange={(e) => setSprintName(e.target.value)}
                className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-xs outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sprint Goal</label>
              <input
                type="text"
                placeholder="e.g. Complete registration, login, and JWT validation flow"
                value={sprintGoal}
                onChange={(e) => setSprintGoal(e.target.value)}
                className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-xs outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Start Date</label>
                <input
                  type="date"
                  required
                  value={sprintStart}
                  onChange={(e) => setSprintStart(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border/60 bg-background px-2.5 text-xs outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">End Date</label>
                <input
                  type="date"
                  required
                  value={sprintEnd}
                  onChange={(e) => setSprintEnd(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border/60 bg-background px-2.5 text-xs outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => setShowCreateSprint(false)}
                className="h-9 rounded-lg border border-border px-4 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary hover:bg-primary/95 px-4 text-xs font-semibold text-primary-foreground transition-all shadow-md shadow-primary/10"
              >
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                Create Sprint
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
