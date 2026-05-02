import type { BufferState } from '../../../shared/protocol.js';

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

const resolveNotificationConstructor = () => {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return null;
  }
  return window.Notification as unknown as ContactSystemNotificationConstructor;
};
