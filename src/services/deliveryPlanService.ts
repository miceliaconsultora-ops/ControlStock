import { getDatabase } from '../db/database';
import { DeliveryPlanItem } from '../types';
import { API_CONSTANTS } from '../constants/api';
import { parseCsvRows } from './syncService';

const BATCH_SIZE = 500;
const CONSUMED_MANIFEST_ID_KEY = 'delivery_consumed_manifest_id';
const CONSUMED_MANIFEST_VERSION_KEY = 'delivery_consumed_manifest_version';
const CONSUMED_AT_KEY = 'delivery_consumed_at';
const CONSUMED_LOAD_ID_KEY = 'delivery_consumed_load_id';

function requireColumn(headers: string[], columnName: string): number {
  const index = headers.indexOf(columnName);
  if (index === -1) {
    throw new Error(`CSV invalido: falta la columna ${columnName}`);
  }
  return index;
}

export function parseDeliveryPlanCSV(csvText: string): DeliveryPlanItem[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idxManifest = requireColumn(headers, 'manifest_id');
  const idxVersion = requireColumn(headers, 'manifest_version');
  const idxClientId = requireColumn(headers, 'cliente_id');
  const idxClientName = requireColumn(headers, 'cliente_nombre');
  const idxIdBarra = requireColumn(headers, 'id_barra');
  const idxCode = requireColumn(headers, 'cod_articulo');
  const idxDescription = requireColumn(headers, 'descripcion');
  const idxWeight = requireColumn(headers, 'peso_nominal');
  const idxColor = requireColumn(headers, 'color');

  const items: DeliveryPlanItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const idBarra = cols[idxIdBarra]?.trim();
    if (!idBarra) continue;

    items.push({
      manifest_id: cols[idxManifest] || 'SIN_MANIFIESTO',
      manifest_version: cols[idxVersion] || '0',
      cliente_id: cols[idxClientId] || 'SIN_CLIENTE',
      cliente_nombre: cols[idxClientName] || 'Cliente sin nombre',
      id_barra: idBarra,
      cod_articulo: cols[idxCode] || '',
      descripcion: cols[idxDescription] || '',
      peso_nominal: parseFloat(cols[idxWeight]) || 0,
      color: cols[idxColor] || '',
    });
  }

  return items;
}

export async function syncDeliveryPlanFromCsvText(
  csvText: string,
  onProgress?: (percent: number) => void
): Promise<number> {
  const items = parseDeliveryPlanCSV(csvText);
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync('DELETE FROM delivery_plan_items');

  let inserted = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    await db.withTransactionAsync(async () => {
      for (const item of batch) {
        await db.runAsync(
          `INSERT OR REPLACE INTO delivery_plan_items (
             id_barra, manifest_id, manifest_version, cliente_id,
             cliente_nombre, cod_articulo, descripcion,
             peso_nominal, color, last_updated
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id_barra,
            item.manifest_id,
            item.manifest_version,
            item.cliente_id,
            item.cliente_nombre,
            item.cod_articulo,
            item.descripcion,
            item.peso_nominal,
            item.color,
            now,
          ]
        );
      }
    });

    inserted += batch.length;
    onProgress?.(Math.round((inserted / Math.max(items.length, 1)) * 100));
  }

  const first = items[0];
  const newManifestId = first?.manifest_id ?? '';
  const newManifestVersion = first?.manifest_version ?? '';
  const consumed = await getConsumedDeliveryPlan();
  const shouldClearConsumed =
    consumed.isConsumed &&
    (consumed.manifestId !== newManifestId ||
      consumed.manifestVersion !== newManifestVersion);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('delivery_plan_last_sync', ?)`,
      [now]
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('delivery_manifest_id', ?)`,
      [newManifestId]
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('delivery_manifest_version', ?)`,
      [newManifestVersion]
    );
    if (shouldClearConsumed) {
      await db.runAsync(
        `DELETE FROM sync_meta WHERE key IN (?, ?, ?, ?)`,
        [
          CONSUMED_MANIFEST_ID_KEY,
          CONSUMED_MANIFEST_VERSION_KEY,
          CONSUMED_AT_KEY,
          CONSUMED_LOAD_ID_KEY,
        ]
      );
    }
  });

  return inserted;
}

export async function getConsumedDeliveryPlan(): Promise<{
  isConsumed: boolean;
  manifestId: string | null;
  manifestVersion: string | null;
  consumedAt: string | null;
  loadId: string | null;
}> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM sync_meta WHERE key IN (?, ?, ?, ?)`,
    [
      CONSUMED_MANIFEST_ID_KEY,
      CONSUMED_MANIFEST_VERSION_KEY,
      CONSUMED_AT_KEY,
      CONSUMED_LOAD_ID_KEY,
    ]
  );
  const meta = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    isConsumed: Boolean(meta[CONSUMED_MANIFEST_ID_KEY] && meta[CONSUMED_MANIFEST_VERSION_KEY]),
    manifestId: meta[CONSUMED_MANIFEST_ID_KEY] || null,
    manifestVersion: meta[CONSUMED_MANIFEST_VERSION_KEY] || null,
    consumedAt: meta[CONSUMED_AT_KEY] || null,
    loadId: meta[CONSUMED_LOAD_ID_KEY] || null,
  };
}

export async function isDeliveryPlanConsumed(
  manifestId?: string | null,
  manifestVersion?: string | null
): Promise<boolean> {
  if (!manifestId || !manifestVersion) return false;
  const consumed = await getConsumedDeliveryPlan();
  return (
    consumed.manifestId === manifestId &&
    consumed.manifestVersion === manifestVersion
  );
}

export async function markDeliveryPlanConsumed(
  manifestId: string | null | undefined,
  manifestVersion: string | null | undefined,
  loadId: string | null | undefined
): Promise<void> {
  if (!manifestId || !manifestVersion) return;
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)`,
      [CONSUMED_MANIFEST_ID_KEY, manifestId]
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)`,
      [CONSUMED_MANIFEST_VERSION_KEY, manifestVersion]
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)`,
      [CONSUMED_AT_KEY, new Date().toISOString()]
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)`,
      [CONSUMED_LOAD_ID_KEY, loadId ?? '']
    );
  });
}

export async function getDeliveryPlanItem(idBarra: string): Promise<DeliveryPlanItem | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DeliveryPlanItem>(
    `SELECT * FROM delivery_plan_items WHERE id_barra = ?`,
    [idBarra]
  );
  return row ?? null;
}

export async function getDeliveryPlanStats(): Promise<{
  totalItems: number;
  totalClients: number;
  lastSync: string | null;
  manifestId: string | null;
  manifestVersion: string | null;
  isConsumed: boolean;
  consumedAt: string | null;
  consumedLoadId: string | null;
}> {
  const db = await getDatabase();
  const counts = await db.getFirstAsync<{
    totalItems: number;
    totalClients: number;
  }>(
    `SELECT
       COUNT(*) as totalItems,
       COUNT(DISTINCT cliente_id) as totalClients
     FROM delivery_plan_items`
  );
  const meta = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM sync_meta WHERE key IN (
       'delivery_plan_last_sync',
       'delivery_manifest_id',
       'delivery_manifest_version'
     )`
  );
  const metaMap = Object.fromEntries(meta.map((item) => [item.key, item.value]));

  const manifestId = metaMap.delivery_manifest_id || null;
  const manifestVersion = metaMap.delivery_manifest_version || null;
  const consumed = await getConsumedDeliveryPlan();

  return {
    totalItems: counts?.totalItems ?? 0,
    totalClients: counts?.totalClients ?? 0,
    lastSync: metaMap.delivery_plan_last_sync ?? null,
    manifestId,
    manifestVersion,
    isConsumed:
      Boolean(manifestId && manifestVersion) &&
      consumed.manifestId === manifestId &&
      consumed.manifestVersion === manifestVersion,
    consumedAt: consumed.consumedAt,
    consumedLoadId: consumed.loadId,
  };
}

export async function checkDeliveryPlanCloudUpdate(): Promise<{
  hasUpdate: boolean;
  lastUpdated?: number;
  fileName?: string;
}> {
  if (!API_CONSTANTS.GOOGLE_SCRIPT_URL) return { hasUpdate: false };

  try {
    const response = await fetch(
      `${API_CONSTANTS.GOOGLE_SCRIPT_URL}?dataset=delivery&action=check`
    );
    const data = await response.json();
    if (data.status !== 'success') {
      throw new Error(data.message || 'No se pudo verificar preparado');
    }

    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM sync_meta WHERE key = 'delivery_cloud_last_updated'`
    );
    const localTimestamp = row?.value ? parseInt(row.value, 10) : 0;

    return {
      hasUpdate: data.lastUpdated > localTimestamp,
      lastUpdated: data.lastUpdated,
      fileName: data.fileName,
    };
  } catch (error) {
    console.warn('Failed to check delivery plan cloud update.', error);
    return { hasUpdate: false };
  }
}

export async function syncDeliveryPlanFromCloud(
  onProgress?: (percent: number) => void
): Promise<number> {
  if (!API_CONSTANTS.GOOGLE_SCRIPT_URL) {
    throw new Error('No hay URL cloud configurada');
  }

  const updateInfo = await checkDeliveryPlanCloudUpdate();
  if (!updateInfo.hasUpdate || !updateInfo.lastUpdated) return 0;

  const response = await fetch(
    `${API_CONSTANTS.GOOGLE_SCRIPT_URL}?dataset=delivery&action=download`
  );
  const csvText = await response.text();
  const count = await syncDeliveryPlanFromCsvText(csvText, onProgress);

  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('delivery_cloud_last_updated', ?)`,
    [updateInfo.lastUpdated.toString()]
  );

  return count;
}
