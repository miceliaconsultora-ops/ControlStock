import { getDatabase } from '../db/database';
import { DeliveryPlanItem, MasterArticle, ScanEvent, WorkMode } from '../types';
import { getDeliveryPlanItem } from './deliveryPlanService';

function makeEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

async function isDuplicate(sessionId: string, idBarra: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM scan_events WHERE session_id = ? AND id_barra = ?`,
    [sessionId, idBarra]
  );
  return (row?.cnt ?? 0) > 0;
}

async function insertScanEvent(event: ScanEvent): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO scan_events (
       event_id, session_id, id_barra, scan_timestamp, status,
       cliente_id, cliente_nombre, cod_articulo, descripcion,
       peso_nominal, color, raw_source
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.event_id,
      event.session_id,
      event.id_barra,
      event.scan_timestamp,
      event.status,
      event.cliente_id ?? null,
      event.cliente_nombre ?? null,
      event.cod_articulo ?? null,
      event.descripcion ?? null,
      event.peso_nominal ?? 0,
      event.color ?? null,
      event.raw_source ?? null,
    ]
  );
}

function eventFromMaster(
  sessionId: string,
  idBarra: string,
  master: MasterArticle | null,
  rawSource?: string
): ScanEvent {
  return {
    event_id: makeEventId(),
    session_id: sessionId,
    id_barra: idBarra,
    scan_timestamp: new Date().toISOString(),
    status: master ? 'hydrated' : 'pending',
    cod_articulo: master?.cod_articulo ?? null,
    descripcion: master?.descripcion ?? null,
    peso_nominal: master?.peso_nominal ?? 0,
    color: master?.color ?? null,
    raw_source: rawSource ?? null,
  };
}

function eventFromDeliveryPlan(
  sessionId: string,
  idBarra: string,
  item: DeliveryPlanItem | null,
  rawSource?: string,
  expectedClienteId?: string | null
): ScanEvent {
  const isWrongClient = Boolean(
    item && expectedClienteId && item.cliente_id !== expectedClienteId
  );

  return {
    event_id: makeEventId(),
    session_id: sessionId,
    id_barra: idBarra,
    scan_timestamp: new Date().toISOString(),
    status: item ? (isWrongClient ? 'wrong_client' : 'delivered') : 'not_prepared',
    cliente_id: item?.cliente_id ?? null,
    cliente_nombre: item?.cliente_nombre ?? null,
    cod_articulo: item?.cod_articulo ?? null,
    descripcion: item?.descripcion ?? null,
    peso_nominal: item?.peso_nominal ?? 0,
    color: item?.color ?? null,
    raw_source: rawSource ?? null,
  };
}

export async function processPreparationScan(
  sessionId: string,
  idBarraRaw: string,
  rawSource?: string
): Promise<ScanEvent> {
  const idBarra = idBarraRaw.trim();
  if (!idBarra) throw new Error('Codigo vacio');

  if (await isDuplicate(sessionId, idBarra)) {
    return {
      event_id: makeEventId(),
      session_id: sessionId,
      id_barra: idBarra,
      scan_timestamp: new Date().toISOString(),
      status: 'duplicate_session',
      raw_source: rawSource ?? null,
    };
  }

  const db = await getDatabase();
  const master = await db.getFirstAsync<MasterArticle>(
    `SELECT * FROM master_stock WHERE id_barra = ?`,
    [idBarra]
  );
  const event = eventFromMaster(sessionId, idBarra, master ?? null, rawSource);
  await insertScanEvent(event);
  return event;
}

export async function processDeliveryScan(
  sessionId: string,
  idBarraRaw: string,
  rawSource?: string,
  expectedClienteId?: string | null
): Promise<ScanEvent> {
  const idBarra = idBarraRaw.trim();
  if (!idBarra) throw new Error('Codigo vacio');

  if (await isDuplicate(sessionId, idBarra)) {
    return {
      event_id: makeEventId(),
      session_id: sessionId,
      id_barra: idBarra,
      scan_timestamp: new Date().toISOString(),
      status: 'duplicate_session',
      raw_source: rawSource ?? null,
    };
  }

  const item = await getDeliveryPlanItem(idBarra);
  const event = eventFromDeliveryPlan(
    sessionId,
    idBarra,
    item,
    rawSource,
    expectedClienteId
  );
  await insertScanEvent(event);
  return event;
}

export async function processScan(
  mode: WorkMode,
  sessionId: string,
  idBarra: string,
  rawSource?: string
): Promise<ScanEvent> {
  if (mode === 'delivery') {
    return processDeliveryScan(sessionId, idBarra, rawSource);
  }
  return processPreparationScan(sessionId, idBarra, rawSource);
}

export async function getSessionScanEvents(sessionId: string): Promise<ScanEvent[]> {
  const db = await getDatabase();
  return await db.getAllAsync<ScanEvent>(
    `SELECT * FROM scan_events
     WHERE session_id = ?
     ORDER BY scan_timestamp DESC`,
    [sessionId]
  );
}

export async function getSessionValidScanCount(
  sessionId: string,
  mode: WorkMode
): Promise<number> {
  const db = await getDatabase();
  const statuses =
    mode === 'delivery' ? `('delivered')` : `('hydrated', 'pending')`;
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM scan_events
     WHERE session_id = ? AND status IN ${statuses}`,
    [sessionId]
  );
  return row?.cnt ?? 0;
}
