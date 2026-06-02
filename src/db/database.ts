import * as SQLite from 'expo-sqlite';

const DB_NAME = 'control_stock.db';

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Returns the singleton database instance.
 * Opens or creates the database on first call.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  
  if (!_dbPromise) {
    _dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(db => {
      _db = db;
      return db;
    });
  }
  
  return _dbPromise;
}

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  definition: string
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) return;

  await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

/**
 * Creates tables and indexes if they don't already exist.
 * Must be called once at app startup.
 */
export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();

  await db.execAsync(`
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

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      operator_name TEXT,
      device_id TEXT,
      load_id TEXT,
      manifest_id TEXT,
      manifest_version TEXT,
      started_at TEXT NOT NULL,
      closed_at TEXT,
      status TEXT NOT NULL DEFAULT 'open'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_mode_status ON sessions(mode, status);

    CREATE TABLE IF NOT EXISTS scan_events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      id_barra TEXT NOT NULL,
      scan_timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      cliente_id TEXT,
      cliente_nombre TEXT,
      cod_articulo TEXT,
      descripcion TEXT,
      peso_nominal REAL DEFAULT 0,
      color TEXT,
      raw_source TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_scan_events_session ON scan_events(session_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_events_session_barra ON scan_events(session_id, id_barra);
    CREATE INDEX IF NOT EXISTS idx_scan_events_cliente ON scan_events(session_id, cliente_id);

    CREATE TABLE IF NOT EXISTS delivery_plan_items (
      id_barra TEXT PRIMARY KEY,
      manifest_id TEXT NOT NULL,
      manifest_version TEXT NOT NULL,
      cliente_id TEXT NOT NULL,
      cliente_nombre TEXT NOT NULL,
      cod_articulo TEXT,
      descripcion TEXT,
      peso_nominal REAL DEFAULT 0,
      color TEXT,
      last_updated TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_plan_cliente ON delivery_plan_items(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_plan_manifest ON delivery_plan_items(manifest_id, manifest_version);

    CREATE TABLE IF NOT EXISTS export_outbox (
      export_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      cliente_id TEXT,
      file_name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      uploaded_at TEXT,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_export_outbox_status ON export_outbox(status);
    CREATE INDEX IF NOT EXISTS idx_export_outbox_session ON export_outbox(session_id);
  `);

  await ensureColumn(db, 'sessions', 'load_id', 'TEXT');
}
