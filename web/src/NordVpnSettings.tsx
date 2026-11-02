import { ExternalLink } from './ExternalLink.js';
import { nordVpnCountries } from '../../shared/nordvpn-countries.js';
import { useId, useState } from 'react';
import { ExternalLink as ExternalLinkIcon, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { nordVpnLocations } from '../../shared/nordvpn.js';
import type { NetworkForm } from './network-form.js';

export const nordAccountSetupUrl = 'https://my.nordaccount.com/dashboard/nordvpn/manual-configuration/service-credentials/';

export function NordVpnSettings({ form, onChange }: {
  form: NetworkForm;
  onChange: (form: Partial<NetworkForm>) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const saved = form.hasNordVpnCredentials === true;
  const showFields = editing || Boolean(form.nordVpnUsername || form.nordVpnPassword) || (!saved && Boolean(form.nordVpnLocation));
  const incomplete = Boolean(form.nordVpnUsername?.trim()) !== Boolean(form.nordVpnPassword);
  return (
    <section aria-label="NordVPN setup" className="space-y-4 rounded-lg border border-border bg-secondary/30 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-primary" />NordVPN</h3>
          <p className="text-xs text-muted-foreground">{saved ? 'Credentials saved · shared by all connections' : 'Set up once, then choose a location for each connection.'}</p>
        </div>
        <Button asChild variant="outline">
          <ExternalLink href={nordAccountSetupUrl} target="_blank" rel="noopener noreferrer" onClick={() => setEditing(true)}>
            {saved ? 'Open Nord Account' : 'Connect to NordVPN'}<ExternalLinkIcon aria-hidden="true" />
          </ExternalLink>
        </Button>
      </div>
      {!saved ? <p className="text-[13px] text-muted-foreground">Opens Nord Account in your browser. If you’re already signed in there, you may not need to sign in again. Copy your service credentials back here once to finish setup.</p> : null}
      {saved && !showFields ? <Button variant="link" onClick={() => setEditing(true)}>Update credentials</Button> : null}
      {showFields ? <div className="space-y-3 border-t border-border pt-3">
        <ol className="list-inside list-decimal space-y-1 text-[13px] text-muted-foreground">
          <li>In Nord Account, open <strong>Service credentials</strong> and complete email verification if asked.</li>
          <li>Copy the service username and password into these fields.</li>
          <li>Choose a location below and click <strong>Save</strong>.</li>
        </ol>
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor={`${id}-username`} className="space-y-1 text-[13px]">Service username
            <Input id={`${id}-username`} autoComplete="off" spellCheck={false} value={form.nordVpnUsername ?? ''} onChange={event => onChange({ nordVpnUsername: event.target.value })} />
          </label>
          <label htmlFor={`${id}-password`} className="space-y-1 text-[13px]">Service password
            <Input id={`${id}-password`} type="password" autoComplete="new-password" value={form.nordVpnPassword ?? ''} onChange={event => onChange({ nordVpnPassword: event.target.value })} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Use the service credentials, not your usual Nord Account password. Pulsete stores them encrypted on this computer.{saved ? ' Leave both fields blank to keep the saved credentials.' : ''}</p>
        {incomplete ? <p role="alert" className="text-xs text-destructive">Enter both service credentials before saving.</p> : null}
        {saved ? <Button variant="ghost" size="sm" onClick={() => { onChange({ nordVpnUsername: '', nordVpnPassword: '' }); setEditing(false); }}>Keep saved credentials</Button> : null}
      </div> : null}
      <div className="space-y-1">
        <label htmlFor={`${id}-location`} className="text-[13px]">Location for this connection</label>
        <select id={`${id}-location`} className="flex h-8 w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60" value={form.nordVpnLocation ?? ''} onChange={event => onChange({ nordVpnLocation: event.target.value })}>
          <option value="">Direct connection</option>
          <optgroup label="VPN countries · requires Docker">
            {nordVpnCountries.map(country => <option key={country} value={`country:${country}`}>{country}</option>)}
          </optgroup>
          <optgroup label="SOCKS5 proxies · no Docker required">
            {nordVpnLocations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </optgroup>
        </select>
        <p className="text-xs text-muted-foreground">Choose from {nordVpnCountries.length} VPN countries. Each connection runs its own isolated tunnel using Docker. The first connection downloads the VPN helper.</p>
      </div>
      {form.nordVpnLocation ? <p className="text-xs text-muted-foreground">Saving a new location reconnects an active connection. If the proxy fails, this connection stays offline. Enable TLS to encrypt your IRC messages.</p> : null}
    </section>
  );
}
