declare module 'sql.js' {
  interface SqlJsConfig {
    locateFile?: (filename: string) => string;
    wasmBinary?: Uint8Array;
  }

  interface SqlDatabase {
    prepare(sql: string): unknown;
    close(): void;
  }

  interface SqlJsModule {
    Database: new (data?: Uint8Array) => SqlDatabase;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsModule>;
}
