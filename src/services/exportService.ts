import { Alert, Platform } from 'react-native';
import { getDatabase } from '../db/database';
import {
  DeliveryExportPayload,
  ExportOutboxItem,
  ExportPayload,
  ScanEvent,
  SessionRecord,
  WorkMode,
} from '../types';
import { getAggregatedData, getClientDeliveryCompletion } from './aggregationService';
import { markDeliveryPlanConsumed } from './deliveryPlanService';
import { getOperatorName } from './operatorService';
import { getDeviceId, getSession, updateSessionStatus } from './sessionService';
import { getSessionScanEvents } from './scanWorkflowService';
import { API_CONSTANTS } from '../constants/api';

function makeExportId(): string {
  return `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

async function createOutboxRecord(
  item: Omit<ExportOutboxItem, 'created_at' | 'status'> & {
    status?: ExportOutboxItem['status'];
  }
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO export_outbox (
       export_id, session_id, mode, cliente_id, file_name, payload_json,
       status, created_at, uploaded_at, error_message
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.export_id,
      item.session_id,
      item.mode,
      item.cliente_id ?? null,
      item.file_name,
      item.payload_json,
      item.status ?? 'pending',
      new Date().toISOString(),
      item.uploaded_at ?? null,
      item.error_message ?? null,
    ]
  );
}

async function uploadJsonToCloud(jsonString: string): Promise<void> {
  if (!API_CONSTANTS.GOOGLE_SCRIPT_URL) {
    throw new Error('No hay URL cloud configurada');
  }

  const response = await fetch(API_CONSTANTS.GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: jsonString,
  });

  const result = await response.json();
  if (result.status !== 'success') {
    throw new Error(result.message || 'La subida cloud fallo');
  }
}

async function shareJsonLocally(jsonString: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');

  const file = new File(Paths.cache, fileName);
  file.create();
  file.write(jsonString);

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing no disponible en este dispositivo');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: fileName,
    UTI: 'public.json',
  });
}

function validPreparationEvents(scans: ScanEvent[]): ScanEvent[] {
  return scans.filter((scan) => scan.status === 'hydrated' || scan.status === 'pending');
}

export async function buildExportPayload(
  sessionId: string,
  deviceId?: string,
  userName?: string
): Promise<ExportPayload> {
  const scans = validPreparationEvents(await getSessionScanEvents(sessionId));
  const aggregated = await getAggregatedData(sessionId);
  const rollsByArticle: Record<string, Array<{ id_barra: string; peso: number }>> = {};

  for (const scan of scans) {
    const code = scan.cod_articulo ?? 'SIN_CODIGO';
    if (!rollsByArticle[code]) rollsByArticle[code] = [];
    rollsByArticle[code].push({
      id_barra: scan.id_barra,
      peso: scan.peso_nominal ?? 0,
    });
  }

  return {
    header: {
      device_id: deviceId ?? (await getDeviceId()),
      user: userName ?? ((await getOperatorName()) || 'Desconocido'),
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    },
    summary: aggregated.map((article) => ({
      cod_articulo: article.cod_articulo,
      descripcion: article.descripcion,
      color: article.color,
      total_units: article.total_units,
      total_weight: article.total_weight,
      rollos: rollsByArticle[article.cod_articulo] ?? [],
    })),
    raw_data: scans.map((scan) => ({
      id_barra: scan.id_barra,
      cod_articulo: scan.cod_articulo ?? '',
      peso: scan.peso_nominal ?? 0,
      color: scan.color ?? '',
    })),
  };
}

async function exportOnePayload(
  payload: object,
  fileName: string,
  session: SessionRecord,
  clienteId?: string | null
): Promise<'uploaded' | 'pending'> {
  const payloadJson = JSON.stringify(payload, null, 2);
  const exportId = makeExportId();

  try {
    await uploadJsonToCloud(payloadJson);
    await createOutboxRecord({
      export_id: exportId,
      session_id: session.session_id,
      mode: session.mode,
      cliente_id: clienteId ?? null,
      file_name: fileName,
      payload_json: payloadJson,
      status: 'uploaded',
      uploaded_at: new Date().toISOString(),
    });
    return 'uploaded';
  } catch (error: any) {
    await createOutboxRecord({
      export_id: exportId,
      session_id: session.session_id,
      mode: session.mode,
      cliente_id: clienteId ?? null,
      file_name: fileName,
      payload_json: payloadJson,
      status: 'pending',
      error_message: error?.message || String(error),
    });
    await shareJsonLocally(payloadJson, fileName);
    return 'pending';
  }
}

export async function exportPreparationSession(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('Sesion no encontrada');

  const payload = await buildExportPayload(sessionId, session.device_id, session.operator_name);
  const fileName = `Preparacion_${safeFilePart(sessionId.substring(0, 16))}_${Date.now()}.json`;
  const result = await exportOnePayload(payload, fileName, session);

  await updateSessionStatus(sessionId, result === 'uploaded' ? 'exported' : 'closed');
  return true;
}

function groupDeliveryByClient(scans: ScanEvent[]): Record<string, ScanEvent[]> {
  return scans
    .filter((scan) => scan.status === 'delivered')
    .reduce<Record<string, ScanEvent[]>>((acc, scan) => {
      const clientId = scan.cliente_id ?? 'SIN_CLIENTE';
      if (!acc[clientId]) acc[clientId] = [];
      acc[clientId].push(scan);
      return acc;
    }, {});
}

export async function buildDeliveryExportPayloads(
  sessionId: string
): Promise<DeliveryExportPayload[]> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('Sesion no encontrada');

  const scans = await getSessionScanEvents(sessionId);
  const groups = groupDeliveryByClient(scans);
  const timestamp = new Date().toISOString();

  return Object.entries(groups).map(([clienteId, delivered]) => {
    const first = delivered[0];
    const loadId = session.load_id || session.session_id;
    return {
      header: {
        kind: 'delivery',
        device_id: session.device_id,
        operator: session.operator_name,
        session_id: session.session_id,
        load_id: loadId,
        load_started_at: session.started_at,
        manifest_id: session.manifest_id ?? null,
        manifest_version: session.manifest_version ?? null,
        cliente_id: clienteId,
        cliente_nombre: first.cliente_nombre ?? 'Cliente sin nombre',
        timestamp,
      },
      delivered: delivered.map((scan) => ({
        id_barra: scan.id_barra,
        cod_articulo: scan.cod_articulo ?? '',
        descripcion: scan.descripcion ?? '',
        peso: scan.peso_nominal ?? 0,
        color: scan.color ?? '',
        load_id: loadId,
        scanned_at: scan.scan_timestamp,
      })),
      exceptions: scans
        .filter((scan) => scan.cliente_id === clienteId && scan.status !== 'delivered')
        .map((scan) => ({
          id_barra: scan.id_barra,
          status: scan.status,
          scanned_at: scan.scan_timestamp,
        })),
    };
  });
}

function deliveryFileName(
  payload: DeliveryExportPayload,
  session: SessionRecord
): string {
  const clientPart = safeFilePart(payload.header.cliente_nombre || payload.header.cliente_id);
  const loadPart = safeFilePart(session.load_id || session.session_id.substring(0, 16));
  return `Entrega_${clientPart}_${loadPart}_${Date.now()}.json`;
}

/**
 * Returns the set of client ids that were already successfully uploaded for
 * this delivery session. Acts as the persistent buffer so the final session
 * export does not resend clients that were sent individually mid-session.
 */
export async function getSentDeliveryClientIds(sessionId: string): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ cliente_id: string }>(
    `SELECT DISTINCT cliente_id FROM export_outbox
     WHERE session_id = ? AND mode = 'delivery'
       AND status = 'uploaded' AND cliente_id IS NOT NULL`,
    [sessionId]
  );
  return new Set(rows.map((row) => row.cliente_id));
}

/**
 * Export a single client's delivery JSON mid-session (used by the
 * "Cliente completo - Enviar" banner). Does not close the session or mark the
 * plan consumed; that happens on the full session finalize.
 */
export async function exportDeliveryClient(
  sessionId: string,
  clienteId: string
): Promise<'uploaded' | 'pending'> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('Sesion no encontrada');

  const payloads = await buildDeliveryExportPayloads(sessionId);
  const payload = payloads.find((item) => item.header.cliente_id === clienteId);
  if (!payload) {
    throw new Error('No hay entregas validas para este cliente');
  }

  return exportOnePayload(
    payload,
    deliveryFileName(payload, session),
    session,
    payload.header.cliente_id
  );
}

/**
 * Auto-finalize a delivery session when the whole planilla has been delivered
 * and dispatched: every client in the plan must be fully delivered AND already
 * uploaded. Only then it locks the planilla (marks consumed) so the operator
 * does not need to hit "Exportar entrega" after sending the last client by
 * banner. Returns true if it finalized the session.
 */
export async function maybeAutoFinalizeDelivery(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) return false;

  const db = await getDatabase();
  const planClients = await db.getAllAsync<{ cliente_id: string }>(
    `SELECT DISTINCT cliente_id FROM delivery_plan_items`
  );
  if (planClients.length === 0) return false;

  const sent = await getSentDeliveryClientIds(sessionId);

  for (const { cliente_id } of planClients) {
    if (!sent.has(cliente_id)) return false;
    const completion = await getClientDeliveryCompletion(sessionId, cliente_id);
    if (!completion.isComplete) return false;
  }

  await updateSessionStatus(sessionId, 'exported');
  await markDeliveryPlanConsumed(
    session.manifest_id,
    session.manifest_version,
    session.load_id
  );
  return true;
}

export async function exportDeliverySession(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('Sesion no encontrada');

  const payloads = await buildDeliveryExportPayloads(sessionId);
  if (payloads.length === 0) {
    throw new Error('No hay entregas validas para exportar');
  }

  // Skip clients already sent individually during the session (buffer).
  const alreadySent = await getSentDeliveryClientIds(sessionId);
  const pending = payloads.filter((payload) => !alreadySent.has(payload.header.cliente_id));

  let uploadedCount = 0;
  for (const payload of pending) {
    const result = await exportOnePayload(
      payload,
      deliveryFileName(payload, session),
      session,
      payload.header.cliente_id
    );
    if (result === 'uploaded') uploadedCount++;
  }

  await updateSessionStatus(
    sessionId,
    uploadedCount === pending.length ? 'exported' : 'closed'
  );
  await markDeliveryPlanConsumed(
    session.manifest_id,
    session.manifest_version,
    session.load_id
  );
  return true;
}

export async function exportAndShare(
  sessionId: string,
  _deviceId?: string,
  _userName?: string,
  mode: WorkMode = 'preparation'
): Promise<boolean> {
  return mode === 'delivery'
    ? await exportDeliverySession(sessionId)
    : await exportPreparationSession(sessionId);
}

/**
 * Legacy name kept for callers. V2 keeps history and only marks the session closed/exported.
 */
export async function purgeSession(sessionId: string): Promise<void> {
  await updateSessionStatus(sessionId, 'closed');
  if (Platform.OS !== 'web') {
    Alert.alert('Historial conservado', 'La sesion queda guardada localmente.');
  }
}
