import type { BufferState } from '../../../shared/protocol-chat.js';

export type ContactSystemNotificationHandle = {
  close: () => void;
  onclick: ((event: Event) => void) | null;
  onclose: ((event: Event) => void) | null;
};

type ContactSystemNotificationConstructor = new (
  title: string,
  options?: NotificationOptions,
) => ContactSystemNotificationHandle;

type ContactSystemNotificationInput = {
  buffer: BufferState;
  focusWindow?: () => void;
  networkName: string;
  notificationConstructor?: ContactSystemNotificationConstructor;
  onRelease?: (notification: ContactSystemNotificationHandle) => void;
  onSelectBuffer: (buffer: BufferState) => void;
};

type ContactSystemNotificationDispatchInput = {
  activeNotifications: Set<ContactSystemNotificationHandle>;
  buffer: BufferState;
  networkNamesById: ReadonlyMap<string, string>;
  notificationConstructor?: ContactSystemNotificationConstructor;
  onSelectBuffer: (buffer: BufferState) => void;
};

const clearContactSystemNotificationHandlers = (
  notification: ContactSystemNotificationHandle,
) => {
  notification.onclick = null;
  notification.onclose = null;
};

export const closeContactSystemNotification = (
  notification: ContactSystemNotificationHandle,
) => {
  clearContactSystemNotificationHandlers(notification);
  try {
    notification.close();
  } catch {
    // Handlers are already cleared; a close failure should not retain the callback closure.
  }
};

export const createContactSystemNotification = (
  input: ContactSystemNotificationInput,
) => {
  const NotificationClass =
    input.notificationConstructor ?? resolveNotificationConstructor();
  if (!NotificationClass) {
    return null;
  }
  const notification = new NotificationClass(input.buffer.target, {
    body: `New private message on ${input.networkName}`,
    tag: `pulsete-dm:${input.buffer.id}`,
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
    input.onSelectBuffer(input.buffer);
    cleanup();
    notification.close();
  };
  notification.onclose = cleanup;
  return notification;
};

export const showContactSystemNotification = (
  input: ContactSystemNotificationDispatchInput,
) => {
  try {
    const networkName =
      input.networkNamesById.get(input.buffer.networkId) ?? input.buffer.networkId;
    const notification = createContactSystemNotification({
      buffer: input.buffer,
      networkName,
      notificationConstructor: input.notificationConstructor,
      onRelease: (releasedNotification) => {
        input.activeNotifications.delete(releasedNotification);
      },
      onSelectBuffer: input.onSelectBuffer,
    });
    if (notification) {
      input.activeNotifications.add(notification);
    }
  } catch {
    // Browser notification delivery can still fail despite granted permission.
  }
};

const resolveNotificationConstructor = () => {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return null;
  }
  return window.Notification;
};
