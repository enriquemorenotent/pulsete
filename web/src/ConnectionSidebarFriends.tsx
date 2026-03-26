import { Plus, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import { AddFriendDialog } from './AddFriendDialog.js';
import { SidebarWidget } from './SidebarWidget.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

type ConnectionSidebarFriendsProps = Pick<
  ConnectionSidebarProps,
  'friends' | 'friendPresence' | 'onAddFriend' | 'onRemoveFriend' | 'onSelectFriend'
> & {
  draft: string;
  open: boolean;
  onDraftChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
};

export function ConnectionSidebarFriends(props: ConnectionSidebarFriendsProps) {
  return (
    <>
      <SidebarWidget
        title={`Friends (${props.friends.length})`}
        className="min-h-0 flex-[2_1_0%]"
        bodyClassName="flex min-h-0 flex-1 flex-col"
        actions={
          <button
            type="button"
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Add friend"
            onClick={() => props.onOpenChange(true)}
          >
            <Plus className="size-4" />
          </button>
        }
      >
        {props.friends.length === 0 ? (
          <div className="px-3 py-2 text-[13px] text-muted-foreground">
            No friends saved yet.
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-0.5 px-2 pb-2">
              {props.friends.map((friend) => (
                <div key={friend.id} className="flex items-stretch rounded-sm">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
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
                    className="px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    aria-label={`Remove ${friend.nick}`}
                    onClick={() => void props.onRemoveFriend(friend.id)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </SidebarWidget>
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
            props.onDraftChange('');
            props.onOpenChange(false);
          }
        }}
      />
    </>
  );
}
