import { cacheLimiter, type MailEnv } from "./codes.ts";
import { handleApp } from "./platform.ts";
import type { Row, Sql, SqlValue } from "./sql.ts";

type StorageSql = {
  exec(query: string, ...bindings: SqlValue[]): { toArray(): Row[] };
};

export class FanstarStore {
  constructor(
    private ctx: { storage: { sql: StorageSql } },
    private env: MailEnv,
  ) {}

  async fetch(request: Request) {
    const storage = this.ctx.storage.sql;
    const thisStorage = this.ctx.storage;
    const sql: Sql = {
      exec(statement) {
        storage.exec(statement);
      },
      run(statement, ...params) {
        storage.exec(statement, ...params);
      },
      all(statement, ...params) {
        return storage.exec(statement, ...params).toArray();
      },
      get(statement, ...params) {
        return storage.exec(statement, ...params).toArray()[0];
      },
      transaction<T>(fn: () => T) {
        return thisStorage.transactionSync(fn);
      },
    };
    return handleApp(request, sql, this.env, cacheLimiter());
  }
}
