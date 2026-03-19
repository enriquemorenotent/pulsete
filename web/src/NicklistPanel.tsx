import type { ChannelState, FriendState, NetworkProfile } from '../../shared/protocol.js';
import { Card } from '@/components/ui/card.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { findFriendByNick } from './friend-utils.js';
import { FriendToggleButton } from './FriendToggleButton.js';

type NicklistPanelProps = {
  network: NetworkProfile | null;
  channel: ChannelState;
  friends: FriendState[];
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onSelectNick: (network: NetworkProfile, nick: string) => void;
};

export function NicklistPanel(props: NicklistPanelProps) {
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
              props.channel.users.map((nick) => {
                const friend = findFriendByNick(props.friends, nick);
                return (
                  <div key={nick} className="flex items-center border-b border-border/70 last:border-b-0">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                      onClick={() => props.network && props.onSelectNick(props.network, nick)}
                    >
                      <span className="truncate">{nick}</span>
                    </button>
                    <FriendToggleButton
                      active={Boolean(friend)}
                      onClick={() => void (friend ? props.onRemoveFriend(friend.id) : props.onAddFriend(nick))}
                    />
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </Card>
    </aside>
  );
}
