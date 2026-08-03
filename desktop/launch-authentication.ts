import type { PulseteServerHandle } from '../server/server-app.js';

export const launchSessionPartition = 'pulsete-launch';

export type LaunchCookieDetails = {
  httpOnly: boolean;
  name: string;
  path: string;
  sameSite: 'strict';
  secure: boolean;
  url: string;
  value: string;
};

type CookieSession = {
  cookies: {
    set(details: LaunchCookieDetails): Promise<void>;
  };
};

export const installLaunchAuthenticationCookie = (
  session: CookieSession,
  server: Pick<PulseteServerHandle, 'getAuthenticationCookie' | 'url'>,
) => {
  const cookie = server.getAuthenticationCookie();
  return session.cookies.set({
    url: server.url,
    name: cookie.name,
    value: cookie.value,
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
  });
};
