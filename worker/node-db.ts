import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { Row, Sql, SqlValue } from "./sql.ts";

const pools = new Map<string, DatabaseSync>();

export function openSql(path = ".data/fanstar.sqlite"): Sql {
  let db = pools.get(path);
  if (!db) {
    if (path !== ":memory:") mkdirSync(".data", { recursive: true });
    db = new DatabaseSync(path);
    if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
    pools.set(path, db);
  }
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, ...params) {
      db.prepare(sql).run(...(params as SqlValue[]));
    },
    all(sql, ...params) {
      return db
        .prepare(sql)
        .all(...(params as SqlValue[]))
        .map((row) => ({ ...row }) as Row);
    },
    get(sql, ...params) {
      const row = db.prepare(sql).get(...(params as SqlValue[]));
      return row ? ({ ...row } as Row) : undefined;
    },
  };
}
