import type { ConversationModel } from './conversation-model.js';
import type { State } from './app-types.js';
import type { WorkspaceView } from './workspace-types.js';

export type AppSessionSnapshot = {
  conversation: ConversationModel;
  draft: string;
  state: State;
  workspace: WorkspaceView;
};

export const createAppSessionSnapshot = (snapshot: AppSessionSnapshot): AppSessionSnapshot => snapshot;
