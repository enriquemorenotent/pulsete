import { buildConversationModel } from './conversation-model.js';
import type { ConversationIndex } from './conversation-selectors.js';
import type { AppSnapshot, NetworkProfile } from '../../shared/protocol.js';
import { getWorkspaceNetworks } from './workspace-helpers.js';
import { buildEmptyWorkspace, buildResolvedWorkspace } from './workspace-builders.js';
import { resolveWorkspace, type WorkspaceInput } from './workspace-resolve.js';
import type { WorkspaceView } from './workspace-types.js';

export type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace-types.js';
export {
  getConnectionStatus,
  getConnectionLabel,
  getConnectionLabelParts,
  type ConnectionLabelParts,
} from './workspace-helpers.js';
export const selectDefaultBuffer = (snapshot: Pick<AppSnapshot, 'networks' | 'buffers'>) =>
  buildConversationModel({
    buffers: snapshot.buffers,
    channels: [],
    pendingChannels: [],
  }).selectDefaultBuffer(snapshot.networks);

export const deriveWorkspace = (input: WorkspaceInput): WorkspaceView => {
  const resolved = resolveWorkspace(input);
  return resolved ? buildResolvedWorkspace(resolved) : buildEmptyWorkspace(getWorkspaceNetworks(input.networks));
};

export type { ConversationIndex, NetworkProfile };
