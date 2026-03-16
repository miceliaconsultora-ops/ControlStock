import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDatabase } from '../db/database';
import { getAggregatedData } from './aggregationService';
import { getSessionScans } from './hydrationService';
import { ExportPayload } from '../types';

/**
 * Build the atomic JSON payload for a finished session.
 */
export async function buildExportPayload(
  sessionId: string,
  deviceId: string,
  userName: string
): Promise<ExportPayload> {
  const scans = await getSessionScans(sessionId);
  const aggregated = await getAggregatedData(sessionId);

  const payload: ExportPayload = {
    header: {
      device_id: deviceId,
      user: userName,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    },
    summary: aggregated.map((a) => ({
      cod_articulo: a.cod_articulo,
      total_units: a.total_units,
      total_weight: a.total_weight,
    })),
    raw_data: scans.map((s) => ({
      id_barra: s.id_barra,
      cod_articulo: s.cod_articulo ?? '',
      peso: s.peso_nominal ?? 0,
      color: s.color ?? '',
    })),
  };

  return payload;
}

/**
 * Write JSON to a local file and trigger the OS Share Sheet.
 * Returns true if sharing completed successfully.
 */
export async function exportAndShare(
  sessionId: string,
  deviceId: string,
  userName: string
): Promise<boolean> {
  const payload = await buildExportPayload(sessionId, deviceId, userName);
  const jsonString = JSON.stringify(payload, null, 2);

  const fileName = `Export_Lote_${sessionId.substring(0, 8)}_${Date.now()}.json`;
  const file = new File(Paths.cache, fileName);

  // Write to cache
  file.create();
  file.write(jsonString);

  // Check if sharing is available
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device.');
  }

  // Trigger share sheet
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: `Exportar Lote ${sessionId.substring(0, 8)}`,
    UTI: 'public.json',
  });

  return true;
}

/**
 * Purge all scans for a given session after successful export.
 */
export async function purgeSession(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM session_scans WHERE session_id = ?`,
    [sessionId]
  );
}

