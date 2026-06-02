import { getDatabase } from '../db/database';
import { SessionRecord, SessionStatus, WorkMode } from '../types';
import { getOperatorName } from './operatorService';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function makeLoadId(date: Date): string {
  const stamp = [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    '_',
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join('');
  return `carga_${stamp}`;
}

export async function getDeviceId(): Promise<string> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM sync_meta WHERE key = 'device_id'`
  );

  if (row?.value) return row.value;

  const deviceId = `dev_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('device_id', ?)`,
    [deviceId]
  );
  return deviceId;
}

export async function createSession(
  mode: WorkMode,
  options?: {
    manifestId?: string | null;
    manifestVersion?: string | null;
  }
): Promise<SessionRecord> {
  const db = await getDatabase();
  const operatorName = (await getOperatorName()) || 'Desconocido';
  const deviceId = await getDeviceId();
  const startedAt = new Date();
  const session: SessionRecord = {
    session_id: makeId(mode === 'delivery' ? 'del' : 'prep'),
    mode,
    operator_name: operatorName,
    device_id: deviceId,
    load_id: mode === 'delivery' ? makeLoadId(startedAt) : null,
    manifest_id: options?.manifestId ?? null,
    manifest_version: options?.manifestVersion ?? null,
    started_at: startedAt.toISOString(),
    closed_at: null,
    status: 'open',
  };

  await db.runAsync(
    `INSERT INTO sessions (
       session_id, mode, operator_name, device_id, load_id, manifest_id,
       manifest_version, started_at, closed_at, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.session_id,
      session.mode,
      session.operator_name,
      session.device_id,
      session.load_id ?? null,
      session.manifest_id ?? null,
      session.manifest_version ?? null,
      session.started_at,
      session.closed_at ?? null,
      session.status,
    ]
  );

  return session;
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SessionRecord>(
    `SELECT * FROM sessions WHERE session_id = ?`,
    [sessionId]
  );
  return row ?? null;
}

export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET status = ?, closed_at = COALESCE(closed_at, ?) WHERE session_id = ?`,
    [status, new Date().toISOString(), sessionId]
  );
}

export async function countPendingExports(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM export_outbox WHERE status IN ('pending', 'failed')`
  );
  return row?.cnt ?? 0;
}
