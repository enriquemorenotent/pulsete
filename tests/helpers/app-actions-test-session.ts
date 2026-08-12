import type { ConversationModel } from '../../web/src/conversation-model.js';
import type { State } from '../../web/src/app-types.js';
import type {
  AppActionContext,
  ApplyServerMessages,
  AppDispatch,
  MutableRef,
} from '../../web/src/app-actions-types.js';
import type { SocketHandle } from '../../web/src/client.js';
import { createServerMessageBridge } from '../../web/src/server-message-bridge.js';
import { createAppActions } from '../../web/src/useAppActions.js';
import type { WorkspaceView } from '../../web/src/workspace-types.js';

export type AppSessionSnapshot = {
  conversation: ConversationModel;
  draft: string;
  state: State;
  workspace: WorkspaceView;
};

type CreateTestAppActionsParams = {
  applyServerMessages?: ApplyServerMessages;
  draft?: string;
  getDraft?: AppActionContext['getDraft'];
  session?: AppSessionSnapshot;
  state?: State;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: AppActionContext['recordComposerEntry'];
  setDraft: AppActionContext['setDraft'];
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export const createAppActionsForTest = (params: CreateTestAppActionsParams) => {
  const state = params.state ?? params.session?.state;
  if (!state) {
    throw new Error('Test app actions require state or session');
  }
  const getDraft = params.getDraft ?? ((contextKey: string | null) => {
    const selectedBufferId = params.session?.workspace.selectedBuffer?.id ?? null;
    return contextKey === null || contextKey === selectedBufferId
      ? params.session?.draft ?? params.draft ?? ''
      : '';
  });
  return createAppActions({
    applyServerMessages: params.applyServerMessages
      ?? createServerMessageBridge(params.dispatch).applyMutationMessages,
    getConversation: params.session ? () => params.session!.conversation : undefined,
    getDraft,
    getState: () => state,
    getWorkspace: params.session ? () => params.session!.workspace : undefined,
    dispatch: params.dispatch,
    socketRef: params.socketRef,
    setDraft: params.setDraft,
    recordComposerEntry: params.recordComposerEntry,
    updateBanner: params.updateBanner,
  });
};
