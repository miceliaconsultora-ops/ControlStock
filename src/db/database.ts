import * as SQLite from 'expo-sqlite';

const DB_NAME = 'control_stock.db';

let _db: SQLite.SQLiteDatabase | null = null;

/**
 * Returns the singleton database instance.
 * Opens or creates the database on first call.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return _db;
}

/**
 * Creates tables and indexes if they don't already exist.
 * Must be called once at app startup.
 */
export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS master_stock (
      id_barra    TEXT PRIMARY KEY,
      cod_articulo TEXT NOT NULL,
      descripcion  TEXT,
      peso_nominal REAL DEFAULT 0,
      color        TEXT,
      last_updated TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_master_id_barra ON master_stock(id_barra);
    CREATE INDEX IF NOT EXISTS idx_master_cod_articulo ON master_stock(cod_articulo);

    CREATE TABLE IF NOT EXISTS session_scans (
      id_barra       TEXT NOT NULL,
      scan_timestamp TEXT NOT NULL,
      session_id     TEXT NOT NULL,
      status         TEXT DEFAULT 'pending',
      PRIMARY KEY (id_barra, session_id)
    );

    CREATE INDEX IF NOT EXISTS idx_session_scans_session ON session_scans(session_id);

    CREATE TABLE IF NOT EXISTS sync_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}
