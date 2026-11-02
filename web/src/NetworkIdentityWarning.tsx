import type { NetworkProfile } from '../../shared/protocol-chat.js';
import type { NetworkForm } from './network-form.js';
import { findIdentityMatches } from './network-identity-warnings.js';

export function NetworkIdentityWarning({ form, networks }: { form: NetworkForm; networks: readonly NetworkProfile[] }) {
  const matches = findIdentityMatches(form, networks);
  if (!matches.length) return null;
  return <div role="status" className="mb-4 space-y-2 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[13px]">
    <p className="font-medium text-amber-300">These accounts may be linked</p>
    <p className="text-muted-foreground">Matching details can connect these nicknames, even with different VPNs:</p>
    <ul className="list-inside list-disc text-muted-foreground">
      {matches.map(match => <li key={match.id}><span className="font-medium text-foreground">{match.name}</span>: {match.fields.join(', ')}</li>)}
    </ul>
    <p className="text-xs text-muted-foreground">Only profiles with the same server address are compared. Different addresses may still belong to the same IRC network. You can still save these settings.</p>
  </div>;
}
