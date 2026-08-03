import {
  launchBootstrapFragmentKey,
  launchBootstrapPath,
} from '../../shared/launch-authentication.js';

type BrowserBootstrapEnvironment = {
  fetch: typeof fetch;
  history: Pick<History, 'replaceState' | 'state'>;
  location: Pick<Location, 'href'>;
};

export const bootstrapLaunchAuthentication = async (
  environment: BrowserBootstrapEnvironment = createBrowserEnvironment(),
) => {
  const bootstrap = takeBootstrapToken(environment.location.href);
  if (!bootstrap) {
    return false;
  }

  environment.history.replaceState(
    environment.history.state,
    '',
    bootstrap.sanitizedUrl,
  );
  const response = await environment.fetch(launchBootstrapPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: bootstrap.token }),
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(`Browser authentication failed (${response.status})`);
  }
  return true;
};

export const takeBootstrapToken = (href: string) => {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const token = fragment.get(launchBootstrapFragmentKey);
  if (!token) {
    return null;
  }
  fragment.delete(launchBootstrapFragmentKey);
  url.hash = fragment.toString();
  return {
    sanitizedUrl: url.toString(),
    token,
  };
};

const createBrowserEnvironment = (): BrowserBootstrapEnvironment => ({
  fetch: window.fetch.bind(window),
  history: window.history,
  location: window.location,
});
