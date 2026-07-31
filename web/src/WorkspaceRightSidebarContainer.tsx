import { memo, useMemo } from 'react';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar.js';
import { openExistingNetworkEditor } from './network-editor-actions.js';
import {
  selectChannels,
  selectFriends,
  selectMutedNicks,
  selectNickEmojis,
  selectPreferences,
  selectServerProfileNetwork,
  selectWorkspace,
} from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import type { ComposerStoreApi } from './composer-store.js';
import type { ContactRuleHandlers } from './contact-notifications/contact-rules.js';
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import type { MediaVisibilityPolicy } from './media-visibility-settings.js';
import { useDesktopNicklistModel } from './useDesktopShellModel.js';
import { resolveUserAvatarCandidate } from './user-avatars/irccloud.js';
import type { AppActions } from './useAppActions.js';
import type { AiAssistantStoreApi } from './ai-assistant-store.js';

type WorkspaceRightSidebarContainerProps = {
  actions: AppActions;
  assistantStore: AiAssistantStoreApi;
  composer: ComposerStoreApi;
  contactNotifications: ContactNotificationsController;
  contactRuleHandlers: ContactRuleHandlers;
  externalAvatarsEnabled: boolean;
  mediaPolicy: MediaVisibilityPolicy;
};

export const WorkspaceRightSidebarContainer = memo(function WorkspaceRightSidebarContainer({
  actions,
  assistantStore,
  composer,
  contactNotifications,
  contactRuleHandlers,
  externalAvatarsEnabled,
  mediaPolicy,
}: WorkspaceRightSidebarContainerProps) {
  const dispatch = useAppDispatch();
  const channels = useAppSelector(selectChannels);
  const friends = useAppSelector(selectFriends);
  const mutedNicks = useAppSelector(selectMutedNicks);
  const nickEmojis = useAppSelector(selectNickEmojis);
  const serverProfileNetwork = useAppSelector(selectServerProfileNetwork);
  const workspace = useAppSelector(selectWorkspace);
  const preferences = useAppSelector(selectPreferences);
  const nicklist = useDesktopNicklistModel({
    actions,
    contactNotifications,
    contactRuleHandlers,
    externalAvatarsEnabled,
    friends,
    mediaPolicy,
    mutedNicks,
    nickEmojis,
  });
  const serverProfile = useMemo(() => ({
    network: serverProfileNetwork,
    onEdit: () => {
      if (serverProfileNetwork) {
        openExistingNetworkEditor(serverProfileNetwork, {
          dispatch,
          initialTab: 'servers',
          returnMode: 'closed',
        });
      }
    },
    onSaveNotes: actions.saveNetworkNotes,
    accordionState: serverProfileNetwork
      ? preferences.serverSidebarAccordions[serverProfileNetwork.id] ?? {}
      : {},
    onSetAccordionState: (state: import('./server-sidebar-accordion-state.js').ServerSidebarAccordionState) => {
      if (!serverProfileNetwork) {
        return;
      }
      void actions.updatePreferences({
        serverSidebarAccordions: {
          ...preferences.serverSidebarAccordions,
          [serverProfileNetwork.id]: state,
        },
      });
    },
  }), [
    actions.saveNetworkNotes,
    actions.updatePreferences,
    dispatch,
    preferences.serverSidebarAccordions,
    serverProfileNetwork,
  ]);
  const queryProfile = useMemo(() => {
    const buffer = workspace.selectedBuffer?.kind === 'query' ? workspace.selectedBuffer : null;
    return {
      avatarUser: buffer
        ? resolveUserAvatarCandidate(
            channels,
            buffer.networkId,
            buffer.target,
            buffer.ircCloudAvatarId,
          )
        : null,
      buffer,
      externalAvatarsEnabled,
      profileImagesVisible: mediaPolicy.showProfileImages,
      onSaveNotes: actions.saveBufferNotes,
    };
  }, [
    actions.saveBufferNotes,
    channels,
    externalAvatarsEnabled,
    mediaPolicy.showProfileImages,
    workspace.selectedBuffer,
  ]);
  const assistant = useMemo(() => {
    const buffer = workspace.selectedBuffer?.kind === 'channel'
      || workspace.selectedBuffer?.kind === 'query'
      ? workspace.selectedBuffer
      : null;
    return {
      buffer,
      onUseSuggestion: (value: string) => composer.setDraft(buffer?.id ?? null, value),
      store: assistantStore,
    };
  }, [assistantStore, composer, workspace.selectedBuffer]);
  return (
    <WorkspaceRightSidebar
      workspace={workspace}
      nicklist={nicklist}
      assistant={assistant}
      serverProfile={serverProfile}
      queryProfile={queryProfile}
    />
  );
});
