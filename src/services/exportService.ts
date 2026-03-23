import { Platform, Alert } from 'react-native';
import { getDatabase } from '../db/database';
import { getAggregatedData } from './aggregationService';
import { getSessionScans } from './hydrationService';
import { ExportPayload } from '../types';
import { API_CONSTANTS } from '../constants/api';

/**
 * Build the atomic JSON payload for a finished session.
 * The payload groups raw_data by cod_articulo so each summary item
 * includes the list of individual roll IDs (id_barra) inside it.
 */
export async function buildExportPayload(
  sessionId: string,
  deviceId: string,
  userName: string
): Promise<ExportPayload> {
  const scans = await getSessionScans(sessionId);
  const aggregated = await getAggregatedData(sessionId);

  // Build a map of cod_articulo -> array of roll details
  const rollsByArticle: Record<string, Array<{ id_barra: string; peso: number }>> = {};

  for (const s of scans) {
    const code = s.cod_articulo ?? 'SIN_CODIGO';
    if (!rollsByArticle[code]) {
      rollsByArticle[code] = [];
    }
    rollsByArticle[code].push({
      id_barra: s.id_barra,
      peso: s.peso_nominal ?? 0,
    });
  }

  const payload: ExportPayload = {
    header: {
      device_id: deviceId,
      user: userName,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    },
    summary: aggregated.map((a) => ({
      cod_articulo: a.cod_articulo,
      descripcion: a.descripcion,
      color: a.color,
      total_units: a.total_units,
      total_weight: a.total_weight,
      rollos: rollsByArticle[a.cod_articulo] ?? [],
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
 * Export and share the session payload.
 * Attempts to upload to Google Apps Script first.
 * On failure, fallbacks to local sharing.
 */
export async function exportAndShare(
  sessionId: string,
  deviceId: string,
  userName: string
): Promise<boolean> {
  const payload = await buildExportPayload(sessionId, deviceId, userName);
  const jsonString = JSON.stringify(payload, null, 2);
  const fileName = `Export_Lote_${sessionId.substring(0, 12)}_${Date.now()}.json`;

  // 1. Intentar subir automáticamente a la nube (Google Drive)
  try {
    if (API_CONSTANTS.GOOGLE_SCRIPT_URL) {
      console.log('Iniciando subida automática a la nube...');
      const response = await fetch(API_CONSTANTS.GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8', 
        },
        body: jsonString,
      });
      
      const result = await response.json();
      if (result.status === 'success') {
        console.log('Subida exitosa:', result.message);
        if (Platform.OS === 'web') {
          alert('¡Lote respaldado automáticamente en la nube (Drive)!');
        } else {
          Alert.alert('✅ Subida a Nube Exitosa', 'El lote se respaldó correctamente de forma automática.');
        }
        return true; // Éxito total, podemos purgar la sesión
      } else {
        console.error('La subida automática falló, pasando a plan B (local):', result.message);
      }
    }
  } catch (error) {
    console.warn('No se pudo conectar con la nube, usando modo offline local:', error);
  }

  // 2. Plan B: Si la nube falla o estamos sin internet, usamos el exportador local
  if (Platform.OS === 'web') {
    // Web: trigger browser download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } else {
    // Native: use expo-file-system + expo-sharing
    const { File, Paths } = await import('expo-file-system');
    const Sharing = await import('expo-sharing');

    const file = new File(Paths.cache, fileName);
    file.create();
    file.write(jsonString);

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Sharing is not available on this device.');
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: `Exportar Lote ${sessionId.substring(0, 8)}`,
      UTI: 'public.json',
    });

    return true;
  }
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
