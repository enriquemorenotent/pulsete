import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Moon } from 'lucide-react';
import type { ChannelState, FriendState, MutedNickState, NetworkProfile, NickEmojiState } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { channelUserModeTone } from './channel-user-tone.js';
import { ContactRuleIconButton } from './ContactRuleButtons.js';
import {
  enableContactNotificationsAndUnmute,
  muteContactAndDisableNotifications,
} from './contact-rule-actions.js';
import { resolveContactRuleState } from './contact-rules.js';
import type {
  BackgroundDmAudioContact,
  BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { buildNicklistGroups } from './nicklist-groups.js';
import { findNickEmoji } from './nick-emoji-utils.js';
import { NickEmojiEditorControl } from './NickEmojiEditorControl.js';
import { SidebarWidget } from './SidebarWidget.js';

type NicklistPanelProps = {
  network: NetworkProfile | null;
  channel: ChannelState;
  friends: FriendState[];
  mutedNicks: MutedNickState[];
  nickEmojis: NickEmojiState[];
  backgroundDmAudio: Pick<BackgroundDmAudioSettings, 'contacts'>;
  onAddFriend: (nick: string) => Promise<boolean>;
  onAddNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onAddMutedNick: (networkId: string, nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onRemoveNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
  onSaveNickEmoji: (networkId: string, nick: string, emoji: string | null) => Promise<boolean>;
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
                        const userContactState = props.network
                          ? resolveContactRuleState({
                              networkId: props.network.id,
                              nick: user.nick,
                              friends: props.friends,
                              mutedNicks: props.mutedNicks,
                              backgroundDmAudio: props.backgroundDmAudio,
                            })
                          : null;
                        const userNickEmoji = props.network
                          ? findNickEmoji(props.nickEmojis, props.network.id, user.nick)
                          : null;
                        return (
                          <div key={user.nick} className="flex items-center rounded-sm">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                              onClick={() => props.network && props.onSelectNick(props.network, user.nick)}
                            >
                              <span className={cn('truncate', channelUserModeTone(user.mode))}>{user.nick}</span>
                              {userNickEmoji?.emoji ? (
                                <span aria-hidden className="shrink-0 leading-none">
                                  {userNickEmoji.emoji}
                                </span>
                              ) : null}
                            </button>
                            {user.away ? (
                              <span
                                role="img"
                                aria-label="Away"
                                title="Away"
                                className="inline-flex size-7 items-center justify-center text-muted-foreground"
                              >
                                <Moon className="size-4" />
                              </span>
                            ) : null}
                            {userContactState ? (
                              <NickContactControls
                                contact={userContactState.contact}
                                emoji={userNickEmoji?.emoji ?? null}
                                friend={userContactState.friend}
                                mutedNick={userContactState.mutedNick}
                                nick={user.nick}
                                notifications={userContactState.notificationsEnabled}
                                onAddFriend={props.onAddFriend}
                                onAddNotificationContact={props.onAddNotificationContact}
                                onAddMutedNick={props.onAddMutedNick}
                                onRemoveFriend={props.onRemoveFriend}
                                onRemoveNotificationContact={props.onRemoveNotificationContact}
                                onRemoveMutedNick={props.onRemoveMutedNick}
                                onSaveEmoji={(emoji) =>
                                  props.network
                                    ? props.onSaveNickEmoji(props.network.id, user.nick, emoji)
                                    : Promise.resolve(false)
                                }
                              />
                            ) : null}
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

function NickContactControls(props: {
  contact: BackgroundDmAudioContact;
  emoji: string | null;
  friend: FriendState | null;
  mutedNick: MutedNickState | null;
  nick: string;
  notifications: boolean;
  onAddFriend: (nick: string) => Promise<boolean>;
  onAddNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onAddMutedNick: (networkId: string, nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onRemoveNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
  onSaveEmoji: (emoji: string | null) => Promise<boolean>;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <NickEmojiEditorControl
        emoji={props.emoji}
        nick={props.nick}
        onSave={props.onSaveEmoji}
      />
      <ContactRuleIconButton
        kind="friend"
        active={Boolean(props.friend)}
        label={
          props.friend
            ? `Remove ${props.nick} from watchlist`
            : `Add ${props.nick} to watchlist`
        }
        onClick={() => {
          void (props.friend
            ? props.onRemoveFriend(props.friend.id)
            : props.onAddFriend(props.nick));
        }}
      />
      <ContactRuleIconButton
        kind="notifications"
        active={props.notifications}
        label={
          props.notifications
            ? `Disable notifications for ${props.nick}`
            : `Enable notifications for ${props.nick}`
        }
        onClick={() => {
          if (props.notifications) {
            props.onRemoveNotificationContact(props.contact);
            return;
          }
          void enableContactNotificationsAndUnmute({
            contact: props.contact,
            mutedNick: props.mutedNick,
            removeMutedNick: props.onRemoveMutedNick,
            addNotificationContact: props.onAddNotificationContact,
          });
        }}
      />
      <ContactRuleIconButton
        kind="muted"
        active={Boolean(props.mutedNick)}
        label={props.mutedNick ? `Unmute ${props.nick}` : `Mute ${props.nick}`}
        onClick={() => {
          if (props.mutedNick) {
            void props.onRemoveMutedNick(props.mutedNick.id);
            return;
          }
          void muteContactAndDisableNotifications({
            contact: props.contact,
            addMutedNick: props.onAddMutedNick,
            removeNotificationContact: props.onRemoveNotificationContact,
          });
        }}
      />
    </div>
  );
}
