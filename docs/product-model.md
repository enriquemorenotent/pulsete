# Product Model

Pulsete is a local IRC client with durable workspace state. The app should feel
like a chat workspace that can reconnect to IRC, but the transcript and local
organization belong to the user even when the network is offline.

This document captures product intent. It is not an API reference; it is the
behavior future changes should preserve.

## Core Concepts

**Saved network**

A saved network is the user's configured IRC identity and connection profile. It
can exist outside the active workspace. Deleting it is destructive because it
removes the saved profile and its local conversation data.

**Workspace network**

A workspace network is a saved network currently visible in the app workspace.
`workspaceOpen` means "show this network and its buffers in the workspace", not
"the socket is connected". A workspace network can be offline, connecting, or
connected.

Closing a workspace network should remove it from the active workspace without
deleting logs. Opening it again should restore the saved buffers and history.

**Buffer**

A buffer is the local conversation container for a network target. Buffers are
scoped to one network and one IRC target.

- `server` buffers represent network-level status and commands.
- `channel` buffers represent channel transcripts and channel-specific state.
- `query` buffers represent private-message transcripts.

Only channel and query buffers are searchable as conversation history. Server
buffers are operational context, not normal chat history.

**Message**

A message is a durable transcript row in a buffer. Messages keep the network,
target, body, timestamp, kind, author nick, and speaker attribution needed to
render old history after runtime state is gone.

## Workspace Behavior

The workspace should preserve user context across socket failures and app
restarts.

- A network being offline must not hide its logs.
- Offline channel and query buffers remain selectable in read-only mode.
- Connecting networks remain visible while the socket handshake is in progress.
- Live IRC state can enrich the UI, but stored workspace state is the baseline.

This distinction matters: network visibility is a workspace decision; socket
phase is runtime state.

## History

History is local-first. The app stores transcript rows in SQLite and should be
able to read them without an IRC connection.

History loading should be buffer-scoped:

- opening a buffer loads recent messages for that buffer;
- loading older history paginates before the current oldest visible message;
- missing or unrelated buffers must not fall back to global history;
- equal timestamps preserve insertion order.

History search is also buffer-scoped. It searches message body, nick, and
speaker nick, returns newest hits first, and includes nearby context around each
hit. Empty searches return no results. Over-large limits are clamped by the
protocol defaults.

Search should remain literal enough for IRC text: punctuation, mixed casing, and
Unicode terms should behave like users expect from "find this text in this
buffer". The SQLite FTS index is an implementation detail for speed, not a
license to turn search into a different product.

## Queries And Nick Changes

IRC private-message identity is messy because users can change nicks. Pulsete
tries to preserve transcript continuity without merging unrelated people.

Query buffers are matched by stable peer identity when the server provides one,
then by network and IRC-case-normalized target. Stable peer identity means an
account identity first, then a userhost identity. Nick identity remains a weak
fallback, not proof that two conversations are the same person.

After a query buffer exists, the buffer id is the transcript identity. The
target nick may change during a PM, but live transcript state and stored logs
must continue to follow the same buffer.

Nick-change events can add aliases so opening a query by a recently observed
nick can return the existing transcript. Empty duplicate query buffers can be
merged away during migration or repair. Message-bearing conflicts may be merged
only when the app has strong evidence they represent the same conversation, such
as the same stable account identity or a directly observed nick-change event.

Nick-change continuity is convenience from directly observed IRC events, not
proof of a stable person identity. The app may retarget or merge private-message
buffers when it saw the nick change happen, but ambiguous alias matches should
stay separate.

Identity migrations are additive. Existing messages keep their raw nick, sender
identity fields, target-derived transcript, and buffer membership unless a later
strong identity match merges duplicate query buffers. When buffers merge,
messages and import batches move to the surviving buffer rather than being
deleted.

`selfNickAliases` records the user's historical self nicks for a query buffer.
This supports old imported or migrated history where "me" was known by a
different nick at the time.

## Speaker Attribution

Stored messages keep both the raw IRC nick and normalized speaker attribution.
The raw nick is what the event carried. The speaker fields describe how the app
should present that row:

- `self` for the local user;
- `peer` for the private-message counterpart;
- `other` for ordinary remote speakers;
- `unknown` when the app cannot be confident.

Runtime attribution can use current connection context, but stored attribution
must be good enough for history rendering after reconnects, imports, and app
restarts.

Stored authorship beats live context. If a row already carries attribution, the
app should render from that stored role and confidence instead of guessing from
the current nick or target. Ambiguous rows should remain unknown rather than
confidently wrong.

## Read State And Unread Counts

Unread state belongs to a buffer. Marking a buffer read clears generic and
priority unread counts and records the latest read message cursor. The app uses
that cursor to place unread dividers when history is visible.

Muted nicks still leave transcript rows in history. Muting affects attention
state, notifications, and unread counts; it should not erase what happened.

## Persistence Rules

SQLite is the source of truth for saved networks, workspace state, buffers,
messages, watchlist entries, muted nicks, and migration state. Runtime
connections can be recreated from storage, but storage should not depend on a
live socket to expose history or workspace structure.

Schema migrations must preserve transcripts first. When the local model changes,
prefer adding repair steps and idempotent invariants over assuming every local
database moved through the perfect migration path.

## Design Invariants

- User data should not disappear because IRC is disconnected.
- Closing a workspace network is not deletion.
- Watchlist entries are workspace-level nick watches. Any compatible active
  connection may observe presence for a watched nick.
- Network identity scopes buffers, muted nicks, and private-message matching.
- Server buffers are operational; channel and query buffers are conversational.
- Search, history windows, unread state, and query aliases are buffer-scoped.
- Tests should describe product scenarios, not just storage mechanics.
