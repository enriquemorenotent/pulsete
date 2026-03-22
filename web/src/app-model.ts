import type { ChatMessage, NetworkProfile } from '../../shared/protocol.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';
import type { ConversationModel } from './conversation-model.js';
import { buildManagedRuntime } from './network-manager-runtime.js';
import type { WorkspaceView } from './workspace-types.js';

export type AppModel = {
  channelListNetwork: NetworkProfile | null;
  conversation: ConversationModel;
  hiddenManagedNetworkName: string | null;
  managedRuntime: ReturnType<typeof buildManagedRuntime>;
  selectedMessages: ChatMessage[];
  sidebarConnections: SidebarConnectionView[];
  visibleManagedNetwork: NetworkProfile | null;
  visibleNetworks: NetworkProfile[];
  workspace: WorkspaceView;
};
