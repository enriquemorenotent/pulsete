import type { NetworkAuthMethod, NetworkProfile } from '../../shared/protocol-chat.js';
import { defaultIrcRealName, reportedRealName, toRegistrationIdent } from '../../shared/irc-identity.js';
import { resolveNetworkAuthAccount, resolveNetworkAuthMethod } from '../../shared/network-model.js';

type IdentityProfile = {
  id?: string; host: string; nick: string; username?: string; realName: string;
  authMethod?: NetworkAuthMethod; authAccount?: string;
};
export type IdentityMatch = { id: string; name: string; fields: string[] };
const normalizeHost = (host: string) => host.trim().toLowerCase().replace(/\.+$/, '');
const normalize = (value: string) => value.trim().toLowerCase();
const ident = (profile: IdentityProfile) => normalize(toRegistrationIdent(profile.username || profile.nick));
const account = (profile: IdentityProfile) => {
  const method = resolveNetworkAuthMethod(profile);
  return method === 'sasl-plain' || method === 'nickserv' ? normalize(resolveNetworkAuthAccount(profile)) : '';
};

export function findIdentityMatches(profile: IdentityProfile, networks: readonly NetworkProfile[]): IdentityMatch[] {
  const host = normalizeHost(profile.host);
  if (!host) return [];
  return networks.flatMap(other => {
    if (other.id === profile.id || normalizeHost(other.host) !== host) return [];
    const fields: string[] = [];
    if ((profile.username || profile.nick).trim() && ident(profile) === ident(other)) fields.push('username / ident');
    const realName = normalize(reportedRealName(profile));
    if (realName !== normalize(defaultIrcRealName) && realName === normalize(reportedRealName(other))) fields.push('real name');
    if (account(profile) && account(profile) === account(other)) fields.push('IRC login account');
    return fields.length ? [{ id: other.id, name: other.name, fields }] : [];
  });
}
