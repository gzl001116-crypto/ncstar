export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export type Sql = {
  exec(sql: string): void;
  run(sql: string, ...params: SqlValue[]): void;
  all(sql: string, ...params: SqlValue[]): Row[];
  get(sql: string, ...params: SqlValue[]): Row | undefined;
};
