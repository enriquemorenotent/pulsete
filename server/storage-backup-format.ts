import { gzipSync, gunzipSync } from 'node:zlib';

const magic = Buffer.from('pulsete.backup.v2\n');
const maxMetadataBytes = 1024 * 1024;

// Only the small metadata document is text. The SQLite payload stays binary.
export const encodeBackupArchive = (metadata: object, database: Buffer): Buffer => {
  const header = Buffer.from(JSON.stringify(metadata), 'utf8');
  if (header.length > maxMetadataBytes) {
    throw new Error('Backup metadata is too large');
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return gzipSync(Buffer.concat([magic, length, header, database]));
};

export const decodeBackupArchive = (content: Buffer): { metadata: unknown; database: Buffer } => {
  const archive = gunzipSync(content);
  if (archive.subarray(0, magic.length).equals(magic)) {
    const offset = magic.length + 4;
    if (archive.length < offset) throw new Error('Truncated backup header');
    const length = archive.readUInt32BE(magic.length);
    if (length === 0 || length > maxMetadataBytes || offset + length >= archive.length) {
      throw new Error('Invalid backup header length');
    }
    const metadata: unknown = JSON.parse(archive.subarray(offset, offset + length).toString('utf8'));
    if (!metadata || typeof metadata !== 'object'
      || (metadata as { format?: unknown }).format !== 'pulsete.backup.v2') {
      throw new Error('Invalid backup format');
    }
    return { metadata, database: archive.subarray(offset + length) };
  }

  // Backups made before v2 used a gzip-compressed JSON/base64 envelope.
  const metadata: unknown = JSON.parse(archive.toString('utf8'));
  if (!metadata || typeof metadata !== 'object') throw new Error('Invalid legacy backup');
  const legacy = metadata as { format?: unknown; database?: unknown };
  if (legacy.format !== 'pulsete.backup.v1' || typeof legacy.database !== 'string') {
    throw new Error('Invalid legacy backup');
  }
  return { metadata, database: Buffer.from(legacy.database, 'base64') };
};
