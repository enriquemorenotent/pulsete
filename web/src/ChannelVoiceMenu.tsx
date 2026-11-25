import type { ReactElement } from 'react';
import { ContextMenu } from 'radix-ui';
import { getStoredChannelUserModes } from '../../shared/channel-users.js';
import type { ChannelUserState } from '../../shared/protocol-chat.js';
import { containOverlayKeyDown } from './components/ui/overlay-keyboard.js';

export function ChannelVoiceMenu({ children, user, onSetVoice }: {
  children: ReactElement;
  user: ChannelUserState;
  onSetVoice: (nick: string, enabled: boolean) => void;
}) {
  const voiced = getStoredChannelUserModes(user).includes('voice');
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild aria-haspopup="menu">
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content collisionPadding={8} onKeyDown={containOverlayKeyDown}
          className="z-50 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          <ContextMenu.Item onSelect={() => onSetVoice(user.nick, !voiced)}
            className="cursor-default select-none rounded-lg px-3 py-2 text-xs outline-none data-[highlighted]:bg-accent">
            {voiced ? 'Remove voice' : 'Give voice'}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
