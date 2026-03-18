import type { NetworkProfile } from '../../shared/protocol.js';
import type { NetworkRuntimeState } from './workspace.js';

type NetworkManagerDialogProps = {
  networks: NetworkProfile[];
  selected: NetworkProfile | null;
  runtime: NetworkRuntimeState | null;
  showFavoritesOnly: boolean;
  onSelect: (networkId: string) => void;
  onToggleFavorites: () => void;
  onClose: () => void;
  onAdd: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onConnect: () => void;
  onFavorite: () => void;
};

export function NetworkManagerDialog(props: NetworkManagerDialogProps) {
  return (
    <div className="modal-scrim">
      <section className="dialog dialog--manager">
        <div className="dialog__titlebar">
          <h2>Network List</h2>
          <span>HexChat-style startup manager</span>
        </div>
        <div className="dialog__section">
          <h3>User Information</h3>
          <div className="grid grid--manager">
            <ReadonlyField label="Nick name:" value={props.selected?.nick ?? ''} />
            <ReadonlyField label="Second choice:" value={props.selected?.altNicks[0] ?? ''} />
            <ReadonlyField label="Third choice:" value={props.selected?.altNicks[1] ?? ''} />
            <ReadonlyField label="User name:" value={props.selected?.username ?? ''} />
          </div>
        </div>
        <div className="dialog__section dialog__section--grow">
          <h3>Networks</h3>
          <div className="manager">
            <div className="manager__list">
              {props.networks.length === 0 ? <p className="muted">No networks configured.</p> : null}
              {props.networks.map((network) => (
                <button
                  key={network.id}
                  className={`manager__row ${props.selected?.id === network.id ? 'manager__row--selected' : ''}`}
                  onClick={() => props.onSelect(network.id)}
                >
                  <span>{network.name}</span>
                  <span className="manager__meta">
                    {network.favorite ? 'favorite' : props.runtime?.connected && props.selected?.id === network.id ? 'online' : ''}
                  </span>
                </button>
              ))}
            </div>
            <div className="manager__actions">
              <button className="button" onClick={props.onAdd}>Add</button>
              <button className="button" onClick={props.onRemove} disabled={!props.selected}>Remove</button>
              <button className="button" onClick={props.onEdit} disabled={!props.selected}>Edit...</button>
              <button className="button" disabled>Sort</button>
              <button className="button" onClick={props.onFavorite} disabled={!props.selected}>Favor</button>
            </div>
          </div>
          <div className="row row--between">
            <label className="checkbox">
              <input type="checkbox" checked={false} readOnly />
              Skip network list on startup
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={props.showFavoritesOnly} onChange={props.onToggleFavorites} />
              Show favorites only
            </label>
          </div>
        </div>
        <div className="dialog__footer">
          <button className="button" onClick={props.onClose}>Close</button>
          <button className="button button--primary" onClick={props.onConnect} disabled={!props.selected}>Connect</button>
        </div>
      </section>
    </div>
  );
}

function ReadonlyField(props: { label: string; value: string }) {
  return (
    <label>
      {props.label}
      <input value={props.value} readOnly />
    </label>
  );
}
