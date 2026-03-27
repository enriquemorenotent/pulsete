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
  const onlineFriends = sortedFriends.filter((friend) => props.friendPresence[friend.id]);
  const offlineFriends = sortedFriends.filter((friend) => !props.friendPresence[friend.id]);
  const summary = props.friends.length === 0
    ? 'No saved nicks'
    : `${onlineCount} online`;

  return (
    <>
      <section className="shrink-0 border-t border-white/[0.06] pt-3">
        <div className="flex items-center gap-1.5 px-0.5">
          <button
            type="button"
            className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1.5 py-1 text-left transition-colors hover:bg-white/[0.03]"
            aria-label={props.expanded ? 'Collapse friends' : 'Expand friends'}
            aria-expanded={props.expanded}
            onClick={() => props.onExpandedChange(!props.expanded)}
          >
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                !props.expanded && '-rotate-90',
              )}
            />
            <div className="min-w-0 flex items-center gap-1.5">
              <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Friends</h2>
              <span className="font-mono text-[10px] text-muted-foreground">
                {props.friends.length}
              </span>
              <span className="sr-only">{summary}</span>
            </div>
          </button>
          <button
            type="button"
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            aria-label="Add friend"
            onClick={() => props.onOpenChange(true)}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        {props.expanded ? (
          <div className="mt-1 max-h-[min(32dvh,16rem)] overflow-y-auto overscroll-contain pr-0.5">
            {props.friends.length === 0 ? (
              <div className="px-2.5 py-1.5 text-[13px] text-muted-foreground">
                No friends saved yet.
              </div>
            ) : (
              <div className="space-y-px border-l border-white/[0.06] pl-2.5">
                {onlineFriends.map((friend) => (
                  <FriendRow
                    key={friend.id}
                    friend={friend}
                    online
                    onOpen={() => void props.onSelectFriend(friend)}
                    onRemove={() => void props.onRemoveFriend(friend.id)}
                  />
                ))}
                {onlineFriends.length > 0 && offlineFriends.length > 0 ? (
                  <div className="py-1" aria-hidden>
                    <div className="border-t border-white/[0.06]" />
                  </div>
                ) : null}
                {offlineFriends.map((friend) => (
                  <FriendRow
                    key={friend.id}
                    friend={friend}
                    online={false}
                    onOpen={() => void props.onSelectFriend(friend)}
                    onRemove={() => void props.onRemoveFriend(friend.id)}
                  />
                ))}
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

function FriendRow(props: {
  friend: ConnectionSidebarProps['friends'][number];
  online: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-stretch rounded-sm transition-colors hover:bg-white/[0.03]">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
        onClick={props.onOpen}
        aria-label={`Open ${props.friend.nick} (${props.online ? 'online' : 'offline'})`}
      >
        <span
          aria-hidden
          className={cn(
            'size-2 shrink-0 rounded-full',
            props.online ? 'bg-emerald-400' : 'bg-zinc-500/70',
          )}
        />
        <span
          className={cn(
            'truncate text-[13px]',
            props.online ? 'text-foreground' : 'text-muted-foreground/90',
          )}
        >
          {props.friend.nick}
        </span>
      </button>
      <button
        type="button"
        className="px-2 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-foreground"
        aria-label={`Remove ${props.friend.nick}`}
        onClick={props.onRemove}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
