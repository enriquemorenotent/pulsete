import type { BufferState, ChatMessage } from '../../../shared/protocol-chat.js';
import { getVisibleIrcText } from '../irc-format.js';
import type { NotificationOwner } from './notification-owner.js';

export type ContactSystemNotificationHandle = {
  close: () => void;
  onclick: ((event: Event) => void) | null;
  onclose: ((event: Event) => void) | null;
};

export type ContactSystemNotificationConstructor = new (
  title: string,
  options?: NotificationOptions,
) => ContactSystemNotificationHandle;

type ContactSystemNotificationInput = {
  avatarIconUrl?: string | null;
  buffer: BufferState;
  focusWindow?: () => void;
  iconsEnabled?: boolean;
  latestMessage?: Pick<ChatMessage, 'body'> | null;
  networkName: string;
  notificationConstructor?: ContactSystemNotificationConstructor;
  onRelease?: (notification: ContactSystemNotificationHandle) => void;
  onSelectBuffer: (buffer: BufferState) => void;
};

type ContactSystemNotificationDispatchInput = {
  avatarIconUrl?: string | null;
  buffer: BufferState;
  iconsEnabled?: boolean;
  latestMessage?: Pick<ChatMessage, 'body'> | null;
  networkNamesById: ReadonlyMap<string, string>;
  notificationOwner: NotificationOwner<string, ContactSystemNotificationHandle>;
  notificationConstructor?: ContactSystemNotificationConstructor;
  onSelectBuffer: (buffer: BufferState) => void;
};

export const clearContactSystemNotificationHandlers = (
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
  const icon = input.iconsEnabled === false
    ? null
    : input.avatarIconUrl ?? null;
  const notification = new NotificationClass(input.buffer.target, {
    body: resolveContactSystemNotificationBody(
      input.buffer,
      input.networkName,
      input.latestMessage,
    ),
    ...(icon ? { icon } : {}),
    tag: resolveContactSystemNotificationTag(input.buffer),
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
      input.onSelectBuffer(input.buffer);
    } finally {
      cleanup();
      notification.close();
    }
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
      avatarIconUrl: input.avatarIconUrl,
      buffer: input.buffer,
      iconsEnabled: input.iconsEnabled,
      latestMessage: input.latestMessage,
      networkName,
      notificationConstructor: input.notificationConstructor,
      onRelease: (releasedNotification) => {
        input.notificationOwner.release(input.buffer.id, releasedNotification);
      },
      onSelectBuffer: input.onSelectBuffer,
    });
    if (notification) {
      input.notificationOwner.track(input.buffer.id, notification);
    }
  } catch {
    // Browser notification delivery can still fail despite granted permission.
  }
};

export const resolveNotificationConstructor = () => {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return null;
  }
  return window.Notification;
};

const resolveContactSystemNotificationBody = (
  buffer: BufferState,
  networkName: string,
  latestMessage?: Pick<ChatMessage, 'body'> | null,
) => {
  const messageBody = buffer.kind === 'query' && latestMessage
    ? getVisibleIrcText(latestMessage.body).trim()
    : '';
  if (messageBody) {
    return messageBody;
  }
  return buffer.kind === 'channel'
    ? `New message in ${buffer.target} on ${networkName}`
    : `New private message on ${networkName}`;
};

const resolveContactSystemNotificationTag = (buffer: BufferState) =>
  buffer.kind === 'channel'
    ? `pulsete-channel:${buffer.id}`
    : `pulsete-dm:${buffer.id}`;
