import type { ChatPaneComposerTarget } from './ChatPaneComposerTargetChip.js';
import type { WorkspaceView } from './workspace.js';

export function resolveChatPaneComposerTarget(
  workspace: WorkspaceView,
): ChatPaneComposerTarget | null {
  if (workspace.composerMode === 'hidden') {
    return null;
  }
  if (workspace.composerMode === 'commands') {
    return { kind: 'server', label: workspace.selectedNetwork?.name ?? 'Server' };
  }
  if (workspace.selectedBuffer?.kind === 'channel') {
    return {
      kind: 'channel',
      label: workspace.selectedChannel?.name ?? workspace.selectedBuffer.target,
    };
  }
  if (workspace.selectedPendingChannel) {
    return { kind: 'channel', label: workspace.selectedPendingChannel.channel };
  }
  if (workspace.selectedBuffer?.kind === 'query') {
    return { kind: 'query', label: workspace.selectedBuffer.target };
  }
  return null;
}
