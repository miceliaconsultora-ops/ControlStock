import { getDatabase } from '../db/database';
import { MasterArticle } from '../types';

const BATCH_SIZE = 500;

/**
 * Parse a CSV string into MasterArticle[].
 * Expects headers: id_barra, cod_articulo, descripcion, peso_nominal, color
 */
export function parseCSV(csvText: string): MasterArticle[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idxIdBarra = headers.indexOf('id_barra');
  const idxCodArticulo = headers.indexOf('cod_articulo');
  const idxDescripcion = headers.indexOf('descripcion');
  const idxPeso = headers.indexOf('peso_nominal');
  const idxColor = headers.indexOf('color');

  const articles: MasterArticle[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
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
 * Non-blocking approach: inserts in chunks of BATCH_SIZE.
 * Returns the total number of records inserted/updated.
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

  // Save sync timestamp
  const db2 = await getDatabase();
  await db2.runAsync(
    `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync', ?)`,
    [new Date().toISOString()]
  );

  return inserted;
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
