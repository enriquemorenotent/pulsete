import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import type { EditorTab, NetworkForm } from './network-form.js';

type NetworkEditorDialogProps = {
  form: NetworkForm;
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (form: Partial<NetworkForm>) => void;
};

export function NetworkEditorDialog(props: NetworkEditorDialogProps) {
  const serverLabel =
    props.form.host.trim().length > 0 ? `${props.form.host.trim()}/${props.form.port || '6667'}` : 'irc.example.net/6697';

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="h-[min(90dvh,40rem)] max-h-[90dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),56rem)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
            <DialogHeader className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <DialogTitle>{props.form.name ? `Edit ${props.form.name}` : 'Edit Network'}</DialogTitle>
                  <DialogDescription>Network template settings.</DialogDescription>
                </div>
                <Badge variant="outline">Editor</Badge>
              </div>
            </DialogHeader>
            <div className="flex items-center justify-between gap-3 border border-border bg-secondary px-3 py-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Server target</p>
                <p className="text-sm font-semibold text-foreground">{serverLabel}</p>
              </div>
              <Badge variant="outline">{props.form.tls ? 'SSL/TLS' : 'TCP'}</Badge>
            </div>
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
                  <ServerTab form={props.form} onChange={props.onChange} />
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

function ServerTab(props: { form: NetworkForm; onChange: (form: Partial<NetworkForm>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-2">
        <ToggleField
          label="Use SSL for this network"
          checked={props.form.tls}
          onCheckedChange={(checked) => props.onChange({ tls: checked })}
        />
        <ToggleField
          label="Favorite network"
          checked={props.form.favorite}
          onCheckedChange={(checked) => props.onChange({ favorite: checked })}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Network name" value={props.form.name} onChange={(value) => props.onChange({ name: value })} />
        <TextField label="Server" value={props.form.host} onChange={(value) => props.onChange({ host: value })} />
        <TextField label="Port" value={props.form.port} onChange={(value) => props.onChange({ port: value })} />
        <TextField label="Nick name" value={props.form.nick} onChange={(value) => props.onChange({ nick: value })} />
        <TextField label="Second choice" value={props.form.nick2} onChange={(value) => props.onChange({ nick2: value })} />
        <TextField label="Third choice" value={props.form.nick3} onChange={(value) => props.onChange({ nick3: value })} />
        <TextField label="Real name" value={props.form.realName} onChange={(value) => props.onChange({ realName: value })} />
        <TextField label="User name" value={props.form.username} onChange={(value) => props.onChange({ username: value })} />
        <PasswordField form={props.form} onChange={props.onChange} />
        <StaticField label="Character set" value="UTF-8 (Unicode)" />
      </div>

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

function TextField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{props.label}</Label>
      <Input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}

function StaticField(props: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label>{props.label}</Label>
      <Input value={props.value} readOnly className="bg-background text-muted-foreground" />
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
  return (
    <div className="space-y-1">
      <Label>Password</Label>
      <Input
        type="password"
        value={props.form.password}
        placeholder={props.form.hasSavedPassword && !props.form.clearPassword ? 'Saved on server' : ''}
        onChange={(event) => props.onChange({ clearPassword: false, password: event.target.value })}
      />
    </div>
  );
}
