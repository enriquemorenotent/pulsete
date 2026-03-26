import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ChannelState, FriendState, NetworkProfile } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { channelUserModeTone } from './channel-user-tone.js';
import { findFriendByNick } from './friend-utils.js';
import { FriendToggleButton } from './FriendToggleButton.js';
import { buildNicklistGroups } from './nicklist-groups.js';
import { SidebarWidget } from './SidebarWidget.js';

type NicklistPanelProps = {
  network: NetworkProfile | null;
  channel: ChannelState;
  friends: FriendState[];
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onSelectNick: (network: NetworkProfile, nick: string) => void;
};

export function NicklistPanel(props: NicklistPanelProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const groups = useMemo(
    () => buildNicklistGroups(props.channel.users, props.friends, deferredQuery),
    [deferredQuery, props.channel.users, props.friends],
  );

  useEffect(() => {
    setQuery('');
  }, [props.channel.id]);

  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <SidebarWidget title="Users" className="h-full" bodyClassName="flex min-h-0 flex-1 flex-col">
        {props.channel.users.length === 0 ? (
          <div className="px-4 py-3 text-[13px] text-muted-foreground">
            No users yet.
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-white/6 px-2 py-2">
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter users"
                aria-label="Filter users"
                autoComplete="off"
                spellCheck={false}
                className="h-8 border-white/8 bg-black/10 font-mono text-[12px]"
              />
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-2">
                {groups.length === 0 ? (
                  <div className="px-2 py-2 text-[13px] text-muted-foreground">
                    No matching users.
                  </div>
                ) : (
                  groups.map((group, groupIndex) => (
                    <section key={group.mode} className={groupIndex > 0 ? 'mt-3 border-t border-border/70 pt-3' : ''}>
                      <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {group.label}
                      </div>
                      {group.users.map((user) => {
                        const friend = findFriendByNick(props.friends, user.nick);
                        return (
                          <div key={user.nick} className="flex items-center rounded-sm">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                              onClick={() => props.network && props.onSelectNick(props.network, user.nick)}
                            >
                              <span className={cn('truncate', channelUserModeTone(user.mode))}>{user.nick}</span>
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
          </>
        )}
      </SidebarWidget>
    </aside>
  );
}
