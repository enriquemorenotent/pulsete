import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { decodeBackupArchive, encodeBackupArchive } from '../server/storage-backup-format.js';

test('binary backup format preserves metadata and arbitrary database bytes', () => {
  const metadata = { format: 'pulsete.backup.v2', secret: 'example', browserPreferences: {} };
  const database = Buffer.from([0, 255, 128, 1, 10, 13]);
  const decoded = decodeBackupArchive(encodeBackupArchive(metadata, database));
  assert.deepEqual(decoded, { metadata, database });
});

test('legacy JSON backups remain readable', () => {
  const database = Buffer.from('SQLite format 3\0legacy bytes');
  const metadata = { format: 'pulsete.backup.v1', database: database.toString('base64') };
  assert.deepEqual(decodeBackupArchive(gzipSync(Buffer.from(JSON.stringify(metadata)))), {
    metadata, database,
  });
});

test('binary archives reject truncated, oversized and mismatched headers', () => {
  const magic = Buffer.from('pulsete.backup.v2\n');
  const length = Buffer.alloc(4);
  for (const size of [0, 10, 1024 * 1024 + 1, 0xffffffff]) {
    length.writeUInt32BE(size);
    assert.throws(() => decodeBackupArchive(gzipSync(Buffer.concat([magic, length]))));
  }
  assert.throws(() => decodeBackupArchive(gzipSync(magic)));
  assert.throws(() => decodeBackupArchive(encodeBackupArchive(
    { format: 'pulsete.backup.v1' }, Buffer.from('database'),
  )));
  assert.throws(() => decodeBackupArchive(gzipSync(Buffer.from('{"format":"unknown","database":"AA=="}'))));
});
