import { api } from './client.js';

export async function submitAuthRequest(mode: 'bootstrap' | 'login' | 'register', username: string, password: string) {
  const payload = { username: username.trim(), password };
  if (mode === 'bootstrap') {
    return api.bootstrap(payload);
  }
  if (mode === 'register') {
    return api.register(payload);
  }
  return api.login(payload);
}
