import type { RefObject } from 'react';
import type { ChatMessage, NetworkProfile } from '../../shared/protocol.js';
import type { WorkspaceView } from './workspace.js';

type ChatPaneProps = {
  workspace: WorkspaceView;
  selectedNetwork: NetworkProfile | null;
  selectedMessages: ChatMessage[];
  draft: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onReconnect: (network: NetworkProfile) => void;
  onDisconnect: (networkId: string) => void;
  onCloseConnection: (network: NetworkProfile) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseQuery: (networkId: string, target: string) => void;
};

export function ChatPane(props: ChatPaneProps) {
  const { selectedChannel, selectedNetwork, selectedQuery } = props.workspace;

  return (
    <section className="chat">
      <div className="chat__header">
        <div>
          <h2>{props.workspace.headerTitle}</h2>
          <p className="muted">{props.workspace.headerSubtitle}</p>
        </div>
        <div className="chat__tools">
          {props.workspace.mode === 'server-connected' ||
          props.workspace.mode === 'server-connecting' ||
          props.workspace.mode === 'server-offline' ? (
            <button className="button button--small" onClick={() => selectedNetwork && props.onCloseConnection(selectedNetwork)}>
              Close
            </button>
          ) : null}
          {selectedChannel ? (
            <button className="button button--small" onClick={() => props.onCloseChannel(selectedChannel.networkId, selectedChannel.name)}>
              Close
            </button>
          ) : null}
          {selectedQuery && selectedNetwork ? (
            <button className="button button--small" onClick={() => props.onCloseQuery(selectedNetwork.id, selectedQuery.target)}>
              Close
            </button>
          ) : null}
          {selectedNetwork ? (
            props.workspace.selectedRuntime?.connected ? (
              <button className="button button--small" onClick={() => props.onDisconnect(selectedNetwork.id)}>
                Disconnect
              </button>
            ) : (
              <button
                className="button button--small"
                onClick={() => props.onReconnect(selectedNetwork)}
                disabled={props.workspace.selectedRuntime?.connecting}
              >
                Reconnect
              </button>
            )
          ) : null}
        </div>
      </div>

      <div className="chat__body" ref={props.scrollRef}>
        {props.selectedMessages.length === 0 ? (
          <div className="empty-state">
            <h3>{props.workspace.emptyTitle}</h3>
            <p className="muted">{props.workspace.emptyBody}</p>
          </div>
        ) : null}
        {props.selectedMessages.map((message) => (
          <article key={message.id} className={`message message--${message.kind}`}>
            <div className="message__meta">
              <span className="message__time">{formatTime(message.ts)}</span>
              {message.nick ? <span className="message__nick">{message.nick}</span> : null}
            </div>
            <p className={`message__body ${isActionBody(message) ? 'message__body--action' : ''}`}>{message.body}</p>
          </article>
        ))}
      </div>

      {props.workspace.composerMode !== 'hidden' ? (
        <footer className="composer">
          <input
            value={props.draft}
            onChange={(event) => props.onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                props.onSend();
              }
            }}
            placeholder={props.workspace.composerPlaceholder}
          />
          <button className="button button--primary" onClick={props.onSend}>
            Send
          </button>
        </footer>
      ) : null}
    </section>
  );
}

const formatTime = (value: number) =>
  new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

const isActionBody = (message: ChatMessage) => message.kind === 'line' && message.body.startsWith('* ');
