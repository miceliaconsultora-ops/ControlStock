import { getDatabase } from '../db/database';
import { SessionScan, MasterArticle } from '../types';

/**
 * Look up a barcode in the master_stock table and hydrate the scan record.
 * Returns the hydrated scan (or marks it as pending if not found in master).
 */
export async function hydrateScan(
  idBarra: string,
  sessionId: string
): Promise<SessionScan> {
  const db = await getDatabase();

  // Look up in master_stock
  const master = await db.getFirstAsync<MasterArticle>(
    `SELECT * FROM master_stock WHERE id_barra = ?`,
    [idBarra]
  );

  const timestamp = new Date().toISOString();

  if (master) {
    // Insert as hydrated
    await db.runAsync(
      `INSERT OR IGNORE INTO session_scans (id_barra, scan_timestamp, session_id, status)
       VALUES (?, ?, ?, 'hydrated')`,
      [idBarra, timestamp, sessionId]
    );

    return {
      id_barra: idBarra,
      scan_timestamp: timestamp,
      session_id: sessionId,
      status: 'hydrated',
      cod_articulo: master.cod_articulo,
      descripcion: master.descripcion,
      peso_nominal: master.peso_nominal,
      color: master.color,
    };
  } else {
    // Insert as pending (unresolved)
    await db.runAsync(
      `INSERT OR IGNORE INTO session_scans (id_barra, scan_timestamp, session_id, status)
       VALUES (?, ?, ?, 'pending')`,
      [idBarra, timestamp, sessionId]
    );

    return {
      id_barra: idBarra,
      scan_timestamp: timestamp,
      session_id: sessionId,
      status: 'pending',
    };
  }
}

/**
 * Check if a barcode was already scanned in the current session.
 */
export async function isDuplicateInSession(
  idBarra: string,
  sessionId: string
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM session_scans WHERE id_barra = ? AND session_id = ?`,
    [idBarra, sessionId]
  );
  return (row?.cnt ?? 0) > 0;
}

/**
 * Get all scans for a session, joined with master data.
 */
export async function getSessionScans(sessionId: string): Promise<SessionScan[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionScan & MasterArticle>(
    `SELECT s.id_barra, s.scan_timestamp, s.session_id, s.status,
            m.cod_articulo, m.descripcion, m.peso_nominal, m.color
     FROM session_scans s
     LEFT JOIN master_stock m ON s.id_barra = m.id_barra
     WHERE s.session_id = ?
     ORDER BY s.scan_timestamp DESC`,
    [sessionId]
  );
  return rows;
}

/**
 * Get total scan count for a session.
 */
export async function getSessionScanCount(sessionId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM session_scans WHERE session_id = ?`,
    [sessionId]
  );
  return row?.cnt ?? 0;
}
