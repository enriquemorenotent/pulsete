import BetterSqlite3 from 'better-sqlite3';

type BetterSqliteDb = InstanceType<typeof BetterSqlite3>;
type BetterSqliteStatement = ReturnType<BetterSqliteDb['prepare']>;

export type SqliteRunResult = ReturnType<BetterSqliteStatement['run']>;

export type SqliteStatement = {
  all<T = unknown>(...params: unknown[]): T[];
  get<T = unknown>(...params: unknown[]): T | undefined;
  run(...params: unknown[]): SqliteRunResult;
  iterate<T = unknown>(...params: unknown[]): IterableIterator<T>;
};

export type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};

const wrapStatement = (statement: BetterSqliteStatement): SqliteStatement => ({
  all: statement.all.bind(statement) as SqliteStatement['all'],
  get: statement.get.bind(statement) as SqliteStatement['get'],
  run: statement.run.bind(statement) as SqliteStatement['run'],
  iterate: statement.iterate.bind(statement) as SqliteStatement['iterate'],
});

export const openSqliteDatabase = (filePath: string): SqliteDb => {
  const db = new BetterSqlite3(filePath);
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    prepare: (sql) => wrapStatement(db.prepare(sql)),
    close: () => {
      db.close();
    },
  };
};
