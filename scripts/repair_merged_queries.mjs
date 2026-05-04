#!/usr/bin/env node
import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const aliasActivationWindowMs = 60_000;
const artifactPreWindowMs = 30_000;
const conversationContextWindowMs = 10 * 60_000;
const replyContextWindowMs = 120_000;

const ircCaseFoldMap = {
  '[': '{',
  ']': '}',
  '\\': '|',
  '^': '~',
};

const normalizeIrcIdentifier = (value) =>
  value.replace(/[A-Z[\]\\^]/g, (character) => ircCaseFoldMap[character] ?? character.toLowerCase());

const normalizeIdentityValue = (kind, value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === '*') {
    return null;
  }
  if (kind === 'account' || kind === 'nick') {
    return normalizeIrcIdentifier(trimmed);
  }
  if (kind !== 'userhost') {
    return null;
  }
  const separator = trimmed.indexOf('@');
  if (separator === -1) {
    return trimmed.toLowerCase();
  }
  return `${normalizeIrcIdentifier(trimmed.slice(0, separator))}@${trimmed.slice(separator + 1).toLowerCase()}`;
};

const identityKey = (kind, value) => {
  const normalized = normalizeIdentityValue(kind, value);
  return normalized && (kind === 'account' || kind === 'userhost') ? `${kind}:${normalized}` : null;
};

const parseArgs = (args) => {
  const options = {
    apply: false,
    databasePath: 'data/pulsete.sqlite',
    bufferId: null,
    primaryTarget: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--dry-run') {
      options.apply = false;
    } else if (arg === '--database') {
      options.databasePath = args[++index] ?? '';
    } else if (arg === '--buffer') {
      options.bufferId = args[++index] ?? '';
    } else if (arg === '--primary-target') {
      options.primaryTarget = args[++index] ?? '';
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.bufferId) {
    throw new Error('Missing required --buffer <id>');
  }
  return options;
};

const printUsage = () => {
  console.log([
    'Usage: node scripts/repair_merged_queries.mjs --buffer <id> [--database data/pulsete.sqlite] [--primary-target Lez-Ali] [--apply]',
    '',
    'Default mode is a dry-run. --apply creates a timestamped backup before changing the database.',
  ].join('\n'));
};

export const repairMergedQueryBuffer = (options) => {
  const databasePath = resolve(options.databasePath ?? 'data/pulsete.sqlite');
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  try {
    const plan = buildRepairPlan(db, {
      bufferId: options.bufferId,
      primaryTarget: options.primaryTarget ?? null,
    });
    const summary = summarizePlan(plan);
    if (!options.apply) {
      return { mode: 'dry-run', databasePath, ...summary };
    }
    const backupDirectory = createBackup(databasePath);
    const apply = db.transaction(() => {
      applyRepairPlan(db, plan);
    });
    apply();
    const result = { mode: 'apply', databasePath, backupDirectory, ...summary };
    writeFileSync(join(backupDirectory, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    db.close();
  }
};

const buildRepairPlan = (db, input) => {
  const source = db.prepare('SELECT * FROM buffers WHERE id = ?').get(input.bufferId);
  if (!source) {
    throw new Error(`Buffer not found: ${input.bufferId}`);
  }
  if (source.kind !== 'query') {
    throw new Error(`Buffer is not a private-message query: ${input.bufferId}`);
  }

  const aliases = db.prepare(`
    SELECT nick, nickKey, firstSeenAt, lastSeenAt, source
    FROM query_nick_aliases
    WHERE bufferId = ?
    ORDER BY firstSeenAt ASC, nick ASC
  `).all(source.id);
  const network = db.prepare('SELECT id, nick, authAccount FROM networks WHERE id = ?').get(source.networkId);
  const selfKeys = listSelfIdentityKeys(db, network);
  const targetMap = buildTargetMap(source, aliases, input.primaryTarget);
  const primaryTarget = resolvePrimaryTarget(source, targetMap, input.primaryTarget);
  const identityTargetByKey = buildIdentityTargetMap(db, source, targetMap, selfKeys);
  const messages = db.prepare(`
    SELECT rowid AS rowId, id, nick, senderIdentityKind, senderIdentityValue, body, kind, self, ts
    FROM messages
    WHERE bufferId = ?
    ORDER BY ts ASC, rowid ASC
  `).all(source.id);

  const assignments = new Map();
  const artifacts = [];
  for (const message of messages) {
    if (message.self) {
      continue;
    }
    const system = message.kind === 'system' ? classifySystemMessage(message, targetMap) : null;
    if (system?.artifact) {
      artifacts.push({
        id: message.id,
        body: message.body,
        reason: system.reason,
        ts: message.ts,
        from: system.from,
        to: system.to,
      });
      continue;
    }
    const target = system?.target
      ?? targetFromNick(targetMap, message.nick)
      ?? targetFromIdentity(identityTargetByKey, message.senderIdentityKind, message.senderIdentityValue);
    if (target) {
      assignments.set(message.id, { target, reason: system?.reason ?? 'peer' });
    }
  }

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (assignments.has(message.id) || artifacts.some((artifact) => artifact.id === message.id)) {
      continue;
    }
    const target = assignContextTarget({
      message,
      messages,
      index,
      assignments,
      aliases,
      artifacts,
      targetMap,
      primaryTarget,
    });
    assignments.set(message.id, target);
  }

  const targetBuffers = planTargetBuffers(db, source, targetMap, primaryTarget);
  return {
    source,
    aliases,
    messages,
    primaryTarget,
    targets: [...targetMap.values()],
    targetBuffers,
    assignments,
    artifacts,
    selfKeys,
  };
};

const listSelfIdentityKeys = (db, network) => {
  const nicks = new Set();
  if (network?.nick) {
    nicks.add(network.nick);
  }
  if (network?.authAccount) {
    nicks.add(network.authAccount);
  }
  for (const row of db.prepare('SELECT nick FROM network_alt_nicks WHERE networkId = ?').all(network?.id)) {
    nicks.add(row.nick);
  }
  for (const row of db.prepare('SELECT nick FROM network_historical_self_nicks WHERE networkId = ?').all(network?.id)) {
    nicks.add(row.nick);
  }
  return new Set([...nicks].flatMap((nick) => [
    `account:${normalizeIrcIdentifier(nick)}`,
    `nick:${normalizeIrcIdentifier(nick)}`,
  ]));
};

const buildTargetMap = (source, aliases, primaryTarget) => {
  const targetMap = new Map();
  const add = (target) => {
    const trimmed = String(target ?? '').trim();
    if (!trimmed) {
      return;
    }
    const key = normalizeIrcIdentifier(trimmed);
    if (!targetMap.has(key)) {
      targetMap.set(key, trimmed);
    }
  };
  add(primaryTarget);
  for (const alias of aliases) {
    add(alias.nick);
  }
  add(source.target);
  return targetMap;
};

const resolvePrimaryTarget = (source, targetMap, primaryTarget) => {
  const requested = String(primaryTarget ?? '').trim();
  if (requested) {
    const key = normalizeIrcIdentifier(requested);
    if (!targetMap.has(key)) {
      targetMap.set(key, requested);
    }
    return targetMap.get(key);
  }
  return targetMap.get(normalizeIrcIdentifier(source.target)) ?? source.target;
};

const buildIdentityTargetMap = (db, source, targetMap, selfKeys) => {
  const identityTargetByKey = new Map();
  const rows = db.prepare(`
    SELECT identityKind, identityValue, nick
    FROM query_peer_identities
    WHERE bufferId = ?
    ORDER BY lastSeenAt DESC
  `).all(source.id);
  for (const row of rows) {
    const key = identityKey(row.identityKind, row.identityValue);
    if (!key || selfKeys.has(key)) {
      continue;
    }
    const target = targetFromNick(targetMap, row.nick) ?? targetFromIdentityValue(targetMap, row.identityValue);
    if (target && !identityTargetByKey.has(key)) {
      identityTargetByKey.set(key, target);
    }
  }
  return identityTargetByKey;
};

const classifySystemMessage = (message, targetMap) => {
  const body = stripIrcFormatting(message.body).trim();
  const nickChange = body.match(/^(\S+)\s+is now known as\s+(\S+)$/i);
  if (nickChange) {
    const from = targetFromNick(targetMap, nickChange[1]);
    const to = targetFromNick(targetMap, nickChange[2]);
    if (from && to && from !== to) {
      return { artifact: true, reason: 'split-alias nick-change artifact', from, to };
    }
    return { target: to ?? from ?? null, reason: 'nick-change' };
  }
  const endWhois = body.match(/End of WHOIS for\s+(\S+)/i);
  if (endWhois) {
    return { target: targetFromNick(targetMap, endWhois[1]), reason: 'whois' };
  }
  const action = body.match(/^\*\s+(\S+)\b/);
  if (action) {
    return { target: targetFromNick(targetMap, action[1]), reason: 'whois' };
  }
  return null;
};

const assignContextTarget = ({ message, messages, index, assignments, aliases, artifacts, targetMap, primaryTarget }) => {
  if (message.self && message.body.trim().startsWith('!')) {
    const dataTarget = targetMap.get('data');
    if (dataTarget) {
      return { target: dataTarget, reason: 'self-command' };
    }
  }
  if (message.self) {
    const artifactTarget = findUpcomingArtifactSource(message.ts, messages, index, assignments, artifacts);
    if (artifactTarget) {
      return { target: artifactTarget, reason: 'pre-artifact-target' };
    }
    const activatedTarget = findActivatedTarget(message.ts, aliases, targetMap);
    if (activatedTarget) {
      return { target: activatedTarget, reason: 'target-activation' };
    }
  }
  const previous = findAssignedNeighbor(messages, assignments, index, -1);
  const next = findAssignedNeighbor(messages, assignments, index, 1);
  if (previous && next && previous.assignment.target === next.assignment.target) {
    return { target: previous.assignment.target, reason: 'conversation-context' };
  }
  if (next && next.delta <= replyContextWindowMs) {
    return { target: next.assignment.target, reason: 'conversation-context' };
  }
  if (previous && previous.delta <= replyContextWindowMs) {
    return { target: previous.assignment.target, reason: 'conversation-context' };
  }
  if (previous && next) {
    return previous.delta <= next.delta
      ? { target: previous.assignment.target, reason: 'conversation-context' }
      : { target: next.assignment.target, reason: 'conversation-context' };
  }
  if (previous) {
    return { target: previous.assignment.target, reason: 'conversation-context' };
  }
  if (next) {
    return { target: next.assignment.target, reason: 'conversation-context' };
  }
  return { target: primaryTarget, reason: 'fallback-primary' };
};

const findUpcomingArtifactSource = (ts, messages, startIndex, assignments, artifacts) => {
  let winner = null;
  for (const artifact of artifacts) {
    if (!artifact.from || artifact.ts <= ts) {
      continue;
    }
    const delta = artifact.ts - ts;
    const assignedBeforeArtifact = messages
      .slice(startIndex + 1)
      .some((message) => message.ts < artifact.ts && assignments.has(message.id));
    if (!assignedBeforeArtifact && delta <= artifactPreWindowMs && (!winner || delta < winner.delta)) {
      winner = { target: artifact.from, delta };
    }
  }
  return winner?.target ?? null;
};

const findActivatedTarget = (ts, aliases, targetMap) => {
  let winner = null;
  for (const alias of aliases) {
    const target = targetFromNick(targetMap, alias.nick);
    if (!target) {
      continue;
    }
    const distance = Math.min(Math.abs(ts - alias.firstSeenAt), Math.abs(ts - alias.lastSeenAt));
    if (distance <= aliasActivationWindowMs && (!winner || distance < winner.distance)) {
      winner = { target, distance };
    }
  }
  return winner?.target ?? null;
};

const findAssignedNeighbor = (messages, assignments, startIndex, direction) => {
  const current = messages[startIndex];
  for (let index = startIndex + direction; index >= 0 && index < messages.length; index += direction) {
    const message = messages[index];
    const assignment = assignments.get(message.id);
    if (!assignment) {
      continue;
    }
    const delta = Math.abs(current.ts - message.ts);
    if (delta > conversationContextWindowMs) {
      return null;
    }
    return { assignment, delta };
  }
  return null;
};

const planTargetBuffers = (db, source, targetMap, primaryTarget) => {
  const planned = new Map();
  const openTargets = new Set([normalizeIrcIdentifier(source.target), normalizeIrcIdentifier(primaryTarget)]);
  const primaryExisting = db.prepare(`
    SELECT id, target, notes
    FROM buffers
    WHERE networkId = ? AND targetKey = ? AND id <> ?
  `).get(source.networkId, normalizeIrcIdentifier(primaryTarget), source.id);
  if (primaryExisting) {
    const count = countMessages(db, primaryExisting.id);
    if (count > 0 || primaryExisting.notes) {
      throw new Error(`Primary target ${primaryTarget} already has a non-empty buffer (${primaryExisting.id})`);
    }
    planned.set(normalizeIrcIdentifier(primaryTarget), {
      target: primaryTarget,
      bufferId: source.id,
      action: 'retarget-source-and-delete-empty-conflict',
      conflictBufferId: primaryExisting.id,
      isOpen: true,
    });
  } else {
    planned.set(normalizeIrcIdentifier(primaryTarget), {
      target: primaryTarget,
      bufferId: source.id,
      action: 'retarget-source',
      isOpen: true,
    });
  }

  for (const [targetKey, target] of targetMap) {
    if (targetKey === normalizeIrcIdentifier(primaryTarget)) {
      continue;
    }
    const existing = db.prepare(`
      SELECT id, target, isOpen
      FROM buffers
      WHERE networkId = ? AND targetKey = ? AND id <> ?
    `).get(source.networkId, targetKey, source.id);
    planned.set(targetKey, {
      target,
      bufferId: existing?.id ?? randomUUID(),
      action: existing ? 'reuse-existing' : 'create',
      isOpen: Boolean(existing?.isOpen) || openTargets.has(targetKey),
    });
  }
  return planned;
};

const summarizePlan = (plan) => {
  const byTarget = {};
  const byReason = {};
  for (const assignment of plan.assignments.values()) {
    byTarget[assignment.target] = (byTarget[assignment.target] ?? 0) + 1;
    byReason[assignment.reason] = (byReason[assignment.reason] ?? 0) + 1;
  }
  return {
    sourceBufferId: plan.source.id,
    networkId: plan.source.networkId,
    sourceTarget: plan.source.target,
    primaryTarget: plan.primaryTarget,
    targets: plan.targets.map((target) => ({
      target,
      bufferId: plan.targetBuffers.get(normalizeIrcIdentifier(target))?.bufferId,
      action: plan.targetBuffers.get(normalizeIrcIdentifier(target))?.action,
      messages: byTarget[target] ?? 0,
    })),
    totalMessages: plan.messages.length,
    artifactMessages: plan.artifacts.length,
    assignedByTarget: byTarget,
    assignedByReason: byReason,
    artifacts: plan.artifacts,
  };
};

const applyRepairPlan = (db, plan) => {
  const now = Date.now();
  const affectedBufferIds = [...new Set([...plan.targetBuffers.values()].map((entry) => entry.bufferId))];
  for (const entry of plan.targetBuffers.values()) {
    if (entry.conflictBufferId) {
      db.prepare('DELETE FROM buffers WHERE id = ?').run(entry.conflictBufferId);
    }
  }
  for (const entry of plan.targetBuffers.values()) {
    if (entry.bufferId === plan.source.id) {
      db.prepare(`
        UPDATE buffers
        SET target = ?, targetKey = ?, isOpen = ?, unread = 0, priorityUnread = 0, updatedAt = ?
        WHERE id = ?
      `).run(entry.target, normalizeIrcIdentifier(entry.target), entry.isOpen ? 1 : 0, now, entry.bufferId);
      continue;
    }
    const exists = db.prepare('SELECT id FROM buffers WHERE id = ?').get(entry.bufferId);
    if (exists) {
      db.prepare(`
        UPDATE buffers
        SET isOpen = CASE WHEN ? THEN 1 ELSE isOpen END, unread = 0, priorityUnread = 0, updatedAt = ?
        WHERE id = ?
      `).run(entry.isOpen ? 1 : 0, now, entry.bufferId);
      continue;
    }
    db.prepare(`
      INSERT INTO buffers
        (id, networkId, kind, target, targetKey, notes, isOpen, unread, priorityUnread, lastReadTs, lastReadMessageId, createdAt, updatedAt)
      VALUES (?, ?, 'query', ?, ?, '', ?, 0, 0, NULL, NULL, ?, ?)
    `).run(
      entry.bufferId,
      plan.source.networkId,
      entry.target,
      normalizeIrcIdentifier(entry.target),
      entry.isOpen ? 1 : 0,
      now,
      now,
    );
  }

  for (const artifact of plan.artifacts) {
    db.prepare('DELETE FROM messages WHERE id = ?').run(artifact.id);
  }
  const updateMessage = db.prepare('UPDATE messages SET bufferId = ? WHERE id = ?');
  for (const message of plan.messages) {
    const assignment = plan.assignments.get(message.id);
    if (!assignment) {
      continue;
    }
    const targetBuffer = plan.targetBuffers.get(normalizeIrcIdentifier(assignment.target));
    updateMessage.run(targetBuffer.bufferId, message.id);
  }

  rebuildTargetMetadata(db, plan, affectedBufferIds, now);
};

const rebuildTargetMetadata = (db, plan, affectedBufferIds, now) => {
  const placeholders = affectedBufferIds.map(() => '?').join(', ');
  db.prepare(`DELETE FROM query_nick_aliases WHERE bufferId IN (${placeholders})`).run(...affectedBufferIds);
  db.prepare(`DELETE FROM query_peer_identities WHERE bufferId IN (${placeholders})`).run(...affectedBufferIds);

  const insertAlias = db.prepare(`
    INSERT INTO query_nick_aliases
      (bufferId, networkId, nick, nickKey, firstSeenAt, lastSeenAt, source)
    VALUES (?, ?, ?, ?, ?, ?, 'target')
  `);
  for (const entry of plan.targetBuffers.values()) {
    insertAlias.run(entry.bufferId, plan.source.networkId, entry.target, normalizeIrcIdentifier(entry.target), now, now);
  }

  const identities = collectTargetIdentities(db, plan);
  const insertIdentity = db.prepare(`
    INSERT INTO query_peer_identities
      (bufferId, networkId, identityKind, identityValue, nick, firstSeenAt, lastSeenAt, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'backfill')
    ON CONFLICT(bufferId, identityKind, identityValue) DO UPDATE SET
      nick = excluded.nick,
      firstSeenAt = min(query_peer_identities.firstSeenAt, excluded.firstSeenAt),
      lastSeenAt = max(query_peer_identities.lastSeenAt, excluded.lastSeenAt),
      source = excluded.source
  `);
  for (const identity of identities.values()) {
    insertIdentity.run(
      identity.bufferId,
      plan.source.networkId,
      identity.kind,
      identity.value,
      identity.nick,
      identity.firstSeenAt,
      identity.lastSeenAt,
    );
  }

  const latestMessage = db.prepare(`
    SELECT id, ts
    FROM messages
    WHERE bufferId = ?
    ORDER BY ts DESC, rowid DESC
    LIMIT 1
  `);
  const updateRead = db.prepare(`
    UPDATE buffers
    SET unread = 0, priorityUnread = 0, lastReadTs = ?, lastReadMessageId = ?, updatedAt = ?
    WHERE id = ?
  `);
  for (const bufferId of affectedBufferIds) {
    const latest = latestMessage.get(bufferId);
    updateRead.run(latest?.ts ?? null, latest?.id ?? null, now, bufferId);
  }
};

const collectTargetIdentities = (db, plan) => {
  const identities = new Map();
  const add = ({ target, kind, value, nick, ts }) => {
    const normalizedKey = identityKey(kind, value);
    if (!normalizedKey || plan.selfKeys.has(normalizedKey)) {
      return;
    }
    const normalizedValue = normalizeIdentityValue(kind, value);
    const targetBuffer = plan.targetBuffers.get(normalizeIrcIdentifier(target));
    if (!targetBuffer) {
      return;
    }
    const recordKey = `${targetBuffer.bufferId}:${normalizedKey}`;
    const existing = identities.get(recordKey);
    identities.set(recordKey, {
      bufferId: targetBuffer.bufferId,
      kind,
      value: normalizedValue,
      nick: nick || target,
      firstSeenAt: existing ? Math.min(existing.firstSeenAt, ts) : ts,
      lastSeenAt: existing ? Math.max(existing.lastSeenAt, ts) : ts,
    });
  };

  const originalRows = db.prepare(`
    SELECT identityKind, identityValue, nick, firstSeenAt, lastSeenAt
    FROM query_peer_identities
    WHERE bufferId = ?
  `).all(plan.source.id);
  for (const row of originalRows) {
    const target = plan.targets.find((candidate) =>
      normalizeIrcIdentifier(candidate) === normalizeIrcIdentifier(row.nick)
      || normalizeIrcIdentifier(candidate) === normalizeIrcIdentifier(row.identityValue)
    );
    if (target) {
      add({
        target,
        kind: row.identityKind,
        value: row.identityValue,
        nick: row.nick,
        ts: row.lastSeenAt ?? row.firstSeenAt ?? Date.now(),
      });
    }
  }

  for (const message of plan.messages) {
    if (message.self) {
      continue;
    }
    const assignment = plan.assignments.get(message.id);
    if (!assignment) {
      continue;
    }
    add({
      target: assignment.target,
      kind: message.senderIdentityKind,
      value: message.senderIdentityValue,
      nick: message.nick,
      ts: message.ts,
    });
  }
  return identities;
};

const createBackup = (databasePath) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = join(dirname(databasePath), 'backups', `repair-merged-queries-${stamp}`);
  mkdirSync(backupDirectory, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${databasePath}${suffix}`;
    if (existsSync(source)) {
      copyFileSync(source, join(backupDirectory, `pulsete.sqlite${suffix}`));
    }
  }
  return backupDirectory;
};

const targetFromNick = (targetMap, nick) =>
  nick ? targetMap.get(normalizeIrcIdentifier(nick)) ?? null : null;

const targetFromIdentityValue = (targetMap, value) =>
  value ? targetMap.get(normalizeIrcIdentifier(String(value))) ?? null : null;

const targetFromIdentity = (identityTargetByKey, kind, value) => {
  const key = identityKey(kind, value);
  return key ? identityTargetByKey.get(key) ?? null : null;
};

const stripIrcFormatting = (value) =>
  value
    .replace(/\x03\d{0,2}(?:,\d{1,2})?/g, '')
    .replace(/[\x02\x0f\x16\x1d\x1f]/g, '');

const countMessages = (db, bufferId) =>
  Number(db.prepare('SELECT COUNT(*) AS count FROM messages WHERE bufferId = ?').get(bufferId)?.count ?? 0);

const isCliEntrypoint = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCliEntrypoint) {
  try {
    const result = repairMergedQueryBuffer(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
