import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Moon } from 'lucide-react';
import type { ChannelState, FriendState, MutedNickState, NetworkProfile } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { channelUserModeTone } from './channel-user-tone.js';
import { ContactRuleIconButton, ContactSettingsIconButton } from './ContactRuleButtons.js';
import { ContactSettingsDialog } from './ContactSettingsDialog.js';
import { resolveContactRuleState } from './contact-rules.js';
import type {
  BackgroundDmAudioContact,
  BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { buildNicklistGroups } from './nicklist-groups.js';
import { SidebarWidget } from './SidebarWidget.js';

type NicklistPanelProps = {
  network: NetworkProfile | null;
  channel: ChannelState;
  friends: FriendState[];
  mutedNicks: MutedNickState[];
  backgroundDmAudio: Pick<BackgroundDmAudioSettings, 'contacts'>;
  onAddFriend: (nick: string) => Promise<boolean>;
  onAddNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onAddMutedNick: (networkId: string, nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onRemoveNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
  onSelectNick: (network: NetworkProfile, nick: string) => void;
};

export function NicklistPanel(props: NicklistPanelProps) {
  const [query, setQuery] = useState('');
  const [contactNick, setContactNick] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const groups = useMemo(
    () => buildNicklistGroups(props.channel.users, props.friends, deferredQuery),
    [deferredQuery, props.channel.users, props.friends],
  );

  useEffect(() => {
    setQuery('');
    setContactNick(null);
  }, [props.channel.id]);

  const contactState = props.network && contactNick
    ? resolveContactRuleState({
        networkId: props.network.id,
        nick: contactNick,
        friends: props.friends,
        mutedNicks: props.mutedNicks,
        backgroundDmAudio: props.backgroundDmAudio,
      })
    : null;

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
                        return (
                          <div key={user.nick} className="flex items-center rounded-sm">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                              onClick={() => props.network && props.onSelectNick(props.network, user.nick)}
                            >
                              <span className={cn('truncate', channelUserModeTone(user.mode))}>{user.nick}</span>
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
                                friend={userContactState.friend}
                                mutedNick={userContactState.mutedNick}
                                nick={user.nick}
                                notifications={userContactState.notificationsEnabled}
                                onAddFriend={props.onAddFriend}
                                onAddNotificationContact={props.onAddNotificationContact}
                                onAddMutedNick={props.onAddMutedNick}
                                onOpenSettings={() => setContactNick(user.nick)}
                                onRemoveFriend={props.onRemoveFriend}
                                onRemoveNotificationContact={props.onRemoveNotificationContact}
                                onRemoveMutedNick={props.onRemoveMutedNick}
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
      {props.network && contactState && contactNick ? (
        <ContactSettingsDialog
          open={Boolean(contactNick)}
          onOpenChange={(open) => {
            if (!open) {
              setContactNick(null);
            }
          }}
          networkName={props.network.name}
          nick={contactNick}
          friend={Boolean(contactState.friend)}
          notifications={contactState.notificationsEnabled}
          muted={Boolean(contactState.mutedNick)}
          onFriendChange={(active) => {
            void (active
              ? props.onAddFriend(contactNick)
              : contactState.friend && props.onRemoveFriend(contactState.friend.id));
          }}
          onNotificationsChange={(active) => {
            if (active) {
              props.onAddNotificationContact(contactState.contact);
              return;
            }
            props.onRemoveNotificationContact(contactState.contact);
          }}
          onMutedChange={(active) => {
            void (active
              ? props.onAddMutedNick(props.network!.id, contactNick)
              : contactState.mutedNick && props.onRemoveMutedNick(contactState.mutedNick.id));
          }}
        />
      ) : null}
    </aside>
  );
}

function NickContactControls(props: {
  contact: BackgroundDmAudioContact;
  friend: FriendState | null;
  mutedNick: MutedNickState | null;
  nick: string;
  notifications: boolean;
  onAddFriend: (nick: string) => Promise<boolean>;
  onAddNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onAddMutedNick: (networkId: string, nick: string) => Promise<boolean>;
  onOpenSettings: () => void;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onRemoveNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <ContactRuleIconButton
        kind="friend"
        active={Boolean(props.friend)}
        label={
          props.friend
            ? `Remove ${props.nick} from friends`
            : `Add ${props.nick} as friend`
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
          props.onAddNotificationContact(props.contact);
        }}
      />
      <ContactRuleIconButton
        kind="muted"
        active={Boolean(props.mutedNick)}
        label={props.mutedNick ? `Unmute ${props.nick}` : `Mute ${props.nick}`}
        onClick={() => {
          void (props.mutedNick
            ? props.onRemoveMutedNick(props.mutedNick.id)
            : props.onAddMutedNick(props.contact.networkId, props.nick));
        }}
      />
      <ContactSettingsIconButton
        label={`Contact settings for ${props.nick}`}
        active={Boolean(props.friend) || props.notifications || Boolean(props.mutedNick)}
        onClick={props.onOpenSettings}
      />
    </div>
  );
}
