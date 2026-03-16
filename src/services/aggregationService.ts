import { getDatabase } from '../db/database';
import { AggregatedArticle } from '../types';

/**
 * Aggregate scanned items for a session: group by cod_articulo,
 * compute SUM(peso_nominal) and COUNT(units).
 */
export async function getAggregatedData(
  sessionId: string
): Promise<AggregatedArticle[]> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<AggregatedArticle>(
    `SELECT 
       COALESCE(m.cod_articulo, 'SIN_CODIGO') as cod_articulo,
       COALESCE(m.descripcion, 'Artículo Desconocido') as descripcion,
       COUNT(s.id_barra) as total_units,
       COALESCE(SUM(m.peso_nominal), 0) as total_weight,
       COALESCE(m.color, '-') as color
     FROM session_scans s
     LEFT JOIN master_stock m ON s.id_barra = m.id_barra
     WHERE s.session_id = ?
     GROUP BY m.cod_articulo
     ORDER BY total_units DESC`,
    [sessionId]
  );

  return rows;
}

/**
 * Get global totals for a session.
 */
export async function getSessionTotals(
  sessionId: string
): Promise<{ totalUnits: number; totalWeight: number }> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ totalUnits: number; totalWeight: number }>(
    `SELECT 
       COUNT(s.id_barra) as totalUnits,
       COALESCE(SUM(m.peso_nominal), 0) as totalWeight
     FROM session_scans s
     LEFT JOIN master_stock m ON s.id_barra = m.id_barra
     WHERE s.session_id = ?`,
    [sessionId]
  );
  return {
    totalUnits: row?.totalUnits ?? 0,
    totalWeight: row?.totalWeight ?? 0,
  };
}
