/* eslint-disable */
import { useState } from 'react';
import { Copy, Check, Shield, User as UserIcon, Trash2, X } from 'lucide-react';

import { useBoardStore } from '@/stores/board-store';
import { removeTeamMember, updateMemberRole, fetchTeamMembers } from '@/lib/ipc/boards';
import type { TeamRole } from '@/stores/board-store';

type Props = {
  onClose: () => void;
};

export function TeamManagement({ onClose }: Props) {
  const activeTeamId = useBoardStore((s) => s.activeTeamId);
  const teams = useBoardStore((s) => s.teams);
  const members = useBoardStore((s) => s.members);
  const setMembers = useBoardStore((s) => s.setMembers);
  const currentUser = useBoardStore((s) => s.currentUser);

  const activeTeam = teams.find((t) => t.id === activeTeamId);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if current user is admin of activeTeam
  const currentMember = members.find((m) => m.userId === currentUser?.id);
  const isAdmin = currentMember?.role === 'admin';

  const handleCopyInvite = () => {
    if (!activeTeam) return;
    navigator.clipboard.writeText(activeTeam.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdateRole = async (userId: string, role: TeamRole) => {
    if (!activeTeamId) return;
    setLoading(true);
    try {
      await updateMemberRole(activeTeamId, userId, role);
      // Refresh members list
      const freshMembers = await fetchTeamMembers(activeTeamId);
      setMembers(freshMembers);
    } catch (err) {
      console.error('Failed to update member role:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeTeamId) return;
    if (!confirm('Are you sure you want to remove this member from the team?')) return;
    
    setLoading(true);
    try {
      await removeTeamMember(activeTeamId, userId);
      // Refresh members list
      const freshMembers = await fetchTeamMembers(activeTeamId);
      setMembers(freshMembers);
      
      // If user removed themselves, clear active team and reload
      if (userId === currentUser?.id) {
        useBoardStore.setState({ activeTeamId: null, activeBoardId: null, boards: [], issues: [], sprints: [], members: [] });
        onClose();
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!activeTeam) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-xl border border-border bg-surface-2 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
          <h3 className="text-base font-bold text-foreground">Manage Team</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Team Details & Invite */}
          <div className="rounded-lg border border-border/50 bg-background/30 p-4 space-y-3">
            <div>
              <h4 className="text-sm font-bold text-foreground">{activeTeam.name}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeTeam.description || 'Collaborative workspace space.'}
              </p>
            </div>

            <div className="space-y-1.5 pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Invite Code
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={activeTeam.inviteCode}
                  className="h-9 flex-1 rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-foreground font-mono outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 px-4 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/10 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      Copy Code
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Team Members ({members.length})
            </h4>

            <div className="custom-scrollbar max-h-60 overflow-y-auto border border-border/40 bg-surface-1/20 rounded-lg p-2 space-y-1">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg p-2 hover:bg-background/30 transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <UserIcon className="size-4.5 text-muted-foreground shrink-0" />
                    <div className="overflow-hidden">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {m.user?.displayName || m.userId}
                        {m.userId === currentUser?.id ? (
                          <span className="text-[9px] ml-1.5 px-1 bg-primary/15 text-primary rounded font-mono">
                            You
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[9px] text-muted-foreground truncate">{m.user?.email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Role Dropdown */}
                    {isAdmin && m.userId !== currentUser?.id ? (
                      <select
                        disabled={loading}
                        value={m.role}
                        onChange={(e) => handleUpdateRole(m.userId, e.target.value as TeamRole)}
                        className="h-8 rounded border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Developer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <div className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground capitalize border border-border/30">
                        <Shield className="size-3" />
                        {m.role === 'member' ? 'Developer' : m.role}
                      </div>
                    )}

                    {/* Remove Member */}
                    {(isAdmin || m.userId === currentUser?.id) && m.userId !== activeTeam.createdBy ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleRemoveMember(m.userId)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                        title={m.userId === currentUser?.id ? 'Leave Team' : 'Remove Member'}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border/40 px-6 py-4 bg-background/25">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg bg-primary hover:bg-primary/90 px-4 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/10 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
