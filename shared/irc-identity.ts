export const defaultIrcRealName = 'IRC user';

export const reportedRealName = (profile: { realName?: string | null }) =>
  profile.realName?.trim() ? profile.realName : defaultIrcRealName;

export const toRegistrationIdent = (nick: string) => {
  const ident = nick.trim().replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 32);
  if (!ident) return 'pulsete';
  return /^[A-Za-z0-9]/.test(ident) ? ident : `u${ident}`.slice(0, 32);
};
