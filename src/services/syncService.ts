import { getDatabase } from '../db/database';
import { MasterArticle } from '../types';
import { API_CONSTANTS } from '../constants/api';

const BATCH_SIZE = 500;

/**
 * Parse CSV text into rows. Supports quoted fields and CRLF line endings.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function requireCsvColumn(headers: string[], columnName: string): number {
  const index = headers.indexOf(columnName);
  if (index === -1) {
    throw new Error(`CSV invalido: falta la columna ${columnName}`);
  }
  return index;
}

/**
 * Parse a CSV string into MasterArticle[].
 * Expects headers: id_barra, cod_articulo, descripcion, peso_nominal, color
 */
export function parseCSV(csvText: string): MasterArticle[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idxIdBarra = requireCsvColumn(headers, 'id_barra');
  const idxCodArticulo = requireCsvColumn(headers, 'cod_articulo');
  const idxDescripcion = requireCsvColumn(headers, 'descripcion');
  const idxPeso = requireCsvColumn(headers, 'peso_nominal');
  const idxColor = requireCsvColumn(headers, 'color');

  const articles: MasterArticle[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols[idxIdBarra]) continue;

    articles.push({
      id_barra: cols[idxIdBarra],
      cod_articulo: cols[idxCodArticulo] || '',
      descripcion: cols[idxDescripcion] || '',
      peso_nominal: parseFloat(cols[idxPeso]) || 0,
      color: cols[idxColor] || '',
    });
  }

  return articles;
}

/**
 * Insert articles into master_stock in batched transactions.
 */
export async function bulkInsertArticles(
  articles: MasterArticle[],
  onProgress?: (percent: number) => void
): Promise<number> {
  const db = await getDatabase();
  const total = articles.length;
  let inserted = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      for (const art of batch) {
        await db.runAsync(
          `INSERT OR REPLACE INTO master_stock 
           (id_barra, cod_articulo, descripcion, peso_nominal, color, last_updated) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [art.id_barra, art.cod_articulo, art.descripcion, art.peso_nominal, art.color, now]
        );
      }
    });

    inserted += batch.length;
    onProgress?.(Math.round((inserted / total) * 100));
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync', ?)`,
    [new Date().toISOString()]
  );

  return inserted;
}

/**
 * Sync from a raw CSV string (compatible with all platforms including web).
 */
export async function syncFromCsvText(
  csvText: string,
  onProgress?: (percent: number) => void
): Promise<number> {
  const articles = parseCSV(csvText);
  return await bulkInsertArticles(articles, onProgress);
}

/**
 * Load mock data from local CSV via fetch (web-compatible).
 * On web: pass a relative URL like '/assets/mock_articles.csv'
 * On native: pass the require()'d module number and it will use fetch via the asset server
 */
export async function syncFromLocalAsset(
  assetUrlOrModule: string | number,
  onProgress?: (percent: number) => void
): Promise<number> {
  let csvText: string;

  if (typeof assetUrlOrModule === 'string') {
    // Web mode — just fetch the URL
    const response = await fetch(assetUrlOrModule);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
    }
    csvText = await response.text();
  } else {
    // Native mode — use expo-asset
    const { Asset } = await import('expo-asset');
    const { readAsStringAsync } = await import('expo-file-system');
    const asset = Asset.fromModule(assetUrlOrModule);
    if (!asset.localUri) {
      await asset.downloadAsync();
    }
    csvText = await readAsStringAsync(asset.localUri || asset.uri);
  }

  return await syncFromCsvText(csvText, onProgress);
}

/**
 * Get the last sync timestamp from local metadata.
 */
export async function getLastSyncTimestamp(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM sync_meta WHERE key = 'last_sync'`
  );
  return row?.value ?? null;
}

/**
 * Get total count of master articles in the local database.
 */
export async function getMasterCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM master_stock`
  );
  return row?.cnt ?? 0;
}

/**
 * Check if the CSV in Google Drive has been updated.
 */
export async function checkCloudUpdate(): Promise<{ hasUpdate: boolean; lastUpdated?: number }> {
  if (!API_CONSTANTS.GOOGLE_SCRIPT_URL) return { hasUpdate: false };
  
  try {
    const response = await fetch(`${API_CONSTANTS.GOOGLE_SCRIPT_URL}?action=check`);
    const data = await response.json();
    
    if (data.status === 'success') {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM sync_meta WHERE key = 'cloud_last_updated'`
      );
      const localTimestamp = row?.value ? parseInt(row.value, 10) : 0;
      
      if (data.lastUpdated > localTimestamp) {
        return { hasUpdate: true, lastUpdated: data.lastUpdated };
      }
    }
  } catch (error) {
    console.warn('Failed to check cloud update. Working offline.', error);
  }
  return { hasUpdate: false };
}

/**
 * Fetch and sync the latest CSV from Google Drive if there's an update.
 */
export async function syncFromCloud(onProgress?: (percent: number) => void): Promise<number> {
  if (!API_CONSTANTS.GOOGLE_SCRIPT_URL) {
    throw new Error('No Cloud URL Configure');
  }
  
  const updateInfo = await checkCloudUpdate();
  if (!updateInfo.hasUpdate || !updateInfo.lastUpdated) {
    return 0; // No updates needed
  }
  
  const response = await fetch(`${API_CONSTANTS.GOOGLE_SCRIPT_URL}?action=download`);
  const csvText = await response.text();
  
  const count = await syncFromCsvText(csvText, onProgress);
  
  // Save new timestamp
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('cloud_last_updated', ?)`,
    [updateInfo.lastUpdated.toString()]
  );
  
  return count;
}
