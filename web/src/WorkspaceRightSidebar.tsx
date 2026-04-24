import { memo } from 'react';
import { Button } from '@/components/ui/button.js';
import { NicklistPanel } from './NicklistPanel.js';
import type { DesktopShellNicklistModel } from './desktop-shell-model.js';
import type { WorkspaceView } from './workspace-types.js';

type WorkspaceRightSidebarProps = {
  workspace: WorkspaceView;
  nicklist: DesktopShellNicklistModel;
  serverProfile?: {
    network: WorkspaceView['selectedNetwork'];
    onEdit: () => void;
  };
};

const isServerProfileWorkspace = (workspace: WorkspaceView) =>
  workspace.selectedBuffer?.kind === 'server';

export const WorkspaceRightSidebar = memo(function WorkspaceRightSidebar(props: WorkspaceRightSidebarProps) {
  if (isServerProfileWorkspace(props.workspace)) {
    return (
      <ServerProfileSidebar
        network={props.serverProfile?.network ?? null}
        fallbackNetwork={props.workspace.selectedNetwork}
        onEdit={props.serverProfile?.onEdit ?? (() => undefined)}
      />
    );
  }

  if (!props.workspace.showNicklist || !props.workspace.selectedChannel) {
    return null;
  }

  return (
    <div className="h-full px-3 py-4">
      <NicklistPanel
        network={props.workspace.selectedNetwork}
        channel={props.workspace.selectedChannel}
        friends={props.nicklist.friends}
        mutedNicks={props.nicklist.mutedNicks}
        backgroundDmAudio={props.nicklist.backgroundDmAudio}
        onAddFriend={props.nicklist.onAddFriend}
        onAddNotificationContact={props.nicklist.onAddNotificationContact}
        onAddMutedNick={props.nicklist.onAddMutedNick}
        onRemoveFriend={props.nicklist.onRemoveFriend}
        onRemoveNotificationContact={props.nicklist.onRemoveNotificationContact}
        onRemoveMutedNick={props.nicklist.onRemoveMutedNick}
        onSelectNick={props.nicklist.onSelectNick}
      />
    </div>
  );
});

function ServerProfileSidebar(props: {
  network: WorkspaceView['selectedNetwork'];
  fallbackNetwork: WorkspaceView['selectedNetwork'];
  onEdit: () => void;
}) {
  const network = props.network ?? props.fallbackNetwork;

  if (!network) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-3 py-4">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Profile</p>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{network.name}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {network.host}:{network.port}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={props.onEdit} disabled={!props.network}>
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}
