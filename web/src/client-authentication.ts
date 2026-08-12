const bootstrapParameter = 'pulsete-bootstrap';
const bootstrapHeader = 'x-pulsete-bootstrap';
const bootstrapPath = '/api/client-auth';

type BootstrapLocation = Pick<Location, 'hash' | 'pathname' | 'search'>;
type BootstrapHistory = Pick<History, 'replaceState'>;

export const bootstrapClientAuthentication = async (
  location: BootstrapLocation = window.location,
  history: BootstrapHistory = window.history,
  request: typeof fetch = fetch,
) => {
  const credential = readBootstrapCredential(location.hash);
  if (credential) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  const response = await request(bootstrapPath, credential ? {
    method: 'POST',
    headers: { [bootstrapHeader]: credential },
  } : {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error('Pulsete client authentication failed');
  }
};

const readBootstrapCredential = (hash: string) => {
  const parameters = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  return parameters.get(bootstrapParameter)?.trim() || null;
};
