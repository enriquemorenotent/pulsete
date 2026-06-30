import { memo } from 'react';
import { NicklistPanel } from './NicklistPanel.js';
import { QueryProfileSidebar } from './QueryProfileSidebar.js';
import { ServerProfileSidebar } from './ServerProfileSidebar.js';
import type { DesktopShellNicklistModel } from './desktop-shell-model.js';
import type { WorkspaceView } from './workspace-types.js';
import type { BufferState, ChannelUserState, NetworkProfile } from '../../shared/protocol-chat.js';

type QueryProfileAvatarUser = Pick<ChannelUserState, 'host' | 'nick' | 'username'> & {
  ircCloudAvatarId?: string | null;
};

type WorkspaceRightSidebarProps = {
  workspace: WorkspaceView;
  nicklist: DesktopShellNicklistModel;
  serverProfile?: {
    network: WorkspaceView['selectedNetwork'];
    onEdit: () => void;
    onSaveNotes: (
      network: NonNullable<WorkspaceView['selectedNetwork']>,
      notes: string,
    ) => Promise<NetworkProfile | null>;
  };
  queryProfile?: {
    avatarUser?: QueryProfileAvatarUser | null;
    buffer: BufferState | null;
    externalAvatarsEnabled?: boolean;
    profileImagesVisible?: boolean;
    onSaveNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
  };
};

const isServerProfileWorkspace = (workspace: WorkspaceView) =>
  workspace.selectedBuffer?.kind === 'server';

const isQueryProfileWorkspace = (workspace: WorkspaceView) =>
  workspace.selectedBuffer?.kind === 'query';

export const WorkspaceRightSidebar = memo(function WorkspaceRightSidebar(props: WorkspaceRightSidebarProps) {
  if (isServerProfileWorkspace(props.workspace)) {
    return (
      <ServerProfileSidebar
        network={props.serverProfile?.network ?? null}
        fallbackNetwork={props.workspace.selectedNetwork}
        runtime={props.workspace.selectedRuntime}
        onEdit={props.serverProfile?.onEdit ?? (() => undefined)}
        onSaveNotes={props.serverProfile?.onSaveNotes ?? (async () => null)}
      />
    );
  }

  if (isQueryProfileWorkspace(props.workspace)) {
    return (
      <QueryProfileSidebar
        avatarUser={props.queryProfile?.avatarUser ?? null}
        buffer={props.queryProfile?.buffer ?? props.workspace.selectedBuffer}
        externalAvatarsEnabled={
          props.queryProfile?.externalAvatarsEnabled ?? props.nicklist.externalAvatarsEnabled
        }
        profileImagesVisible={props.queryProfile?.profileImagesVisible}
        onSaveNotes={props.queryProfile?.onSaveNotes ?? (async () => null)}
      />
    );
  }

  if (!props.workspace.showNicklist || !props.workspace.selectedChannel) {
    return null;
  }

  return (
    <div className="h-full min-h-0">
      <NicklistPanel
        network={props.workspace.selectedNetwork}
        channel={props.workspace.selectedChannel}
        friends={props.nicklist.friends}
        mutedNicks={props.nicklist.mutedNicks}
        nickEmojis={props.nicklist.nickEmojis}
        contactNotificationSettings={props.nicklist.contactNotificationSettings}
        contactRuleHandlers={props.nicklist.contactRuleHandlers}
        externalAvatarsEnabled={props.nicklist.externalAvatarsEnabled}
        mediaPolicy={props.nicklist.mediaPolicy}
        onSaveNickEmoji={props.nicklist.onSaveNickEmoji}
        onSelectNick={props.nicklist.onSelectNick}
      />
    </div>
  );
});
