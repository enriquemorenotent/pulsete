import { ChevronDown, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { AddFriendDialog } from './AddFriendDialog.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

type ConnectionSidebarFriendsProps = Pick<
  ConnectionSidebarProps,
  'friends' | 'friendPresence' | 'onAddFriend' | 'onRemoveFriend' | 'onSelectFriend'
> & {
  expanded: boolean;
  draft: string;
  open: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDraftChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
};

export function ConnectionSidebarFriends(props: ConnectionSidebarFriendsProps) {
  const onlineCount = props.friends.filter((friend) => props.friendPresence[friend.id]).length;
  const sortedFriends = [...props.friends].sort((left, right) => (
    Number(Boolean(props.friendPresence[right.id])) - Number(Boolean(props.friendPresence[left.id]))
    || left.nick.localeCompare(right.nick, undefined, { sensitivity: 'accent' })
  ));
  const summary = props.friends.length === 0
    ? 'No saved nicks'
    : `${onlineCount} online`;

  return (
    <>
      <section className="shrink-0">
        <div className="flex items-center gap-2 px-1">
          <button
            type="button"
            className="group flex min-w-0 flex-1 items-center gap-2 rounded-[0.9rem] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
            aria-label={props.expanded ? 'Collapse friends' : 'Expand friends'}
            aria-expanded={props.expanded}
            onClick={() => props.onExpandedChange(!props.expanded)}
          >
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                !props.expanded && '-rotate-90'
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">Friends</h2>
                <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {props.friends.length}
                </span>
              </div>
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {summary}
              </p>
            </div>
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/8 bg-white/[0.03] p-1.5 text-muted-foreground transition-colors hover:border-white/14 hover:bg-white/[0.08] hover:text-foreground"
            aria-label="Add friend"
            onClick={() => props.onOpenChange(true)}
          >
            <Plus className="size-4" />
          </button>
        </div>
        {props.expanded ? (
          <div className="mt-2 max-h-[min(32dvh,16rem)] overflow-hidden rounded-[1rem] bg-black/10 ring-1 ring-white/[0.05]">
            {props.friends.length === 0 ? (
              <div className="px-3 py-2 text-[13px] text-muted-foreground">
                No friends saved yet.
              </div>
            ) : (
              <div className="max-h-[min(32dvh,16rem)] overflow-y-auto overscroll-contain">
                <div className="space-y-1 px-2 pb-2 pt-1">
                  {sortedFriends.map((friend) => (
                    <div key={friend.id} className="group flex items-stretch rounded-lg transition-colors hover:bg-white/[0.03]">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground"
                        onClick={() => void props.onSelectFriend(friend)}
                        aria-label={`Open ${friend.nick} (${props.friendPresence[friend.id] ? 'online' : 'offline'})`}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            props.friendPresence[friend.id] ? 'bg-emerald-400' : 'bg-zinc-500/70'
                          )}
                        />
                        <span className="truncate">{friend.nick}</span>
                      </button>
                      <button
                        type="button"
                        className="px-3 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-foreground"
                        aria-label={`Remove ${friend.nick}`}
                        onClick={() => void props.onRemoveFriend(friend.id)}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>
      <AddFriendDialog
        open={props.open}
        draft={props.draft}
        onDraftChange={props.onDraftChange}
        onOpenChange={(open) => {
          props.onOpenChange(open);
          if (!open) {
            props.onDraftChange('');
          }
        }}
        onSubmit={async () => {
          const saved = await props.onAddFriend(props.draft);
          if (saved) {
            props.onExpandedChange(true);
            props.onDraftChange('');
            props.onOpenChange(false);
          }
        }}
      />
    </>
  );
}
