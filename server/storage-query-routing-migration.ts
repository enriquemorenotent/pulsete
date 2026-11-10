import type { SqliteDb } from './storage-sqlite.js';

// A conversation keeps its ID and last nickname even after that nickname is reused.
// Only the current recipient owns a non-null routing key.
export const migrateQueryRouting = (db: SqliteDb) => {
  const column = db.prepare('PRAGMA table_info(buffers)').all<{name:string; notnull:number}>().find(row => row.name === 'targetKey');
  if (!column?.notnull) return;
  const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL").all<{name:string;sql:string}>();
  const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'buffers' AND sql IS NOT NULL").all<{sql:string}>();
  const original = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'buffers'").get<{sql:string}>()!.sql;
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name.replaceAll('"','""')}"`);
    db.exec(original.replace(/CREATE TABLE(?: IF NOT EXISTS)? ["`]?buffers["`]?/i, 'CREATE TABLE buffers_routed').replace(/targetKey TEXT NOT NULL/i, 'targetKey TEXT'));
    db.exec('INSERT INTO buffers_routed SELECT * FROM buffers; DROP TABLE buffers; ALTER TABLE buffers_routed RENAME TO buffers;');
    for (const index of indexes) db.exec(index.sql);
    for (const trigger of triggers) db.exec(trigger.sql);
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Conversation routing migration broke a reference');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  finally { db.exec('PRAGMA foreign_keys = ON'); }
};
