import type { IrcConnectionState } from './irc-types.js';
import type { RuntimeIrcSession } from './irc-port-types.js';
import { createLegacyIrcConnectionMethodDescriptors } from './irc-connection-compat-methods.js';
import { createLegacyIrcConnectionPropertyDescriptors } from './irc-connection-compat-properties.js';

export type { LegacyIrcConnectionCompat } from './irc-connection-compat-types.js';

export const defineLegacyIrcConnectionCompat = (
  connection: IrcConnectionState & { runtimeSession: RuntimeIrcSession }
) => {
  Object.defineProperties(connection, {
    ...createLegacyIrcConnectionPropertyDescriptors(connection),
    ...createLegacyIrcConnectionMethodDescriptors(connection),
  });
};
