import type { ChannelState, FriendState, NetworkProfile } from '../../shared/protocol.js';
import { Card } from '@/components/ui/card.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import { findFriendByNick } from './friend-utils.js';
import { FriendToggleButton } from './FriendToggleButton.js';
import { groupChannelUsers } from './channel-user-groups.js';

type NicklistPanelProps = {
  network: NetworkProfile | null;
  channel: ChannelState;
  friends: FriendState[];
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onSelectNick: (network: NetworkProfile, nick: string) => void;
};

export function NicklistPanel(props: NicklistPanelProps) {
  const groups = groupChannelUsers(props.channel.users);

  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold tracking-tight">Users</h2>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-2">
            {props.channel.users.length === 0 ? (
              <div className="border border-border bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
                No users yet.
              </div>
            ) : (
              groups.map((group, groupIndex) => (
                <section
                  key={group.mode}
                  className={cn('border border-border/70 bg-card/50', groupIndex > 0 && 'mt-3')}
                >
                  <div className="border-b border-border/70 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {group.label}
                  </div>
                  {group.users.map((user) => {
                    const friend = findFriendByNick(props.friends, user.nick);
                    return (
                      <div key={user.nick} className="flex items-center border-b border-border/70 last:border-b-0">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                          onClick={() => props.network && props.onSelectNick(props.network, user.nick)}
                        >
                          <span className="truncate">{user.nick}</span>
                        </button>
                        <FriendToggleButton
                          active={Boolean(friend)}
                          onClick={() => void (friend ? props.onRemoveFriend(friend.id) : props.onAddFriend(user.nick))}
                        />
                      </div>
                    );
                  })}
                </section>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>
    </aside>
  );
}
