import { useId } from 'react';
import { Server, UserRound, KeyRound, Shield, Hash } from 'lucide-react';
import type { NetworkProfile } from '../../shared/protocol-chat.js';
import { NetworkIdentityWarning } from './NetworkIdentityWarning.js';
import { NordVpnSettings } from './NordVpnSettings.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { NetworkServerImageField } from './NetworkServerImageField.js';
import type { EditorTab, NetworkForm } from './network-form.js';

export type NetworkEditorDialogProps = {
  networks?: readonly NetworkProfile[];
  externalAvatarsEnabled?: boolean;
  form: NetworkForm;
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (form: Partial<NetworkForm>) => void;
};

export function NetworkEditorDialog(props: NetworkEditorDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="h-[min(90dvh,42rem)] max-h-[90dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),58rem)]"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
            <DialogHeader className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <DialogTitle>{props.form.name ? `Edit ${props.form.name}` : 'Edit Network'}</DialogTitle>
              </div>
            </DialogHeader>
          </div>

          <Tabs
            value={props.activeTab}
            onValueChange={(value) => props.onTabChange(value as EditorTab)}
            orientation="vertical"
            className="flex min-h-0 flex-1"
          >
            <TabsList aria-label="Network settings" className="h-auto w-40 shrink-0 flex-col items-stretch justify-start gap-1 rounded-none border-r border-border bg-black/10 p-3">
              {[['servers', 'Connection', Server], ['identity', 'Identity', UserRound], ['login', 'Login', KeyRound], ['vpn', 'VPN', Shield], ['autojoin', 'Autojoin', Hash]].map(([value, label, Icon]) => {
                const TabIcon = Icon as typeof Server;
                return <TabsTrigger key={value as string} value={value as string} className="justify-start gap-2 rounded-lg px-3 py-2.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary"><TabIcon className="size-4" />{label as string}</TabsTrigger>;
              })}
            </TabsList>

            <ScrollArea className="min-h-0 h-full flex-1">
              <div className="p-6">
                <TabsContent value="servers" className="mt-0">
                  <SectionHeading title="Connection" description="Where to connect and how to save this network." />
                  <ConnectionFields form={props.form} onChange={props.onChange} />
                </TabsContent>
                <TabsContent value="identity" className="mt-0">
                  <SectionHeading title="Identity" description="How you appear on this IRC network." />
                  <NetworkIdentityWarning form={props.form} networks={props.networks ?? []} />
                  <IdentityFields externalAvatarsEnabled={props.externalAvatarsEnabled} form={props.form} onChange={props.onChange} />
                </TabsContent>
                <TabsContent value="login" className="mt-0">
                  <SectionHeading title="Login" description="Identify your registered IRC account after connecting." />
                  <LoginFields form={props.form} onChange={props.onChange} />
                </TabsContent>
                <TabsContent value="vpn" className="mt-0">
                  <SectionHeading title="VPN" description="Choose the route used by this connection." />
                  <NordVpnSettings form={props.form} onChange={props.onChange} />
                </TabsContent>
                <TabsContent value="autojoin" className="mt-0">
                  <SectionHeading title="Autojoin" description="Choose which channels to open when you connect." />
                  <AutojoinTab form={props.form} onChange={props.onChange} />
                </TabsContent>
              </div>

            </ScrollArea>
          </Tabs>

          <div className="shrink-0 border-t border-border px-4 py-3">
            <DialogFooter>
              <Button variant="outline" onClick={props.onClose}>
                Close
              </Button>
              <Button onClick={props.onSubmit}>
                Save
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type FieldProps = { form: NetworkForm; onChange: (form: Partial<NetworkForm>) => void };

function SectionHeading(props: { title: string; description: string }) {
  return <div className="mb-5 space-y-1"><h3 className="text-base font-semibold">{props.title}</h3><p className="text-[13px] text-muted-foreground">{props.description}</p></div>;
}

function ConnectionFields(props: FieldProps) {
  return <div className="space-y-5">
    <div className="space-y-1"><TextField label="Network name" value={props.form.name} onChange={(name) => props.onChange({ name })} />
    <p className="text-xs text-muted-foreground">Only visible in Pulsete.</p></div>
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
      <TextField label="Server" value={props.form.host} onChange={(host) => props.onChange({ host })} />
      <TextField label="Port" value={props.form.port} onChange={(port) => props.onChange({ port })} />
    </div>
    <ToggleField label="Use TLS" checked={props.form.tls} onCheckedChange={(tls) => props.onChange({ tls })} />
    <ToggleField label="Favorite" checked={props.form.favorite} onCheckedChange={(favorite) => props.onChange({ favorite })} />
  </div>;
}

function IdentityFields(props: FieldProps & { externalAvatarsEnabled?: boolean }) {
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-4">
        <TextField label="Nick name" value={props.form.nick} onChange={(value) => props.onChange({ nick: value })} />
        <TextField
          label="Username / ident"
          value={props.form.username}
          placeholder={props.form.nick || 'Uses Nick name when blank'}
          onChange={(value) => props.onChange({ username: value })}
        />

        <TextField label="Second choice" value={props.form.nick2} onChange={(value) => props.onChange({ nick2: value })} />
        <TextField label="Third choice" value={props.form.nick3} onChange={(value) => props.onChange({ nick3: value })} />
        <TextField label="Real name" placeholder="IRC user (when blank)" value={props.form.realName} onChange={(value) => props.onChange({ realName: value })} />
        <NetworkServerImageField
          networkId={props.form.id}
          blockRemote={Boolean(props.form.nordVpnLocation) && !props.form.id}
          externalAvatarsEnabled={props.externalAvatarsEnabled}
          username={props.form.username}
          value={props.form.iconUrl}
          onChange={(value) => props.onChange({ iconUrl: value })}
        />

    </div><p className="text-xs text-muted-foreground">Real name is sent to the IRC network. Leave it blank to send “IRC user”. Your saved connection name stays private.</p>
  </div>;
}

function LoginFields(props: FieldProps) {
  const showPassword = props.form.authMethod !== 'none';
  const showAuthTarget = props.form.authMethod === 'nickserv';
  const showAuthAccount = props.form.authMethod === 'nickserv' || props.form.authMethod === 'sasl-plain';
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Authentication"
          value={props.form.authMethod}
          options={[
            { value: 'none', label: 'None' },
            { value: 'server-pass', label: 'Server PASS' },
            { value: 'sasl-plain', label: 'SASL (PLAIN)' },
            { value: 'nickserv', label: 'NickServ message' },
          ]}
          onChange={(value) => props.onChange({ authMethod: value as NetworkForm['authMethod'] })}
        />
        {showAuthTarget ? (
          <TextField
            label="Service target"
            value={props.form.authTarget}
            onChange={(value) => props.onChange({ authTarget: value })}
          />
        ) : null}
        {showAuthAccount ? (
          <TextField
            label={props.form.authMethod === 'sasl-plain' ? 'SASL account' : 'NickServ account'}
            value={props.form.authAccount}
            placeholder={props.form.nick || 'Uses Nick name when blank'}
            onChange={(value) => props.onChange({ authAccount: value })}
          />
        ) : null}
        {showPassword ? <PasswordField form={props.form} onChange={props.onChange} /> : null}
    </div>
    {!showPassword ? <p className="text-[13px] text-muted-foreground">No automatic identify command will be sent after connect.</p> : null}
      {props.form.hasSavedPassword ? (
        <ToggleField
          label="Remove saved password on save"
          checked={props.form.clearPassword}
          onCheckedChange={(checked) => props.onChange({ clearPassword: checked, password: '' })}
        />
      ) : null}
  </div>;
}

function AutojoinTab(props: { form: NetworkForm; onChange: (form: Partial<NetworkForm>) => void }) {
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={id}>Channels</Label>
        <Input
          id={id}
          value={props.form.autoJoin}
          onChange={(event) => props.onChange({ autoJoin: event.target.value })}
          placeholder="#archlinux, #javascript"
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Comma-separated channels joined after connection.
      </div>
    </div>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{props.label}</Label>
      <select
        id={id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="flex h-8 w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[13px] text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextField(props: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{props.label}</Label>
      <Input id={id} value={props.value} placeholder={props.placeholder} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}

function ToggleField(props: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-[13px] text-foreground">
      <Checkbox checked={props.checked} onCheckedChange={(checked) => props.onCheckedChange(checked === true)} />
      <span>{props.label}</span>
    </label>
  );
}

function PasswordField(props: { form: NetworkForm; onChange: (form: Partial<NetworkForm>) => void }) {
  const id = useId();
  const label = props.form.authMethod === 'server-pass'
    ? 'Server password'
    : props.form.authMethod === 'sasl-plain'
      ? 'SASL password'
      : 'NickServ password';
  const placeholder = props.form.hasSavedPassword && !props.form.clearPassword
    ? 'Saved on server'
    : '';

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        value={props.form.password}
        placeholder={placeholder}
        onChange={(event) => props.onChange({ clearPassword: false, password: event.target.value })}
      />
    </div>
  );
}
