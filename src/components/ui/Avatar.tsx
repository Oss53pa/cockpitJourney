import type { User } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  user: User;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  ring?: boolean;
}

const sizes = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-10 h-10 text-sm',
};

export function Avatar({ user, size = 'sm', ring }: Props) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium tracking-tight text-white shrink-0',
        sizes[size],
        ring && 'ring-2 ring-atlas-panel'
      )}
      style={{
        background: `linear-gradient(135deg, ${user.color}, ${user.color}88)`,
      }}
      title={user.name}
    >
      {user.initials}
    </div>
  );
}

interface GroupProps {
  users: User[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
}

export function AvatarGroup({ users, max = 3, size = 'sm' }: GroupProps) {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;
  return (
    <div className="flex -space-x-1.5">
      {visible.map((u) => (
        <Avatar key={u.id} user={u} size={size} ring />
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-black/[0.08] text-atlas-fg-2 font-medium ring-2 ring-atlas-panel',
            sizes[size]
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
