import { memo } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { AutosaveNotesEditor } from './AutosaveNotesEditor.js';
import { NicklistPanel } from './NicklistPanel.js';
import { QueryProfileSidebar } from './QueryProfileSidebar.js';
import {
  InspectorHeader,
  InspectorPanel,
  InspectorSection,
  MetadataRow,
} from './RightSidebarInspector.js';
import type { DesktopShellNicklistModel } from './desktop-shell-model.js';
import {
  getNetworkManagerAuthLabel,
  getNetworkManagerAutoJoinLabel,
  getNetworkManagerStatusLabel,
} from './network-manager-dialog-model.js';
import type { WorkspaceView } from './workspace-types.js';
import { emptyNetworkRuntimeCapabilities } from '../../shared/protocol-chat.js';
import type {
  BufferState,
  ChannelUserState,
  NetworkProfile,
  NetworkRuntimeCapabilities,
} from '../../shared/protocol-chat.js';

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
        onSaveNickEmoji={props.nicklist.onSaveNickEmoji}
        onSelectNick={props.nicklist.onSelectNick}
      />
    </div>
  );
});

function ServerProfileSidebar(props: {
  network: WorkspaceView['selectedNetwork'];
  fallbackNetwork: WorkspaceView['selectedNetwork'];
  runtime: WorkspaceView['selectedRuntime'];
  onEdit: () => void;
  onSaveNotes: (
    network: NonNullable<WorkspaceView['selectedNetwork']>,
    notes: string,
  ) => Promise<NetworkProfile | null>;
}) {
  const network = props.network ?? props.fallbackNetwork;

  if (!network) {
    return null;
  }

  return (
    <InspectorPanel>
      <InspectorHeader
        eyebrow="Profile"
        title={network.name}
        subtitle={`${network.host}:${network.port}${network.tls ? ' - SSL/TLS' : ''}`}
        actions={(
          <Button
            variant="ghost"
            size="sm"
            className="h-7 border border-white/[0.055] bg-transparent px-2 text-muted-foreground/86 hover:border-white/12 hover:bg-white/[0.045] hover:text-foreground"
            onClick={props.onEdit}
            disabled={!props.network}
          >
            Edit
          </Button>
        )}
      />

      <InspectorSection title="Connection">
        <dl className="space-y-1.5">
          <MetadataRow label="Status" value={getNetworkManagerStatusLabel(props.runtime)} />
          <MetadataRow label="Nick" value={props.runtime?.nick ?? network.nick} />
          <MetadataRow label="Auth" value={getNetworkManagerAuthLabel(network)} />
          <MetadataRow label="Autojoin" value={getNetworkManagerAutoJoinLabel(network)} />
        </dl>
      </InspectorSection>
      <ServerCapabilityInspector capabilities={props.runtime?.capabilities} />

      <AutosaveNotesEditor
        id="server-profile-notes"
        notes={network.notes ?? ''}
        onSave={(notes) => props.onSaveNotes(network, notes).then(Boolean)}
        placeholder="Character, aliases, plot hooks..."
        scopeKey={network.id}
      />
    </InspectorPanel>
  );
}

function ServerCapabilityInspector(props: {
  capabilities?: NetworkRuntimeCapabilities | null;
}) {
  const capabilities = props.capabilities ?? emptyNetworkRuntimeCapabilities();
  const negotiated = capabilities.negotiated;
  const pending = capabilities.pending;
  const unavailable = new Set([...negotiated, ...pending]);
  const offered = capabilities.offered.filter((capability) => !unavailable.has(capability));
  const hasCapabilities = negotiated.length > 0 || offered.length > 0 || pending.length > 0;
  if (!hasCapabilities) {
    return null;
  }

  return (
    <InspectorSection title="Capabilities">
      <div className="space-y-2.5">
        <CapabilityGroup capabilities={negotiated} label="Active" variant="success" />
        <CapabilityGroup capabilities={offered} label="Offered" variant="secondary" />
        <CapabilityGroup capabilities={pending} label="Pending" variant="default" />
      </div>
    </InspectorSection>
  );
}

function CapabilityGroup(props: {
  capabilities: string[];
  label: string;
  variant: BadgeProps['variant'];
}) {
  if (props.capabilities.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
        {props.label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {props.capabilities.map((capability) => (
          <Badge
            key={capability}
            variant={props.variant}
            className="max-w-full normal-case tracking-normal opacity-[0.82]"
          >
            <span className="truncate">{capability}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
