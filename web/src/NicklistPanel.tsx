import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Moon } from 'lucide-react';
import type { ChannelState, FriendState, MutedNickState, NetworkProfile, NickEmojiState } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { cn } from '@/lib/utils.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { channelUserModeTone } from './channel-user-tone.js';
import { ContactRuleControls } from './contact-notifications/ContactRuleControls.js';
import {
  resolveContactRuleState,
  type ContactRuleHandlers,
} from './contact-notifications/contact-rules.js';
import type { ContactNotificationSettings } from './contact-notifications/settings.js';
import { buildNicklistGroups } from './nicklist-groups.js';
import { findNickEmoji } from './nick-emoji-utils.js';
import { NickEmojiEditorControl } from './NickEmojiEditorControl.js';
import {
  InspectorHeader,
  InspectorPanel,
  InspectorSection,
} from './RightSidebarInspector.js';
import { UserAvatar } from './user-avatars/UserAvatar.js';

type NicklistPanelProps = {
  network: NetworkProfile | null;
  channel: ChannelState;
  friends: FriendState[];
  mutedNicks: MutedNickState[];
  nickEmojis: NickEmojiState[];
  contactNotificationSettings: Pick<ContactNotificationSettings, 'contacts'>;
  contactRuleHandlers: ContactRuleHandlers;
  externalAvatarsEnabled: boolean;
  onSaveNickEmoji: (
    networkId: string,
    nick: string,
    emoji: string | null,
    identity?: NetworkUserIdentity | null,
  ) => Promise<boolean>;
  onSelectNick: (
    network: NetworkProfile,
    nick: string,
    identity?: NetworkUserIdentity | null,
  ) => void;
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
    <InspectorPanel>
      <InspectorHeader
        eyebrow="Channel users"
        title={props.channel.name}
        subtitle={formatUserCount(props.channel.users.length)}
      />
      <InspectorSection className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {props.channel.users.length === 0 ? (
          <div className="px-1 py-1 text-[13px] text-muted-foreground">
            No users yet.
          </div>
        ) : (
          <>
            <div className="shrink-0">
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
            <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!min-w-0 [&_[data-radix-scroll-area-viewport]>div]:!w-full">
              <div className="w-full min-w-0 py-1">
                {groups.length === 0 ? (
                  <div className="px-2 py-2 text-[13px] text-muted-foreground">
                    No matching users.
                  </div>
                ) : (
                  groups.map((group, groupIndex) => (
                    <section
                      key={group.mode}
                      className={cn('w-full min-w-0', groupIndex > 0 && 'mt-3 border-t border-border/70 pt-3')}
                    >
                      <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {group.label}
                      </div>
                      {group.users.map((user) => {
                        const userContactState = props.network
                          ? resolveContactRuleState({
                              networkId: props.network.id,
                              nick: user.nick,
                              identity: user.identity,
                              friends: props.friends,
                              mutedNicks: props.mutedNicks,
                              contactNotifications: props.contactNotificationSettings,
                            })
                          : null;
                        const userNickEmoji = props.network
                          ? findNickEmoji(props.nickEmojis, props.network.id, user.nick, user.identity)
                          : null;
                        return (
                          <div
                            key={user.nick}
                            className="group flex w-full min-w-0 items-center overflow-hidden rounded-sm hover:bg-accent/60 focus-within:bg-accent/60"
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden px-2 py-1.5 text-left text-[13px] text-foreground"
                              onClick={() => props.network && props.onSelectNick(props.network, user.nick, user.identity)}
                            >
                              <UserAvatar
                                enabled={props.externalAvatarsEnabled}
                                placeholder="initial"
                                user={user}
                              />
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
                              <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-pressed=true]]:opacity-100">
                                <NickEmojiEditorControl
                                  emoji={userNickEmoji?.emoji ?? null}
                                  nick={user.nick}
                                  onSave={(emoji) =>
                                    props.network
                                      ? props.onSaveNickEmoji(props.network.id, user.nick, emoji, user.identity)
                                      : Promise.resolve(false)
                                  }
                                />
                                <ContactRuleControls
                                  state={userContactState}
                                  handlers={props.contactRuleHandlers}
                                  className="flex shrink-0 items-center gap-0.5"
                                />
                              </div>
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
      </InspectorSection>
    </InspectorPanel>
  );
}

function formatUserCount(count: number) {
  return `${count} ${count === 1 ? 'user' : 'users'}`;
}
