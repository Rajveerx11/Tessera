import { 
  Building2, 
  ChevronDown, 
  FolderKanban, 
  Plus, 
  Settings, 
  Users2, 
  CalendarRange 
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { useBoardStore } from '@/stores/board-store';

type Props = {
  onCreateTeam: () => void;
  onCreateBoard: () => void;
  onCreateSprint: () => void;
  onManageTeam: () => void;
  onBoardSettings: () => void;
};

export function BoardSidebar({
  onCreateTeam,
  onCreateBoard,
  onCreateSprint,
  onManageTeam,
  onBoardSettings,
}: Props) {
  const teams = useBoardStore((s) => s.teams);
  const activeTeamId = useBoardStore((s) => s.activeTeamId);
  const boards = useBoardStore((s) => s.boards);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const sprints = useBoardStore((s) => s.sprints);
  
  const setActiveTeam = useBoardStore((s) => s.setActiveTeam);
  const setActiveBoard = useBoardStore((s) => s.setActiveBoard);

  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  const handleSelectTeam = useCallback(
    (teamId: string) => {
      setActiveTeam(teamId);
      setTeamDropdownOpen(false);

      // Trigger auto-fetching of the new team's boards in parent/store
      const api = import('@/lib/ipc/boards');
      
      api.then(async (m) => {
        try {
          const fetchedBoards = await m.fetchBoards(teamId);
          useBoardStore.setState({ boards: fetchedBoards });
          
          const fetchedMembers = await m.fetchTeamMembers(teamId);
          useBoardStore.setState({ members: fetchedMembers });
          
          if (fetchedBoards.length > 0 && fetchedBoards[0]) {
            setActiveBoard(fetchedBoards[0].id);
            // Fetch issues for first board
            const fetchedIssues = await m.fetchIssues(fetchedBoards[0].id);
            useBoardStore.setState({ issues: fetchedIssues });
            
            const fetchedSprints = await m.fetchSprints(fetchedBoards[0].id);
            useBoardStore.setState({ sprints: fetchedSprints });
          } else {
            useBoardStore.setState({ issues: [], sprints: [] });
          }
        } catch (err) {
          console.error('Failed to load team data:', err);
        }
      });
    },
    [setActiveTeam, setActiveBoard],
  );

  const handleSelectBoard = useCallback(
    async (boardId: string) => {
      setActiveBoard(boardId);
      
      // Load board context
      const { fetchIssues, fetchSprints, fetchColumns } = await import('@/lib/ipc/boards');
      try {
        const issues = await fetchIssues(boardId);
        const sprints = await fetchSprints(boardId);
        const columns = await fetchColumns(boardId);
        
        useBoardStore.setState({ issues, sprints, columns });
      } catch (err) {
        console.error('Failed to load board details:', err);
      }
    },
    [setActiveBoard],
  );

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-border/40 bg-surface-1/40 backdrop-blur-md">
      {/* Team Selector Header */}
      <div className="relative border-b border-border/40 p-4">
        <button
          type="button"
          onClick={() => setTeamDropdownOpen(!teamDropdownOpen)}
          className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-background/30 px-3 py-2 text-left hover:bg-background/60 transition-colors"
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <Building2 className="size-4.5 text-primary shrink-0" />
            <div className="overflow-hidden">
              <div className="truncate text-xs font-semibold text-foreground">
                {activeTeam ? activeTeam.name : 'Select Team'}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {activeTeam ? activeTeam.description || 'Collaborative Space' : 'No team active'}
              </div>
            </div>
          </div>
          <ChevronDown className="size-4 text-muted-foreground shrink-0 ml-1" />
        </button>

        {teamDropdownOpen ? (
          <div className="absolute left-4 right-4 top-16 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-2 p-1 shadow-lg shadow-black/50">
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTeam(t.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
                  t.id === activeTeamId ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
                }`}
              >
                <Building2 className="size-3.5 shrink-0" />
                <span className="truncate">{t.name}</span>
              </button>
            ))}
            
            <div className="my-1 border-t border-border/40" />
            
            <button
              type="button"
              onClick={() => {
                setTeamDropdownOpen(false);
                onCreateTeam();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-primary hover:bg-muted transition-colors"
            >
              <Plus className="size-3.5" />
              Create/Join Team
            </button>
          </div>
        ) : null}
      </div>

      {/* Sidebar sections */}
      <div className="custom-scrollbar flex-1 overflow-y-auto p-3 space-y-6">
        {/* Boards List */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/85">
              Boards
            </span>
            {activeTeamId ? (
              <button
                type="button"
                onClick={onCreateBoard}
                className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Create new board"
              >
                <Plus className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="space-y-0.5">
            {boards.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => handleSelectBoard(b.id)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-all ${
                  b.id === activeBoardId
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <FolderKanban className="size-3.5 shrink-0" />
                  <span className="truncate">{b.name}</span>
                </div>
                <span className="text-[9px] font-mono opacity-60 bg-muted px-1.5 py-0.2 rounded border border-border/30">
                  {b.key}
                </span>
              </button>
            ))}
            {boards.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-muted-foreground/60 italic">
                No boards in team.
              </div>
            ) : null}
          </div>
        </div>

        {/* Sprints / Backlog Section */}
        {activeBoardId ? (
          <div>
            <div className="flex items-center justify-between px-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/85">
                Sprints
              </span>
              <button
                type="button"
                onClick={onCreateSprint}
                className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Create new sprint"
              >
                <Plus className="size-3.5" />
              </button>
            </div>

            <div className="space-y-0.5">
              {sprints.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg px-2.5 py-1 text-xs text-muted-foreground"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <CalendarRange className="size-3.5 shrink-0 text-muted-foreground/75" />
                    <span className="truncate text-foreground/90">{s.name}</span>
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-semibold border ${
                      s.status === 'active'
                        ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                        : s.status === 'completed'
                        ? 'bg-muted border-border/40 text-muted-foreground'
                        : 'bg-primary/5 border-primary/20 text-primary/80'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
              ))}
              {sprints.length === 0 ? (
                <div className="px-2.5 py-2 text-[11px] text-muted-foreground/60 italic">
                  No sprints planned.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer Settings & Management links */}
      {activeTeamId ? (
        <div className="border-t border-border/40 p-3 space-y-0.5 bg-background/20">
          <button
            type="button"
            onClick={onManageTeam}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Users2 className="size-4" />
            <span>Manage Team</span>
          </button>
          
          {activeBoardId ? (
            <button
              type="button"
              onClick={onBoardSettings}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Settings className="size-4" />
              <span>Board Settings</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
