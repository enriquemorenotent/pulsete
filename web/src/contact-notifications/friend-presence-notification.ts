import { useEffect, useRef } from 'react';
import type { FriendState, PresenceStatus } from '../../../shared/protocol-chat.js';
import { shouldShowSystemNotification } from './browser.js';
import {
  clearContactSystemNotificationHandlers,
  closeContactSystemNotification,
  resolveNotificationConstructor,
  type ContactSystemNotificationConstructor,
  type ContactSystemNotificationHandle,
} from './system-notification.js';

export type WatchlistPresenceAvailability = 'online' | 'offline';

export type WatchlistPresenceNotification = {
  friend: FriendState;
  availability: WatchlistPresenceAvailability;
};

type WatchlistPresenceSnapshot = ReadonlyMap<string, WatchlistPresenceAvailability>;

type WatchlistPresenceSystemNotificationInput = {
  focusWindow?: () => void;
  friend: FriendState;
  availability: WatchlistPresenceAvailability;
  notificationConstructor?: ContactSystemNotificationConstructor;
  onRelease?: (notification: ContactSystemNotificationHandle) => void;
  onSelectFriend: (friend: FriendState) => void | Promise<void>;
};

type WatchlistPresenceSystemNotificationDispatchInput = {
  activeNotifications: WatchlistPresenceNotificationHandles;
  notification: WatchlistPresenceNotification;
  notificationConstructor?: ContactSystemNotificationConstructor;
  onSelectFriend: (friend: FriendState) => void | Promise<void>;
};

type WatchlistPresenceNotificationHandles = Map<string, ContactSystemNotificationHandle>;

export const resolveWatchlistPresenceAvailability = (
  presence: PresenceStatus | undefined,
): WatchlistPresenceAvailability => presence && presence !== 'offline' ? 'online' : 'offline';

export const createWatchlistPresenceSnapshot = (
  friends: readonly FriendState[],
  friendPresence: Readonly<Record<string, PresenceStatus>>,
): WatchlistPresenceSnapshot =>
  new Map(
    friends.map((friend) => [
      friend.id,
      resolveWatchlistPresenceAvailability(friendPresence[friend.id]),
    ]),
  );

export const findWatchlistPresenceNotifications = (input: {
  previousPresence: WatchlistPresenceSnapshot;
  friends: readonly FriendState[];
  friendPresence: Readonly<Record<string, PresenceStatus>>;
}): WatchlistPresenceNotification[] => {
  const notifications: WatchlistPresenceNotification[] = [];
  for (const friend of input.friends) {
    const previousAvailability = input.previousPresence.get(friend.id);
    if (!previousAvailability) {
      continue;
    }
    const availability = resolveWatchlistPresenceAvailability(
      input.friendPresence[friend.id],
    );
    if (availability !== previousAvailability) {
      notifications.push({ friend, availability });
    }
  }
  return notifications;
};

export const createWatchlistPresenceSystemNotification = (
  input: WatchlistPresenceSystemNotificationInput,
) => {
  const NotificationClass =
    input.notificationConstructor ?? resolveNotificationConstructor();
  if (!NotificationClass) {
    return null;
  }
  const notification = new NotificationClass(input.friend.nick, {
    body: `${input.friend.nick} is ${input.availability}`,
    tag: `pulsete-watchlist:${input.friend.id}`,
  });
  let released = false;
  const cleanup = () => {
    if (released) {
      return;
    }
    released = true;
    clearContactSystemNotificationHandlers(notification);
    input.onRelease?.(notification);
  };
  notification.onclick = () => {
    input.focusWindow?.();
    if (!input.focusWindow && typeof window !== 'undefined') {
      window.focus();
    }
    try {
      void input.onSelectFriend(input.friend);
    } finally {
      cleanup();
      notification.close();
    }
  };
  notification.onclose = cleanup;
  return notification;
};

export const showWatchlistPresenceSystemNotification = (
  input: WatchlistPresenceSystemNotificationDispatchInput,
) => {
  const key = resolveWatchlistPresenceNotificationKey(input.notification.friend);
  const previousNotification = input.activeNotifications.get(key);
  if (previousNotification) {
    input.activeNotifications.delete(key);
    closeContactSystemNotification(previousNotification);
  }
  try {
    const notification = createWatchlistPresenceSystemNotification({
      friend: input.notification.friend,
      availability: input.notification.availability,
      notificationConstructor: input.notificationConstructor,
      onRelease: (releasedNotification) => {
        if (input.activeNotifications.get(key) === releasedNotification) {
          input.activeNotifications.delete(key);
        }
      },
      onSelectFriend: input.onSelectFriend,
    });
    if (notification) {
      input.activeNotifications.set(key, notification);
    }
  } catch {
    // Browser notification delivery can still fail despite granted permission.
  }
};

const resolveWatchlistPresenceNotificationKey = (friend: Pick<FriendState, 'id'>) =>
  friend.id;

export function useWatchlistPresenceNotifications(input: {
  friends: readonly FriendState[];
  friendPresence: Readonly<Record<string, PresenceStatus>>;
  onSelectFriend: (friend: FriendState) => void | Promise<void>;
  systemEnabled: boolean;
  systemPermission: NotificationPermission | 'unsupported';
}) {
  const previousPresenceRef = useRef<WatchlistPresenceSnapshot | null>(null);
  const activeNotificationsRef = useRef<WatchlistPresenceNotificationHandles>(new Map());

  useEffect(() => () => {
    activeNotificationsRef.current.forEach(closeContactSystemNotification);
    activeNotificationsRef.current.clear();
  }, []);

  useEffect(() => {
    const nextPresence = createWatchlistPresenceSnapshot(
      input.friends,
      input.friendPresence,
    );
    const previousPresence = previousPresenceRef.current;
    previousPresenceRef.current = nextPresence;
    if (
      !previousPresence
      || !input.systemEnabled
      || input.systemPermission !== 'granted'
      || !shouldShowSystemNotification()
    ) {
      return;
    }
    for (const notification of findWatchlistPresenceNotifications({
      previousPresence,
      friends: input.friends,
      friendPresence: input.friendPresence,
    })) {
      showWatchlistPresenceSystemNotification({
        activeNotifications: activeNotificationsRef.current,
        notification,
        onSelectFriend: input.onSelectFriend,
      });
    }
  }, [
    input.friends,
    input.friendPresence,
    input.onSelectFriend,
    input.systemEnabled,
    input.systemPermission,
  ]);
}
