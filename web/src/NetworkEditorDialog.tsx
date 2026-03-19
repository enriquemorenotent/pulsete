import type { ReactNode } from 'react';
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
    <div className="modal-scrim">
      <section className="dialog dialog--editor">
        <div className="dialog__titlebar">
          <h2>{props.form.name ? `Edit ${props.form.name}` : 'Edit Network'}</h2>
          <span>HexChat-style network editor</span>
        </div>
        <div className="editor__summary">
          <div>
            <p className="eyebrow">Server</p>
            <strong>{serverLabel}</strong>
          </div>
          <p className="muted">Pulsete currently supports one server entry per network.</p>
        </div>
        <div className="tabs">
          <EditorTabButton active={props.activeTab === 'servers'} onClick={() => props.onTabChange('servers')}>Servers</EditorTabButton>
          <EditorTabButton active={props.activeTab === 'autojoin'} onClick={() => props.onTabChange('autojoin')}>Autojoin channels</EditorTabButton>
        </div>
        {props.activeTab === 'servers' ? <ServerTab form={props.form} onChange={props.onChange} /> : null}
        {props.activeTab === 'autojoin' ? <AutojoinTab form={props.form} onChange={props.onChange} /> : null}
        <div className="dialog__footer">
          <button className="button" onClick={props.onClose}>Close</button>
          <button className="button button--primary" onClick={props.onSubmit}>Save</button>
        </div>
      </section>
    </div>
  );
}

function EditorTabButton(props: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`tab ${props.active ? 'tab--active' : ''}`} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

function ServerTab(props: { form: NetworkForm; onChange: (form: Partial<NetworkForm>) => void }) {
  return (
    <div className="dialog__section dialog__section--grow">
      <div className="editor__toggles">
        <label className="checkbox">
          <input type="checkbox" checked={props.form.tls} onChange={(event) => props.onChange({ tls: event.target.checked })} />
          Use SSL for all the servers on this network
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={props.form.favorite} onChange={(event) => props.onChange({ favorite: event.target.checked })} />
          Favorite network
        </label>
      </div>
      <div className="grid grid--editor">
        <EditableField label="Network name:" value={props.form.name} onChange={(value) => props.onChange({ name: value })} />
        <EditableField label="Server:" value={props.form.host} onChange={(value) => props.onChange({ host: value })} />
        <EditableField label="Port:" value={props.form.port} onChange={(value) => props.onChange({ port: value })} />
        <EditableField label="Nick name:" value={props.form.nick} onChange={(value) => props.onChange({ nick: value })} />
        <EditableField label="Second choice:" value={props.form.nick2} onChange={(value) => props.onChange({ nick2: value })} />
        <EditableField label="Third choice:" value={props.form.nick3} onChange={(value) => props.onChange({ nick3: value })} />
        <EditableField label="Real name:" value={props.form.realName} onChange={(value) => props.onChange({ realName: value })} />
        <EditableField label="User name:" value={props.form.username} onChange={(value) => props.onChange({ username: value })} />
        <label>
          Password:
          <input
            type="password"
            value={props.form.password}
            placeholder={props.form.hasSavedPassword && !props.form.clearPassword ? 'Saved on server' : ''}
            onChange={(event) => props.onChange({ clearPassword: false, password: event.target.value })}
          />
        </label>
        <label>
          Character set:
          <input value="UTF-8 (Unicode)" readOnly />
        </label>
      </div>
      {props.form.hasSavedPassword ? (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={props.form.clearPassword}
            onChange={(event) => props.onChange({ clearPassword: event.target.checked, password: '' })}
          />
          Remove saved password on save
        </label>
      ) : null}
    </div>
  );
}

function AutojoinTab(props: { form: NetworkForm; onChange: (form: Partial<NetworkForm>) => void }) {
  return (
    <div className="dialog__section dialog__section--grow">
      <label>
        Channels:
        <input
          value={props.form.autoJoin}
          onChange={(event) => props.onChange({ autoJoin: event.target.value })}
          placeholder="#archlinux, #javascript"
        />
      </label>
      <p className="muted">Comma-separated channels joined after connection.</p>
    </div>
  );
}

function EditableField(props: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label>
      {props.label}
      <input type={props.type} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}
