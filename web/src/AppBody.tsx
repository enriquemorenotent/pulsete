import { useCallback, useMemo } from 'react';
import type { BufferState } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import {
  selectBuffers,
  selectFriendPresence,
  selectFriends,
  selectMessagesByConversation,
  selectNetworkNamesById,
  selectPhase,
  selectPreferences,
  selectSelectedBufferId,
  selectUserAvatarOverrides,
} from './app-selectors.js';
import { useAppSelector, useAppStore } from './app-store.js';
import { useContactNotifications } from './contact-notifications/controller.js';
import { useWatchlistPresenceNotifications } from './contact-notifications/friend-presence-notification.js';
import { DesktopShell, type DesktopShellProps } from './DesktopShell.js';
import {
  resolveMediaVisibilityPolicy,
  useMediaVisibilitySettings,
} from './media-visibility-settings.js';
import { ToastContainer } from './ToastContainer.js';
import { useUserAvatarSettings } from './user-avatars/settings.js';
import {
  AvatarOverridesProvider,
  createUserAvatarOverrideMap,
} from './user-avatars/query-overrides.js';
import {
  resolveUserAvatarOverrideUrl,
  resolveUserAvatarTarget,
} from './user-avatars/override-model.js';
import type { AppTransientUiState } from './useAppUiState.js';

type AppBodyProps = Omit<
  DesktopShellProps,
  'contactNotifications' | 'mediaVisibilitySettings' | 'ui' | 'userAvatarSettings'
> & { ui: AppTransientUiState };

export function AppBody(props: AppBodyProps) {
  const store = useAppStore();
  const phase = useAppSelector(selectPhase);
  const buffers = useAppSelector(selectBuffers);
  const friends = useAppSelector(selectFriends);
  const friendPresence = useAppSelector(selectFriendPresence);
  const networkNamesById = useAppSelector(selectNetworkNamesById);
  const selectedBufferId = useAppSelector(selectSelectedBufferId);
  const preferences = useAppSelector(selectPreferences);
  const userAvatarOverrides = useAppSelector(selectUserAvatarOverrides);
  const getMessagesByConversation = useCallback(
    () => selectMessagesByConversation(store.getState()),
    [store],
  );
  const setMediaVisibilityMode = useCallback(
    (mode: 'show-media' | 'hide-media') => {
      void props.actions.updatePreferences({ mediaVisibilityMode: mode });
    },
    [props.actions],
  );
  const mediaVisibilitySettings = useMediaVisibilitySettings(
    { mode: preferences.mediaVisibilityMode },
    setMediaVisibilityMode,
  );
  const mediaPolicy = useMemo(
    () => resolveMediaVisibilityPolicy(mediaVisibilitySettings.settings),
    [mediaVisibilitySettings.settings],
  );
  const userAvatarOverrideMap = useMemo(
    () => createUserAvatarOverrideMap(userAvatarOverrides),
    [userAvatarOverrides],
  );
  const getNotificationAvatarIconUrl = useCallback((buffer: BufferState) => {
    if (buffer.kind !== 'query') {
      return null;
    }
    return resolveUserAvatarOverrideUrl({
      allowNickFallback: true,
      target: resolveUserAvatarTarget(buffer.networkId, {
        identity: buffer.peerIdentity,
        nick: buffer.target,
      }),
      userAvatarOverrides: userAvatarOverrideMap,
    });
  }, [userAvatarOverrideMap]);
  const updateContactNotificationSettings = useCallback(
    (settings: typeof preferences.contactNotifications) => {
      void props.actions.updatePreferences({ contactNotifications: settings });
    },
    [props.actions],
  );
  const contactNotifications = useContactNotifications({
    buffers,
    getMessagesByConversation,
    getAvatarIconUrl: getNotificationAvatarIconUrl,
    networkNamesById,
    onSelectBuffer: props.actions.selectTabBuffer,
    selectedBufferId,
    systemNotificationIconsEnabled: mediaPolicy.showNotificationIcons,
    settings: preferences.contactNotifications,
    onSettingsChange: updateContactNotificationSettings,
  });
  useWatchlistPresenceNotifications({
    friends,
    friendPresence,
    onSelectFriend: props.actions.selectFriend,
    systemEnabled: contactNotifications.settings.systemEnabled,
    systemPermission: contactNotifications.systemPermission,
  });
  const setExternalAvatarsEnabled = useCallback(
    (enabled: boolean) => {
      void props.actions.updatePreferences({ externalAvatarsEnabled: enabled });
    },
    [props.actions],
  );
  const userAvatarSettings = useUserAvatarSettings(
    { externalAvatarsEnabled: preferences.externalAvatarsEnabled },
    setExternalAvatarsEnabled,
  );
  const ui = useMemo(() => ({
    ...props.ui,
    hideOfflineFriends: preferences.hideOfflineFriends,
    toggleHideOfflineFriends: () => {
      void props.actions.updatePreferences({
        hideOfflineFriends: !preferences.hideOfflineFriends,
      });
    },
  }), [preferences.hideOfflineFriends, props.actions, props.ui]);
  const saveAvatarOverride = useCallback((input: {
    networkId: string;
    nick: string;
    identity: NetworkUserIdentity | null | undefined;
    dataUrl?: string;
    externalUrl?: string;
  }) => {
    void props.actions.saveAvatarOverride(input);
  }, [props.actions]);
  const removeAvatarOverride = useCallback((id: string) => {
    void props.actions.removeAvatarOverride(id);
  }, [props.actions]);

  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-6 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <>
      <AvatarOverridesProvider
        overrides={userAvatarOverrides}
        onSave={saveAvatarOverride}
        onRemove={removeAvatarOverride}
      >
        <DesktopShell
          {...props}
          ui={ui}
          contactNotifications={contactNotifications}
          mediaVisibilitySettings={mediaVisibilitySettings}
          userAvatarSettings={userAvatarSettings}
        />
      </AvatarOverridesProvider>
      <ToastContainer />
    </>
  );
}
