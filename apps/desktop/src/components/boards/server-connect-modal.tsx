import { useState } from 'react';
import { Lock, Mail, User as UserIcon, Loader2, Server } from 'lucide-react';

import { useAuthStore } from '@/stores/auth-store';
import { useBoardStore } from '@/stores/board-store';
import { 
  serverLogin, 
  serverRegister, 
  serverGetMe, 
  fetchTeams,
  fetchBoards,
  fetchTeamMembers,
  fetchIssues,
  fetchSprints
} from '@/lib/ipc/boards';

export function ServerConnectModal() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let tokens;
      if (isLogin) {
        tokens = await serverLogin(email, password);
      } else {
        tokens = await serverRegister(email, password, name);
      }

      // Save tokens
      useAuthStore.getState().setTokens(tokens.accessToken, tokens.refreshToken);

      // Fetch user profile
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
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border/40 bg-surface-2 p-8 shadow-2xl shadow-black/80 animate-fade-in">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner shadow-primary/20">
            <Server className="size-6 text-primary" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-foreground">Tessera Collaborative Boards</h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Sign in to access your team boards and sprints (directly via Supabase)
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive text-center font-medium">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleAuth} className="mt-6 space-y-4 animate-fade-in">
          {!isLogin ? (
            <div className="space-y-1.5 animate-slide-down">
              <label htmlFor="display-name" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Display Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  <UserIcon className="size-4" />
                </span>
                <input
                  id="display-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="h-10 w-full rounded-lg border border-border/60 bg-background/50 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                <Mail className="size-4" />
              </span>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                <Lock className="size-4" />
              </span>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/95 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isLogin ? (
              'Sign In'
            ) : (
              'Sign Up'
            )}
          </button>

          <div className="flex items-center justify-center text-xs mt-4">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline font-semibold"
            >
              {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
