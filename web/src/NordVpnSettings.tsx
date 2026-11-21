import { ExternalLink } from './ExternalLink.js';
import { nordVpnCountries, nordVpnCountry } from '../../shared/nordvpn-countries.js';
import { useId, useState } from 'react';
import { ExternalLink as ExternalLinkIcon, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { nordVpnLocations } from '../../shared/nordvpn.js';
import type { NetworkForm } from './network-form.js';

export const nordAccountSetupUrl = 'https://my.nordaccount.com/dashboard/nordvpn/manual-configuration/service-credentials/';
const directConnection = 'direct';

export function NordVpnSettings({ form, onChange }: {
  form: NetworkForm;
  onChange: (form: Partial<NetworkForm>) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const saved = form.hasNordVpnCredentials === true;
  const country = nordVpnCountry(form.nordVpnLocation ?? '');
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
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-location`}>Location for this connection</Label>
        <Select value={form.nordVpnLocation || directConnection} onValueChange={value => onChange({ nordVpnLocation: value === directConnection ? '' : value })}>
          <SelectTrigger id={`${id}-location`} aria-describedby={country ? `${id}-docker` : undefined} size="sm" className="w-full max-w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="max-h-[min(20rem,var(--radix-select-content-available-height))]">
            <SelectGroup>
              <SelectItem value={directConnection}>Direct connection</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>VPN countries · requires Docker</SelectLabel>
              {nordVpnCountries.map(country => <SelectItem key={country} value={`country:${country}`}>{country}</SelectItem>)}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>SOCKS5 proxies · no Docker required</SelectLabel>
              {nordVpnLocations.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        {country ? <p id={`${id}-docker`} className="text-xs text-muted-foreground">This route requires Docker. Pulsete downloads the VPN helper the first time you connect through a VPN country.</p> : null}
      </div>
      {form.nordVpnLocation ? <p className="text-xs text-muted-foreground">Saving a new location reconnects an active connection. If the proxy fails, this connection stays offline. Enable TLS to encrypt your IRC messages.</p> : null}
    </section>
  );
}
