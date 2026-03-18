import type { NetworkProfile } from '../../shared/protocol.js';
import type { ChannelState } from '../../shared/protocol.js';

type NicklistPanelProps = {
  network: NetworkProfile | null;
  channel: ChannelState;
  onSelectNick: (network: NetworkProfile, nick: string) => void;
};

export function NicklistPanel(props: NicklistPanelProps) {
  return (
    <aside className="nicklist panel">
      <div className="panel__header">
        <h2>Nicks</h2>
        <span className="muted">{props.channel.users.length}</span>
      </div>
      <div className="nicklist__items">
        {props.channel.users.length === 0 ? (
          <p className="muted">No nick list yet.</p>
        ) : (
          props.channel.users.map((nick) => (
            <button
              key={nick}
              className="nicklist__item"
              onClick={() => props.network && props.onSelectNick(props.network, nick)}
            >
              {nick}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
