import type { WorkspaceView } from './workspace-types.js';

export type ChatPaneStatusAction =
  | {
      kind: 'reconnect';
      label: string;
    }
  | {
      kind: 'rejoin';
      channel: string;
      label: string;
    };

export type ChatPaneStatusBannerState = {
  tone: 'muted' | 'warning';
  title: string;
  body: string;
  action?: ChatPaneStatusAction;
};

export const resolveChatPaneStatusBanner = (
  workspace: WorkspaceView,
): ChatPaneStatusBannerState | null => {
  const phase = workspace.selectedRuntime?.phase ?? 'offline';
  const currentChannel =
    workspace.selectedPendingChannel?.channel ??
    (workspace.selectedBuffer?.kind === 'channel'
      ? workspace.selectedBuffer.target
      : null);

  if (workspace.mode === 'channel-pending') {
    if (phase === 'connected') {
      return {
        tone: 'warning',
        title: 'Joining channel',
        body: `Joining ${currentChannel ?? 'this channel'}. Wait for the server to confirm the membership.`,
      };
    }
    if (phase === 'connecting') {
      return {
        tone: 'warning',
        title: 'Waiting on connection',
        body: `Reconnecting before joining ${currentChannel ?? 'this channel'}.`,
      };
    }
    return {
      tone: 'muted',
      title: 'Offline',
      body: `Reconnect to finish joining ${currentChannel ?? 'this channel'}.`,
      action: workspace.selectedNetwork
        ? {
            kind: 'reconnect',
            label: 'Reconnect',
          }
        : undefined,
    };
  }

  if (
    workspace.mode === 'channel-offline' &&
    phase === 'connected' &&
    workspace.selectedBuffer?.kind === 'channel' &&
    !workspace.selectedChannel
  ) {
    return {
      tone: 'warning',
      title: 'Not joined',
      body: `You're not in ${workspace.selectedBuffer.target}. Rejoin to send messages again.`,
      action: {
        kind: 'rejoin',
        channel: workspace.selectedBuffer.target,
        label: `Rejoin ${workspace.selectedBuffer.target}`,
      },
    };
  }

  if (
    workspace.mode === 'server-connecting' ||
    workspace.mode === 'channel-connecting' ||
    workspace.mode === 'query-connecting'
  ) {
    return {
      tone: 'warning',
      title: 'Reconnecting',
      body: 'Reconnecting. History stays available until the connection returns.',
    };
  }

  if (
    workspace.mode === 'server-offline' ||
    workspace.mode === 'channel-offline' ||
    workspace.mode === 'query-offline'
  ) {
    return {
      tone: 'muted',
      title: 'Offline',
      body:
        workspace.mode === 'server-offline'
          ? "You're offline. Reconnect to restore channels and private messages."
          : "You're offline. History stays available until you reconnect.",
      action: workspace.selectedNetwork
        ? {
            kind: 'reconnect',
            label: 'Reconnect',
          }
        : undefined,
    };
  }

  return null;
};
