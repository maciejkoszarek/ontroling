import type { AppState } from "../store";
import { buildExportTables, EXPORT_SCHEMA_VERSION, type ExportTable } from "./dataExport";

/**
 * Exports the full store as a SQLite database (`.db`).
 *
 * Opens a fresh in-memory database, creates a table per domain slice (schema
 * derived from the first row of each table), inserts all rows, and returns
 * the serialized database as a Uint8Array.
 *
 * The resulting file can be opened with any SQLite client (DB Browser, CLI,
 * DataGrip) — this is the "relational escape hatch" for data repair when the
 * UI is unavailable.
 *
 * `sql.js` is loaded lazily so the WASM blob (~1MB) doesn't bloat the main
 * bundle.
 */

// Explicit type — we use dynamic import, so we can't rely on `import type` alone
// for the runtime initializer.
type SqlJsStatic = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};
type SqlJsDatabase = {
  run: (sql: string, params?: unknown[]) => void;
  export: () => Uint8Array;
  close: () => void;
};

async function loadSqlJs(): Promise<SqlJsStatic> {
  const mod = await import("sql.js");
  const initSqlJs = (mod.default ?? (mod as unknown as { default?: unknown })) as (
    config?: { locateFile?: (file: string) => string },
  ) => Promise<SqlJsStatic>;
  // Vite emits the WASM as a hashed asset; `?url` gives us the resolved URL.
  const wasmUrl = (await import("sql.js/dist/sql-wasm.wasm?url")).default as string;
  return initSqlJs({ locateFile: () => wasmUrl });
}

function sqliteTypeOf(value: unknown): "INTEGER" | "REAL" | "TEXT" {
  if (typeof value === "number") {
    return Number.isInteger(value) ? "INTEGER" : "REAL";
  }
  if (typeof value === "boolean") return "INTEGER";
  return "TEXT";
}

function inferColumnTypes(rows: Record<string, unknown>[]): Map<string, "INTEGER" | "REAL" | "TEXT"> {
  const types = new Map<string, "INTEGER" | "REAL" | "TEXT">();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (v === "" || v === null || v === undefined) continue;
      const t = sqliteTypeOf(v);
      const existing = types.get(k);
      if (!existing) {
        types.set(k, t);
      } else if (existing !== t) {
        // Mixed — fall back to TEXT to avoid data loss.
        types.set(k, "TEXT");
      }
    }
  }
  return types;
}

function collectColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) seen.add(k);
    }
  }
  return [...seen];
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function coerceForBind(value: unknown): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return String(value);
}

function createTableSQL(table: ExportTable): { create: string; columns: string[] } {
  const columns = collectColumns(table.rows);
  if (columns.length === 0) {
    return {
      create: `CREATE TABLE ${quoteIdentifier(table.name)} (_placeholder TEXT);`,
      columns: [],
    };
  }
  const types = inferColumnTypes(table.rows);
  const defs = columns.map((c) => `${quoteIdentifier(c)} ${types.get(c) ?? "TEXT"}`).join(", ");
  return {
    create: `CREATE TABLE ${quoteIdentifier(table.name)} (${defs});`,
    columns,
  };
}

function insertSQL(table: string, columns: string[]): string {
  const cols = columns.map(quoteIdentifier).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  return `INSERT INTO ${quoteIdentifier(table)} (${cols}) VALUES (${placeholders});`;
}

export async function exportStateToSqlite(state: AppState): Promise<Uint8Array> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  try {
    db.run(`CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT);`);
    const metaPairs: Array<[string, string]> = [
      ["schemaVersion", String(EXPORT_SCHEMA_VERSION)],
      ["exportedAt", new Date().toISOString()],
      ["activeCycleId", state.activeCycleId],
      ["previousCycleId", state.previousCycleId ?? ""],
      ["role", state.role],
      ["userName", state.user?.name ?? ""],
      ["userEmail", state.user?.email ?? ""],
    ];
    for (const [k, v] of metaPairs) {
      db.run(`INSERT INTO _meta VALUES (?, ?);`, [k, v]);
    }

    const tables = buildExportTables(state);
    for (const table of tables) {
      const { create, columns } = createTableSQL(table);
      db.run(create);
      if (columns.length === 0) continue;
      const stmt = insertSQL(table.name, columns);
      for (const row of table.rows) {
        const bindings = columns.map((c) => coerceForBind((row as Record<string, unknown>)[c]));
        db.run(stmt, bindings);
      }
    }

    return db.export();
  } finally {
    db.close();
  }
}

export async function exportStateToSqliteBlob(state: AppState): Promise<Blob> {
  const bytes = await exportStateToSqlite(state);
  // Copy to a fresh ArrayBuffer so Blob doesn't alias the WASM memory heap.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "application/vnd.sqlite3" });
}
