import type { BufferState } from '../../shared/protocol.js';

export type BackgroundDmNotificationHandle = {
  close: () => void;
  onclick: ((event: Event) => void) | null;
  onclose: ((event: Event) => void) | null;
};

type BackgroundDmNotificationConstructor = new (
  title: string,
  options?: NotificationOptions,
) => BackgroundDmNotificationHandle;

type BackgroundDmNotificationInput = {
  buffer: BufferState;
  focusWindow?: () => void;
  networkName: string;
  notificationConstructor?: BackgroundDmNotificationConstructor;
  onRelease?: (notification: BackgroundDmNotificationHandle) => void;
  onSelectBuffer: (buffer: BufferState) => void;
};

const clearBackgroundDmNotificationHandlers = (
  notification: BackgroundDmNotificationHandle,
) => {
  notification.onclick = null;
  notification.onclose = null;
};

export const closeBackgroundDmNotification = (
  notification: BackgroundDmNotificationHandle,
) => {
  clearBackgroundDmNotificationHandlers(notification);
  try {
    notification.close();
  } catch {
    // Handlers are already cleared; a close failure should not retain the callback closure.
  }
};

export const createBackgroundDmNotification = (
  input: BackgroundDmNotificationInput,
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
    clearBackgroundDmNotificationHandlers(notification);
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
  return window.Notification as unknown as BackgroundDmNotificationConstructor;
};
