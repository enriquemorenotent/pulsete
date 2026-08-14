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
        className="h-[min(90dvh,40rem)] max-h-[90dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),56rem)]"
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
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b border-border px-4 py-2">
              <TabsList>
                <TabsTrigger value="servers">Servers</TabsTrigger>
                <TabsTrigger value="autojoin">Autojoin</TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="min-h-0 h-full flex-1">
              <div className="px-4 py-3">
                <TabsContent value="servers" className="mt-0">
                  <ServerTab
                    externalAvatarsEnabled={props.externalAvatarsEnabled}
                    form={props.form}
                    onChange={props.onChange}
                  />
                </TabsContent>
                <TabsContent value="autojoin" className="mt-0">
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
              <Button variant="secondary" onClick={props.onSubmit}>
                Save
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ServerTab(props: {
  externalAvatarsEnabled?: boolean;
  form: NetworkForm;
  onChange: (form: Partial<NetworkForm>) => void;
}) {
  const showPassword = props.form.authMethod !== 'none';
  const showAuthTarget = props.form.authMethod === 'nickserv';
  const showAuthAccount = props.form.authMethod === 'nickserv' || props.form.authMethod === 'sasl-plain';

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-2">
        <ToggleField label="Use TLS" checked={props.form.tls} onCheckedChange={(checked) => props.onChange({ tls: checked })} />
        <ToggleField label="Favorite" checked={props.form.favorite} onCheckedChange={(checked) => props.onChange({ favorite: checked })} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Network name" value={props.form.name} onChange={(value) => props.onChange({ name: value })} />
        <TextField label="Server" value={props.form.host} onChange={(value) => props.onChange({ host: value })} />
        <TextField label="Port" value={props.form.port} onChange={(value) => props.onChange({ port: value })} />
        <TextField label="Nick name" value={props.form.nick} onChange={(value) => props.onChange({ nick: value })} />
        <TextField
          label="Username / ident"
          value={props.form.username}
          placeholder={props.form.nick || 'Uses Nick name when blank'}
          onChange={(value) => props.onChange({ username: value })}
        />
        <NetworkServerImageField
          externalAvatarsEnabled={props.externalAvatarsEnabled}
          username={props.form.username}
          value={props.form.iconUrl}
          onChange={(value) => props.onChange({ iconUrl: value })}
        />
        <TextField label="Second choice" value={props.form.nick2} onChange={(value) => props.onChange({ nick2: value })} />
        <TextField label="Third choice" value={props.form.nick3} onChange={(value) => props.onChange({ nick3: value })} />
        <TextField label="Real name" value={props.form.realName} onChange={(value) => props.onChange({ realName: value })} />
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

      {!showPassword ? (
        <div className="border border-border bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
          No automatic identify command will be sent after connect.
        </div>
      ) : null}

      {props.form.hasSavedPassword ? (
        <ToggleField
          label="Remove saved password on save"
          checked={props.form.clearPassword}
          onCheckedChange={(checked) => props.onChange({ clearPassword: checked, password: '' })}
        />
      ) : null}
    </div>
  );
}

function AutojoinTab(props: { form: NetworkForm; onChange: (form: Partial<NetworkForm>) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Channels</Label>
        <Input
          value={props.form.autoJoin}
          onChange={(event) => props.onChange({ autoJoin: event.target.value })}
          placeholder="#archlinux, #javascript"
        />
      </div>
      <div className="border border-border bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
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
  return (
    <div className="space-y-1">
      <Label>{props.label}</Label>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="flex h-8 w-full rounded-sm border border-input bg-input px-2.5 py-1.5 text-[13px] text-foreground outline-none transition-colors focus-visible:border-ring"
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
  return (
    <div className="space-y-1">
      <Label>{props.label}</Label>
      <Input value={props.value} placeholder={props.placeholder} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}

function ToggleField(props: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 border border-border bg-secondary px-3 py-2 text-[13px] text-foreground">
      <Checkbox checked={props.checked} onCheckedChange={(checked) => props.onCheckedChange(checked === true)} />
      <span>{props.label}</span>
    </label>
  );
}

function PasswordField(props: { form: NetworkForm; onChange: (form: Partial<NetworkForm>) => void }) {
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
      <Label>{label}</Label>
      <Input
        type="password"
        value={props.form.password}
        placeholder={placeholder}
        onChange={(event) => props.onChange({ clearPassword: false, password: event.target.value })}
      />
    </div>
  );
}
