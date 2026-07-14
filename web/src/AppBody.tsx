import { useCallback, useMemo } from 'react';
import {
  selectBuffers,
  selectFriendPresence,
  selectFriends,
  selectMessagesByConversation,
  selectNetworkNamesById,
  selectPhase,
  selectSelectedBufferId,
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

type AppBodyProps = Omit<
  DesktopShellProps,
  'contactNotifications' | 'mediaVisibilitySettings' | 'userAvatarSettings'
>;

export function AppBody(props: AppBodyProps) {
  const store = useAppStore();
  const phase = useAppSelector(selectPhase);
  const buffers = useAppSelector(selectBuffers);
  const friends = useAppSelector(selectFriends);
  const friendPresence = useAppSelector(selectFriendPresence);
  const networkNamesById = useAppSelector(selectNetworkNamesById);
  const selectedBufferId = useAppSelector(selectSelectedBufferId);
  const getMessagesByConversation = useCallback(
    () => selectMessagesByConversation(store.getState()),
    [store],
  );
  const mediaVisibilitySettings = useMediaVisibilitySettings();
  const mediaPolicy = useMemo(
    () => resolveMediaVisibilityPolicy(mediaVisibilitySettings.settings),
    [mediaVisibilitySettings.settings],
  );
  const contactNotifications = useContactNotifications({
    buffers,
    getMessagesByConversation,
    networkNamesById,
    onSelectBuffer: props.actions.selectTabBuffer,
    selectedBufferId,
    systemNotificationIconsEnabled: mediaPolicy.showNotificationIcons,
  });
  useWatchlistPresenceNotifications({
    friends,
    friendPresence,
    onSelectFriend: props.actions.selectFriend,
    systemEnabled: contactNotifications.settings.systemEnabled,
    systemPermission: contactNotifications.systemPermission,
  });
  const userAvatarSettings = useUserAvatarSettings();

  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-6 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <>
      <DesktopShell
        {...props}
        contactNotifications={contactNotifications}
        mediaVisibilitySettings={mediaVisibilitySettings}
        userAvatarSettings={userAvatarSettings}
      />
      <ToastContainer />
    </>
  );
}
