import type { ChannelState, NetworkProfile, QueryBuffer } from '../../shared/protocol.js';
import type { NetworkRuntimeState, SelectedBuffer } from './workspace.js';
import { canShowInstanceChildren, getConnectionLabel } from './workspace.js';

type ConnectionSidebarProps = {
  networks: NetworkProfile[];
  channels: ChannelState[];
  queries: QueryBuffer[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
  onSelectNetwork: (network: NetworkProfile) => void;
  onSelectChannel: (network: NetworkProfile, channel: ChannelState) => void;
  onSelectQuery: (network: NetworkProfile, target: string) => void;
  onCloseConnection: (network: NetworkProfile) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseQuery: (networkId: string, target: string) => void;
};

export function ConnectionSidebar(props: ConnectionSidebarProps) {
  return (
    <aside className="sidebar panel">
      <div className="panel__header">
        <h2>Connections</h2>
        <span className="muted">{props.networks.length}</span>
      </div>
      <div className="tree">
        {props.networks.length === 0 ? <p className="muted">No open connections. Open Network List to connect.</p> : null}
        {props.networks.map((network) => {
          const runtime = props.networkStates[network.id] ?? null;
          const channels = canShowInstanceChildren(runtime)
            ? props.channels.filter((channel) => channel.networkId === network.id)
            : [];
          const queries = canShowInstanceChildren(runtime)
            ? props.queries.filter((query) => query.networkId === network.id).sort((a, b) => a.target.localeCompare(b.target))
            : [];
          const selectedServer =
            props.selection?.networkId === network.id &&
            props.selection.channelId === null &&
            props.selection.target === 'server';
          const label = getConnectionLabel(props.networks, network);

          return (
            <div key={network.id} className="tree__group">
              <div className={`tree__item ${selectedServer ? 'tree__item--selected' : ''}`}>
                <button
                  className={`tree__row ${selectedServer ? 'tree__row--selected' : ''}`}
                  onClick={() => props.onSelectNetwork(network)}
                >
                  <span className={`dot ${runtime?.connected ? 'dot--good' : 'dot--muted'}`} />
                  <span>{label}</span>
                  {network.favorite ? <span className="badge badge--star">Fav</span> : null}
                </button>
                <button className="tree__close" onClick={() => props.onCloseConnection(network)} aria-label={`Close ${label}`}>
                  ×
                </button>
              </div>
              {canShowInstanceChildren(runtime) ? (
                <div className="tree__channels">
                  {channels.map((channel) => (
                    <SidebarChannelRow
                      key={channel.id}
                      selected={props.selection?.networkId === network.id && props.selection?.channelId === channel.id}
                      channel={channel}
                      onSelect={() => props.onSelectChannel(network, channel)}
                      onClose={() => props.onCloseChannel(network.id, channel.name)}
                    />
                  ))}
                  {queries.map((query) => (
                    <SidebarQueryRow
                      key={query.id}
                      selected={
                        props.selection?.networkId === network.id &&
                        props.selection?.channelId === null &&
                        props.selection?.target === query.target
                      }
                      query={query}
                      onSelect={() => props.onSelectQuery(network, query.target)}
                      onClose={() => props.onCloseQuery(network.id, query.target)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function SidebarChannelRow(props: {
  channel: ChannelState;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className={`tree__item ${props.selected ? 'tree__item--selected' : ''}`}>
      <button className={`tree__row tree__row--channel ${props.selected ? 'tree__row--selected' : ''}`} onClick={props.onSelect}>
        <span className="hash">#</span>
        <span>{props.channel.name}</span>
        {props.channel.unread > 0 ? <span className="badge">{props.channel.unread}</span> : null}
      </button>
      <button className="tree__close" onClick={props.onClose} aria-label={`Close ${props.channel.name}`}>
        ×
      </button>
    </div>
  );
}

function SidebarQueryRow(props: {
  query: QueryBuffer;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className={`tree__item ${props.selected ? 'tree__item--selected' : ''}`}>
      <button className={`tree__row tree__row--query ${props.selected ? 'tree__row--selected' : ''}`} onClick={props.onSelect}>
        <span className="hash">+</span>
        <span>{props.query.target}</span>
      </button>
      <button className="tree__close" onClick={props.onClose} aria-label={`Close ${props.query.target}`}>
        ×
      </button>
    </div>
  );
}
