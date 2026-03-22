import type { IrcConnectionState } from './irc-types.js';
import { createIrcConnectionMethodDescriptors } from './irc-connection-compat-methods.js';
import { createIrcConnectionPropertyDescriptors } from './irc-connection-compat-properties.js';

export type { IrcConnectionApi } from './irc-connection-compat-types.js';

export const defineIrcConnectionApi = (
  connection: IrcConnectionState
) => {
  Object.defineProperties(connection, {
    ...createIrcConnectionPropertyDescriptors(connection),
    ...createIrcConnectionMethodDescriptors(connection),
  });
};
