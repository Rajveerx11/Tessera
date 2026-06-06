import { type BoardUser } from '@/stores/board-store';

type Props = {
  user?: BoardUser | null;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
};

const SIZE_MAP = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
  }
  return (name[0] ?? '?').toUpperCase();
}

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 55%, 45%)`;
}

export function MemberAvatar({ user, size = 'sm', showTooltip = true }: Props) {
  const displayName = user?.displayName ?? 'Unassigned';
  const sizeClass = SIZE_MAP[size];

  if (user?.avatarUrl) {
    return (
      <div className="group relative">
        <img
          src={user.avatarUrl}
          alt={displayName}
          className={`${sizeClass} rounded-full object-cover ring-1 ring-border`}
          draggable={false}
        />
        {showTooltip ? <Tooltip label={displayName} /> : null}
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`${sizeClass} flex items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border`}
      >
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M20 21a8 8 0 0 0-16 0" />
        </svg>
      </div>
    );
  }

  const bgColor = hashColor(user.id);
  const initials = getInitials(displayName);

  return (
    <div className="group relative">
      <div
        className={`${sizeClass} flex items-center justify-center rounded-full font-semibold text-white ring-1 ring-white/10`}
        style={{ backgroundColor: bgColor }}
        aria-label={displayName}
      >
        {initials}
      </div>
      {showTooltip ? <Tooltip label={displayName} /> : null}
    </div>
  );
}

function Tooltip({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-[10px] text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
      {label}
    </div>
  );
}

/** Overlapping avatar stack for showing multiple members. */
export function AvatarStack({
  users,
  max = 4,
}: {
  users: BoardUser[];
  max?: number;
}) {
  const visible = users.slice(0, max);
  const overflow = users.length - max;

  return (
    <div className="flex -space-x-2">
      {visible.map((u) => (
        <MemberAvatar key={u.id} user={u} size="sm" />
      ))}
      {overflow > 0 ? (
        <div className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-1 ring-border">
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}
